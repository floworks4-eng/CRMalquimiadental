-- Sprint 3 · Consentimientos, check-in por token y reserva publica.
-- Las funciones publicas NO las ejecuta `anon`: las llama el servidor de Next con service_role (el navegador nunca habla con
-- PostgREST para esto). Asi, tener la clave anon publica no da ninguna superficie de ataque sobre check-in ni reservas.
set search_path = public, extensions;

alter table public.treatments add column bookable_online boolean not null default false;
-- Mientras no exista un texto legal aprobado, el consentimiento es un borrador y NO se acepta en produccion.
alter table public.clinics add column allow_draft_legal boolean not null default false;

/* ───────── Consentimientos ───────── */
create table public.consent_versions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  type public.consent_type not null,
  version text not null,
  body_md text not null,
  body_hash text not null default '',
  draft boolean not null default true,
  effective_from timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (clinic_id, type, version)
);
create function public.consent_body_immutable() returns trigger language plpgsql set search_path = ''
as $$ begin
  if new.body_md <> old.body_md or new.type <> old.type or new.version <> old.version then
    raise exception 'IMMUTABLE: el texto de una version no se edita; publica una version nueva' using errcode = 'P0001';
  end if;
  return new;
end $$;
create function public.consent_set_hash() returns trigger language plpgsql set search_path = ''
as $$ begin
  new.body_hash := encode(sha256(convert_to(new.body_md, 'UTF8')), 'hex'); -- huella del texto exacto que acepto el paciente
  return new;
end $$;
create trigger consent_versions_hash before insert on public.consent_versions for each row execute function public.consent_set_hash();
create trigger consent_versions_immutable before update on public.consent_versions for each row execute function public.consent_body_immutable();

create table public.patient_consents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  consent_version_id uuid not null references public.consent_versions (id),
  granted boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  channel text not null check (channel in ('checkin', 'web', 'staff')),
  evidence jsonb,
  signature_path text,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index patient_consents_patient_idx on public.patient_consents (patient_id, created_at desc);
create trigger patient_consents_sync_clinic before insert or update of patient_id on public.patient_consents for each row execute function public.sync_clinic_from_patient();

/* ───────── Tokens de check-in ───────── */
create table public.checkin_tokens (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index checkin_tokens_appt_idx on public.checkin_tokens (appointment_id);

create table public.checkin_submissions (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null unique references public.checkin_tokens (id),
  appointment_id uuid not null references public.appointments (id),
  patient_id uuid not null references public.patients (id),
  anamnesis_version_id uuid references public.anamnesis_versions (id),
  ip_hash text,
  user_agent text,
  submitted_at timestamptz not null default now()
);

/* ───────── Atribucion y limites ───────── */
create table public.attribution_touches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid references public.patients (id),
  appointment_id uuid references public.appointments (id),
  source public.appointment_source not null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  referrer text, landing_path text,
  created_at timestamptz not null default now()
);

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  key text not null,
  at timestamptz not null default now()
);
create index rate_limit_events_key_idx on public.rate_limit_events (key, at desc);

alter table public.consent_versions enable row level security;
alter table public.patient_consents enable row level security;
alter table public.checkin_tokens enable row level security;
alter table public.checkin_submissions enable row level security;
alter table public.attribution_touches enable row level security;
alter table public.rate_limit_events enable row level security;

create policy consent_versions_select on public.consent_versions for select to authenticated using (public.is_staff(clinic_id));
create policy consent_versions_insert on public.consent_versions for insert to authenticated with check (public.is_admin(clinic_id));
create policy consent_versions_retire on public.consent_versions for update to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy patient_consents_select on public.patient_consents for select to authenticated using (public.can_read_clinical(patient_id));
create policy checkin_tokens_select on public.checkin_tokens for select to authenticated
  using (public.is_staff(clinic_id) and public.has_role(clinic_id, array['clinic_admin', 'reception']::public.member_role[]));
