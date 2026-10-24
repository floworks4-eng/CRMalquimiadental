-- Corrige el aviso de db lint: asignacion de text a enum sin cast explicito en public_book (comportamiento identico).
create or replace function public.public_book(
  p_clinic uuid, p_treatment uuid, p_starts_at timestamptz, p_name text, p_phone text,
  p_consent_data boolean, p_consent_whatsapp boolean, p_utm jsonb, p_token_hash bytea, p_ip_hash text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c public.clinics; v_dur integer; v_tz text; v_day date; v_patient uuid; v_appt uuid; v_campaign uuid; v_source public.appointment_source;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'); v_cons public.consent_versions; v_wa public.consent_versions;
  cand record; v_exp timestamptz; v_end timestamptz; v_dentist uuid; v_cabinet uuid; r record;
begin
  select * into c from public.clinics where id = p_clinic;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select duration_min into v_dur from public.treatments where id = p_treatment and clinic_id = p_clinic and active and bookable_online;
  if v_dur is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_tz := c.timezone;

  if char_length(v_name) < 3 or char_length(v_name) > 120 or v_name !~ '\S+\s+\S+' then raise exception 'INVALID_PAYLOAD' using detail = 'name', errcode = 'P0001'; end if;
  if p_phone is null or p_phone !~ '^\+591[67][0-9]{7}$' then raise exception 'INVALID_PAYLOAD' using detail = 'phone', errcode = 'P0001'; end if;
  if p_consent_data is not true then raise exception 'INVALID_PAYLOAD' using detail = 'consent', errcode = 'P0001'; end if;
  v_cons := public.current_consent(p_clinic, 'data_processing');
  if v_cons.id is null or (v_cons.draft and not c.allow_draft_legal) then raise exception 'CONSENT_NOT_READY' using errcode = 'P0001'; end if;
  if p_starts_at < now() + interval '2 hours' or p_starts_at > now() + interval '60 days' then raise exception 'OUT_OF_RANGE' using errcode = 'P0001'; end if;

  -- Campana por utm_campaign (solo si existe y esta activa); si no, canal web.
  select id into v_campaign from public.campaigns where clinic_id = p_clinic and active and utm_campaign = nullif(p_utm ->> 'utm_campaign', '');
  v_source := case when v_campaign is not null then 'campaign'::public.appointment_source else 'web'::public.appointment_source end;

  select id into v_patient from public.patients where clinic_id = p_clinic and phone_e164 = p_phone;
  if v_patient is not null then
    if (select count(*) from public.appointments where patient_id = v_patient and status in ('scheduled', 'confirmed') and starts_at > now()) >= 3 then
      raise exception 'TOO_MANY' using errcode = 'P0001';
    end if;
  end if;

  v_end := p_starts_at + make_interval(mins => v_dur);
  v_day := (p_starts_at at time zone v_tz)::date;
  -- Se prueba cada odontologo/gabinete libre (el menos cargado del dia primero) hasta que uno acepte: la exclusion decide.
  for cand in
    select s.slot_dentist, s.slot_cabinet from public.slots_core(p_clinic, p_treatment, v_day, v_day, null, 15) s
     where s.slot_start = p_starts_at
     order by (select count(*) from public.appointments a where a.dentist_id = s.slot_dentist and a.starts_at >= p_starts_at - interval '1 day' and a.starts_at < p_starts_at + interval '1 day' and a.status not in ('cancelled', 'no_show')), s.slot_dentist
  loop
    if v_patient is null then
      insert into public.patients (clinic_id, full_name, normalized_name, phone_e164, phone_raw, first_source, first_campaign_id, status)
      values (p_clinic, v_name, lower(translate(v_name, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), p_phone, p_phone, v_source, v_campaign, 'new')
      returning id into v_patient;
    end if;
    begin
      insert into public.appointments (clinic_id, patient_id, dentist_id, cabinet_id, treatment_id, starts_at, ends_at, source, campaign_id)
      values (p_clinic, v_patient, cand.slot_dentist, cand.slot_cabinet, p_treatment, p_starts_at, v_end, v_source, v_campaign)
      returning id into v_appt;
      v_dentist := cand.slot_dentist; v_cabinet := cand.slot_cabinet;
      exit;
    exception when exclusion_violation then
      continue;
    end;
  end loop;
  if v_appt is null then raise exception 'SLOT_TAKEN' using errcode = 'P0001'; end if;

  insert into public.patient_consents (patient_id, consent_version_id, granted, channel, evidence)
  values (v_patient, v_cons.id, true, 'web', jsonb_build_object('body_hash', v_cons.body_hash, 'version', v_cons.version, 'ip_hash', p_ip_hash));
  v_wa := public.current_consent(p_clinic, 'whatsapp_reminders');
  if p_consent_whatsapp is true and v_wa.id is not null then
    insert into public.patient_consents (patient_id, consent_version_id, granted, channel, evidence)
    values (v_patient, v_wa.id, true, 'web', jsonb_build_object('body_hash', v_wa.body_hash, 'version', v_wa.version, 'ip_hash', p_ip_hash));
  end if;

  insert into public.attribution_touches (clinic_id, patient_id, appointment_id, source, campaign_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_path)
  values (p_clinic, v_patient, v_appt, v_source, v_campaign, left(p_utm ->> 'utm_source', 100), left(p_utm ->> 'utm_medium', 100), left(p_utm ->> 'utm_campaign', 100),
          left(p_utm ->> 'utm_content', 100), left(p_utm ->> 'utm_term', 100), left(p_utm ->> 'referrer', 300), left(p_utm ->> 'landing_path', 200));

  v_exp := p_starts_at + interval '2 hours';
  insert into public.checkin_tokens (clinic_id, appointment_id, token_hash, expires_at) values (p_clinic, v_appt, p_token_hash, v_exp);
  insert into public.appointment_events (clinic_id, appointment_id, to_status, reason) values (p_clinic, v_appt, 'scheduled', 'public_booking');
  insert into public.audit_log (clinic_id, action, entity_type, entity_id, patient_id, ip_hash)
  values (p_clinic, 'public.book', 'appointments', v_appt, v_patient, p_ip_hash);

  perform public.notify(p_clinic, v_dentist, 'appointment', 'Nueva cita desde la web', v_name || ' · ' || to_char(p_starts_at at time zone v_tz, 'DD/MM HH24:MI'), '/agenda');
  for r in select user_id from public.clinic_members where clinic_id = p_clinic and active and role = 'reception' loop
    perform public.notify(p_clinic, r.user_id, 'appointment', 'Nueva cita desde la web', v_name || ' · ' || to_char(p_starts_at at time zone v_tz, 'DD/MM HH24:MI'), '/agenda');
  end loop;

  return jsonb_build_object('appointment_id', v_appt, 'code', upper(substr(replace(v_appt::text, '-', ''), 1, 8)), 'expires_at', v_exp, 'cabinet', v_cabinet);
end $$;
revoke all on function public.public_book(uuid, uuid, timestamptz, text, text, boolean, boolean, jsonb, bytea, text) from public, anon, authenticated;
grant execute on function public.public_book(uuid, uuid, timestamptz, text, text, boolean, boolean, jsonb, bytea, text) to service_role;
