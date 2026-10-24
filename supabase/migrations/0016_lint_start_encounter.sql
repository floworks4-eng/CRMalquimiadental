-- db lint: variable sin uso en start_encounter (mismo comportamiento).
set search_path = public, extensions;

create or replace function public.start_encounter(p_appointment uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments; r public.member_role; v_id uuid; v_reason text;
begin
  select * into a from public.appointments where id = p_appointment for update;
  if not found or not public.can_use_appointment(a.clinic_id, a.dentist_id) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  r := public.role_in(a.clinic_id);
  if not (r = 'clinic_admin' or (r = 'dentist' and a.dentist_id = (select auth.uid()))) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select id into v_id from public.encounters where appointment_id = p_appointment;
  if v_id is not null then return v_id; end if; -- ya iniciada (reintento o segunda pestaña)
  if a.status not in ('scheduled', 'confirmed', 'checked_in') then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;

  select reason into v_reason from public.v_current_anamnesis where patient_id = a.patient_id;
  insert into public.encounters (clinic_id, patient_id, appointment_id, dentist_id, status, chief_complaint)
  values (a.clinic_id, a.patient_id, a.id, a.dentist_id, 'in_progress',
          coalesce(v_reason, (select name from public.treatments where id = a.treatment_id)))
  returning id into v_id;

  update public.appointments
     set status = 'in_progress', started_at = now(), checked_in_at = coalesce(checked_in_at, now())
   where id = a.id;
  insert into public.appointment_events (clinic_id, appointment_id, from_status, to_status, actor_id)
  values (a.clinic_id, a.id, a.status, 'in_progress', (select auth.uid()));
  update public.patients set status = 'active' where id = a.patient_id and status = 'new';

  -- El tratamiento de la cita entra al plan como "hoy"; el odontologo lo puede quitar.
  if a.treatment_id is not null then
    insert into public.treatment_plan_items (clinic_id, patient_id, encounter_id, treatment_id, status, price_cents, created_by)
    values (a.clinic_id, a.patient_id, v_id, a.treatment_id, 'in_progress', 0, (select auth.uid()));
  end if;
  return v_id;
end $$;