create policy touches_select on public.attribution_touches for select to authenticated using (public.is_admin(clinic_id));

grant select on public.consent_versions, public.patient_consents to authenticated;
grant insert (clinic_id, type, version, body_md, draft, effective_from) on public.consent_versions to authenticated;
grant update (retired_at) on public.consent_versions to authenticated;
grant select (id, clinic_id, appointment_id, expires_at, used_at, revoked_at, created_by, created_at) on public.checkin_tokens to authenticated; -- sin token_hash
grant select on public.attribution_touches to authenticated;

create trigger audit_consent_versions after insert or update on public.consent_versions for each row execute function public.audit_row();
create trigger audit_patient_consents after insert or update on public.patient_consents for each row execute function public.audit_row();
create trigger audit_checkin_tokens after insert or update on public.checkin_tokens for each row execute function public.audit_row();

/* ───────── Limite de intentos (lo usa el servidor con la huella de la IP) ───────── */
create function public.rate_limit_hit(p_key text, p_limit integer, p_window interval) returns void
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  delete from public.rate_limit_events where key = p_key and at < now() - interval '1 day';
  insert into public.rate_limit_events (key) values (p_key);
  select count(*) into n from public.rate_limit_events where key = p_key and at > now() - p_window;
  if n > p_limit then raise exception 'RATE_LIMITED' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.rate_limit_hit(text, integer, interval) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, interval) to service_role;

/* ───────── Texto de consentimiento vigente ───────── */
create function public.current_consent(p_clinic uuid, p_type public.consent_type) returns public.consent_versions
language sql stable security definer set search_path = ''
as $$
  select v.* from public.consent_versions v
  where v.clinic_id = p_clinic and v.type = p_type and v.retired_at is null and v.effective_from <= now()
  order by v.effective_from desc limit 1
$$;
revoke all on function public.current_consent(uuid, public.consent_type) from public, anon, authenticated;

/* ───────── Emitir token (recepcion / admin) ───────── */
create function public.issue_checkin_token(p_appointment uuid, p_token_hash bytea) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare a public.appointments; v_exp timestamptz;
begin
  select * into a from public.appointments where id = p_appointment for update;
  if not found or not public.can_use_appointment(a.clinic_id, a.dentist_id)
     or public.role_in(a.clinic_id) not in ('clinic_admin', 'reception') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if a.status not in ('scheduled', 'confirmed') then raise exception 'INVALID_STATE' using errcode = 'P0001'; end if;
  if now() < a.starts_at - interval '48 hours' then raise exception 'TOO_EARLY' using errcode = 'P0001'; end if;
  v_exp := a.starts_at + interval '2 hours';
  if v_exp <= now() then raise exception 'EXPIRED_APPT' using errcode = 'P0001'; end if;

  -- Un solo enlace vigente por cita.
  update public.checkin_tokens set revoked_at = now() where appointment_id = p_appointment and used_at is null and revoked_at is null;
  insert into public.checkin_tokens (clinic_id, appointment_id, token_hash, expires_at, created_by)
  values (a.clinic_id, p_appointment, p_token_hash, v_exp, (select auth.uid()));
  return v_exp;
end $$;
revoke all on function public.issue_checkin_token(uuid, bytea) from public, anon;
grant execute on function public.issue_checkin_token(uuid, bytea) to authenticated;

/* ───────── Contexto publico del enlace (sin datos clinicos) ───────── */
create function public.checkin_context(p_token_hash bytea) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  t public.checkin_tokens; a public.appointments; p public.patients; c public.clinics;
  v_consents jsonb;
begin
  select * into t from public.checkin_tokens where token_hash = p_token_hash;
  if not found or t.used_at is not null or t.revoked_at is not null or t.expires_at <= now() then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  select * into a from public.appointments where id = t.appointment_id;
  if a.status not in ('scheduled', 'confirmed') then raise exception 'NOT_AVAILABLE' using errcode = 'P0001'; end if;
  select * into p from public.patients where id = a.patient_id;
  select * into c from public.clinics where id = a.clinic_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'type', v.type, 'version', v.version, 'body_md', v.body_md, 'draft', v.draft)), '[]')
    into v_consents
    from (select (public.current_consent(a.clinic_id, ty)).* from unnest(enum_range(null::public.consent_type)) ty) v
   where v.id is not null and v.type in ('data_processing', 'clinical_treatment', 'whatsapp_reminders');

  return jsonb_build_object(
    'first_name', split_part(p.full_name, ' ', 1),
    'starts_at', a.starts_at,
    'clinic_name', c.name,
    'treatment', (select name from public.treatments where id = a.treatment_id),
    'dentist', (select full_name from public.profiles where id = a.dentist_id),
    'needs_birth_date', p.birth_date is null,
    'in_window', now() between a.starts_at - interval '2 hours' and a.starts_at + interval '2 hours',
    -- Listo si los dos textos obligatorios existen y no son borrador (el de WhatsApp es opcional).
    'legal_ready', (select count(*) = 2 and (c.allow_draft_legal or not bool_or((e ->> 'draft')::boolean))
                      from jsonb_array_elements(v_consents) e where e ->> 'type' in ('data_processing', 'clinical_treatment')),
    'consents', v_consents
  );
end $$;
revoke all on function public.checkin_context(bytea) from public, anon, authenticated;
grant execute on function public.checkin_context(bytea) to service_role;

-- Antes de subir la firma, el servidor necesita saber a que paciente pertenece el enlace.
create function public.checkin_target(p_token_hash bytea) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare t public.checkin_tokens; a public.appointments;
begin
  select * into t from public.checkin_tokens where token_hash = p_token_hash;
  if not found or t.used_at is not null or t.revoked_at is not null or t.expires_at <= now() then raise exception 'NOT_AVAILABLE' using errcode = 'P0001'; end if;
  select * into a from public.appointments where id = t.appointment_id;
  if a.status not in ('scheduled', 'confirmed') then raise exception 'NOT_AVAILABLE' using errcode = 'P0001'; end if;
  return jsonb_build_object('clinic_id', a.clinic_id, 'patient_id', a.patient_id);
end $$;
revoke all on function public.checkin_target(bytea) from public, anon, authenticated;
grant execute on function public.checkin_target(bytea) to service_role;

/* ───────── Enviar check-in (atomico) ───────── */
create function public.submit_checkin(p_token_hash bytea, p_payload jsonb, p_ip_hash text default null, p_user_agent text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t public.checkin_tokens; a public.appointments; p public.patients; c public.clinics;
  v_clin public.consent_versions; v_data public.consent_versions; v_wa public.consent_versions;
  v_allergies text[]; v_conditions text[]; v_sig text; v_anam uuid; v_birth date; v_alert text; v_tz text; r record;
begin
  select * into t from public.checkin_tokens where token_hash = p_token_hash for update;
  if not found or t.used_at is not null or t.revoked_at is not null or t.expires_at <= now() then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  select * into a from public.appointments where id = t.appointment_id for update;
  if a.status not in ('scheduled', 'confirmed') then raise exception 'NOT_AVAILABLE' using errcode = 'P0001'; end if;
  if now() not between a.starts_at - interval '2 hours' and a.starts_at + interval '2 hours' then raise exception 'OUT_OF_WINDOW' using errcode = 'P0001'; end if;
  select * into p from public.patients where id = a.patient_id;
  select * into c from public.clinics where id = a.clinic_id;
  v_tz := c.timezone;

  v_clin := public.current_consent(a.clinic_id, 'clinical_treatment');
  v_data := public.current_consent(a.clinic_id, 'data_processing');
  v_wa := public.current_consent(a.clinic_id, 'whatsapp_reminders');
  if v_clin.id is null or v_data.id is null or ((v_clin.draft or v_data.draft) and not c.allow_draft_legal) then
    raise exception 'CONSENT_NOT_READY' using errcode = 'P0001';
  end if;

  -- Respaldo de la validacion de Zod en el servidor.
  v_allergies := array(select jsonb_array_elements_text(coalesce(p_payload -> 'allergies', '[]')));
  v_conditions := array(select jsonb_array_elements_text(coalesce(p_payload -> 'conditions', '[]')));
  if coalesce(array_length(v_allergies, 1), 0) = 0 and nullif(trim(p_payload ->> 'allergy_other'), '') is null then raise exception 'INVALID_PAYLOAD' using detail = 'allergies', errcode = 'P0001'; end if;
  if coalesce(array_length(v_conditions, 1), 0) = 0 then raise exception 'INVALID_PAYLOAD' using detail = 'conditions', errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_payload ->> 'reason', ''))) < 3 then raise exception 'INVALID_PAYLOAD' using detail = 'reason', errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_payload ->> 'emergency_contact_name', ''))) < 3 or char_length(trim(coalesce(p_payload ->> 'emergency_contact_phone', ''))) < 6 then raise exception 'INVALID_PAYLOAD' using detail = 'emergency_contact', errcode = 'P0001'; end if;
  if coalesce((p_payload ->> 'consent_clinical')::boolean, false) is not true or coalesce((p_payload ->> 'consent_data')::boolean, false) is not true then raise exception 'INVALID_PAYLOAD' using detail = 'consent', errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_payload ->> 'signature_name', ''))) < 5 then raise exception 'INVALID_PAYLOAD' using detail = 'signature', errcode = 'P0001'; end if;
  v_sig := nullif(p_payload ->> 'signature_path', '');
  if v_sig is not null and v_sig !~ ('^' || a.clinic_id || '/' || a.patient_id || '/[0-9a-f-]{36}\.png$') then raise exception 'INVALID_PAYLOAD' using detail = 'signature_path', errcode = 'P0001'; end if;
  v_birth := nullif(p_payload ->> 'birth_date', '')::date;
  if v_birth is not null and (v_birth > current_date or v_birth < current_date - interval '120 years') then raise exception 'INVALID_PAYLOAD' using detail = 'birth_date', errcode = 'P0001'; end if;

  insert into public.anamnesis_versions (patient_id, allergies, allergy_other, conditions, medications, reason, emergency_contact_name, emergency_contact_phone, pregnancy, anticoagulants, source)
  values (a.patient_id, v_allergies, nullif(trim(p_payload ->> 'allergy_other'), ''), v_conditions, nullif(trim(p_payload ->> 'medications'), ''), trim(p_payload ->> 'reason'),
          trim(p_payload ->> 'emergency_contact_name'), trim(p_payload ->> 'emergency_contact_phone'),
          (p_payload ->> 'pregnancy')::boolean, (p_payload ->> 'anticoagulants')::boolean, 'patient_checkin')
  returning id into v_anam;

  if v_birth is not null and p.birth_date is null then update public.patients set birth_date = v_birth where id = a.patient_id; end if;

  -- Evidencia: quien, cuando, version del texto y su hash. La firma dibujada va en Storage (signature_path).
  insert into public.patient_consents (patient_id, consent_version_id, granted, channel, evidence, signature_path)
  select a.patient_id, v.id, true, 'checkin',
         jsonb_build_object('signature_name', trim(p_payload ->> 'signature_name'), 'body_hash', v.body_hash, 'version', v.version, 'appointment_id', a.id, 'ip_hash', p_ip_hash),
         v_sig
    from (values (v_clin.id), (v_data.id)) as x (vid) join public.consent_versions v on v.id = x.vid;
  if coalesce((p_payload ->> 'consent_whatsapp')::boolean, false) and v_wa.id is not null then
    insert into public.patient_consents (patient_id, consent_version_id, granted, channel, evidence)
    values (a.patient_id, v_wa.id, true, 'checkin', jsonb_build_object('body_hash', v_wa.body_hash, 'version', v_wa.version, 'appointment_id', a.id));
  end if;

  update public.checkin_tokens set used_at = now() where id = t.id;
  insert into public.checkin_submissions (token_id, appointment_id, patient_id, anamnesis_version_id, ip_hash, user_agent)
  values (t.id, a.id, a.patient_id, v_anam, p_ip_hash, left(p_user_agent, 300));
  update public.appointments set status = 'checked_in', checked_in_at = now() where id = a.id;
  insert into public.appointment_events (clinic_id, appointment_id, from_status, to_status, reason) values (a.clinic_id, a.id, a.status, 'checked_in', 'checkin_qr');
  insert into public.audit_log (clinic_id, action, entity_type, entity_id, patient_id, ip_hash, user_agent)
  values (a.clinic_id, 'checkin.submit', 'appointments', a.id, a.patient_id, p_ip_hash, left(p_user_agent, 300));

  -- El odontologo ve la alerta con alergias; recepcion solo que el paciente llego.
  v_alert := array_to_string(array_remove(v_allergies || array[nullif(trim(p_payload ->> 'allergy_other'), '')], 'Ninguna'), ', ');
  perform public.notify(a.clinic_id, a.dentist_id, 'checkin', p.full_name || ' está en sala de espera',
    to_char(a.starts_at at time zone v_tz, 'HH24:MI') || case when coalesce(v_alert, '') <> '' then ' · ⚠ Alergias: ' || v_alert else '' end, '/agenda');
  for r in select user_id from public.clinic_members where clinic_id = a.clinic_id and active and role in ('reception', 'clinic_admin') and user_id <> a.dentist_id loop
    perform public.notify(a.clinic_id, r.user_id, 'checkin', p.full_name || ' hizo check-in', to_char(a.starts_at at time zone v_tz, 'HH24:MI'), '/recepcion');
  end loop;

  return jsonb_build_object('appointment_id', a.id);
end $$;
revoke all on function public.submit_checkin(bytea, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.submit_checkin(bytea, jsonb, text, text) to service_role;

/* ───────── Reserva publica ───────── */
create function public.public_slots(p_clinic uuid, p_treatment uuid, p_from date, p_to date) returns table (slot_start timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_tz text; v_today date; v_from date; v_to date;
begin
  if not exists (select 1 from public.treatments where id = p_treatment and clinic_id = p_clinic and active and bookable_online) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  v_tz := public.local_tz(p_clinic);
  v_today := (now() at time zone v_tz)::date;
  v_from := greatest(p_from, v_today);
  v_to := least(p_to, v_today + 60, v_from + 31); -- horizonte de 60 dias; ventanas de a lo mas 31 dias
  if v_to < v_from then return; end if;
  return query
    select distinct s.slot_start
      from public.slots_core(p_clinic, p_treatment, v_from, v_to, null, 30) s
     where s.slot_start >= now() + interval '2 hours' -- anticipacion minima
     order by 1;
end $$;
revoke all on function public.public_slots(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.public_slots(uuid, uuid, date, date) to service_role;

create function public.public_book(
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
  v_source := case when v_campaign is not null then 'campaign' else 'web' end;

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

/* ───────── Texto legal vigente para las paginas publicas ───────── */
create function public.public_consent_texts(p_clinic uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('type', v.type, 'version', v.version, 'body_md', v.body_md, 'draft', v.draft, 'hash', v.body_hash, 'effective_from', v.effective_from)), '[]')
    from (select (public.current_consent(p_clinic, ty)).* from unnest(enum_range(null::public.consent_type)) ty) v where v.id is not null
$$;
revoke all on function public.public_consent_texts(uuid) from public, anon, authenticated;
grant execute on function public.public_consent_texts(uuid) to service_role;
