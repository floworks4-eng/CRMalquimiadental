-- F1-014 / F1-015 · Funciones de permiso, RLS en todas las tablas y grants por columna.
-- Regla: sin politica no hay acceso. `anon` no recibe ningun privilegio sobre tablas de negocio.
set search_path = public, extensions;

/* ───────── Funciones de permiso ───────── */
create function public.is_member(p_clinic uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic and m.user_id = (select auth.uid()) and m.active
  )
$$;

create function public.has_role(p_clinic uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic and m.user_id = (select auth.uid()) and m.active and m.role = any (p_roles)
  )
$$;

create function public.role_in(p_clinic uuid) returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.clinic_members m
  where m.clinic_id = p_clinic and m.user_id = (select auth.uid()) and m.active
$$;

-- Segundo factor verificado (aal2). Es lo que separa "tiene cuenta" de "puede ver datos de salud".
create function public.has_mfa() returns boolean
language sql stable set search_path = ''
as $$ select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' $$;

create function public.is_staff(p_clinic uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select public.has_mfa() and public.is_member(p_clinic) $$;

create function public.is_admin(p_clinic uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select public.has_mfa() and public.has_role(p_clinic, array['clinic_admin']::public.member_role[]) $$;

create function public.shares_clinic_with(p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members a
    join public.clinic_members b on b.clinic_id = a.clinic_id and b.active
    where a.user_id = (select auth.uid()) and a.active and b.user_id = p_user
  )
$$;

-- "Sus pacientes": primario, con cita o con encuentro. Un odontologo no ve a quien nunca atendio.
create function public.is_patient_dentist(p_patient uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.patients p where p.id = p_patient and p.primary_dentist_id = (select auth.uid()))
      or exists (select 1 from public.appointments a where a.patient_id = p_patient and a.dentist_id = (select auth.uid()))
      or exists (select 1 from public.encounters e where e.patient_id = p_patient and e.dentist_id = (select auth.uid()))
$$;

-- Datos clinicos: admin, o odontologo de ese paciente, siempre con MFA. Recepcion nunca.
create function public.can_read_clinical(p_patient uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_mfa() and exists (
    select 1 from public.patients p
    where p.id = p_patient and public.is_member(p.clinic_id)
      and (
        public.has_role(p.clinic_id, array['clinic_admin']::public.member_role[])
        or (public.has_role(p.clinic_id, array['dentist']::public.member_role[]) and public.is_patient_dentist(p.id))
      )
  )
$$;

-- Agenda: admin y recepcion ven todo el dia; el odontologo solo lo suyo.
create function public.can_use_appointment(p_clinic uuid, p_dentist uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_staff(p_clinic) and (
    public.has_role(p_clinic, array['clinic_admin', 'reception']::public.member_role[])
    or (public.has_role(p_clinic, array['dentist']::public.member_role[]) and p_dentist = (select auth.uid()))
  )
$$;

-- Funciones usadas por las politicas: solo `authenticated` puede ejecutarlas (anon, nada).
grant execute on function
  public.is_member(uuid), public.has_role(uuid, public.member_role[]), public.role_in(uuid), public.has_mfa(),
  public.is_staff(uuid), public.is_admin(uuid), public.shares_clinic_with(uuid), public.is_patient_dentist(uuid),
  public.can_read_clinical(uuid), public.can_use_appointment(uuid, uuid)
to authenticated;

create trigger encounters_guard_trg before update on public.encounters for each row execute function public.encounters_guard();

/* ───────── RLS: activar en todas las tablas ───────── */
alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.clinic_members enable row level security;
alter table public.member_invites enable row level security;
alter table public.clinic_hours enable row level security;
alter table public.clinic_holidays enable row level security;
alter table public.cabinets enable row level security;
alter table public.dentist_schedules enable row level security;
alter table public.dentist_time_off enable row level security;
alter table public.treatment_categories enable row level security;
alter table public.treatments enable row level security;
alter table public.suppliers enable row level security;
alter table public.supply_items enable row level security;
alter table public.treatment_supplies enable row level security;
alter table public.campaigns enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.anamnesis_versions enable row level security;
alter table public.encounters enable row level security;
alter table public.tooth_findings enable row level security;
alter table public.treatment_plan_items enable row level security;
alter table public.patient_files enable row level security;

/* ───────── Identidad ───────── */
create policy clinics_select on public.clinics for select to authenticated using (public.is_member(id));
create policy clinics_update on public.clinics for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_clinic_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Cada usuario ve su propia membresia aun sin MFA (el servidor decide si lo manda a /mfa).
create policy members_select on public.clinic_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff(clinic_id));
create policy members_update on public.clinic_members for update to authenticated
  using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));

create policy invites_select on public.member_invites for select to authenticated using (public.is_admin(clinic_id));

/* ───────── Catalogo y horarios: lectura para el personal, escritura para el admin ───────── */
create policy clinic_hours_select on public.clinic_hours for select to authenticated using (public.is_staff(clinic_id));
create policy clinic_hours_write on public.clinic_hours for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy holidays_select on public.clinic_holidays for select to authenticated using (public.is_staff(clinic_id));
create policy holidays_write on public.clinic_holidays for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy cabinets_select on public.cabinets for select to authenticated using (public.is_staff(clinic_id));
create policy cabinets_write on public.cabinets for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy dentist_schedules_select on public.dentist_schedules for select to authenticated using (public.is_staff(clinic_id));
create policy dentist_schedules_write on public.dentist_schedules for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy time_off_select on public.dentist_time_off for select to authenticated using (public.is_staff(clinic_id));
create policy time_off_write on public.dentist_time_off for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy categories_select on public.treatment_categories for select to authenticated using (public.is_staff(clinic_id));
create policy categories_write on public.treatment_categories for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy treatments_select on public.treatments for select to authenticated using (public.is_staff(clinic_id));
create policy treatments_write on public.treatments for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy supply_items_select on public.supply_items for select to authenticated using (public.is_staff(clinic_id));
create policy supply_items_write on public.supply_items for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy treatment_supplies_select on public.treatment_supplies for select to authenticated using (public.is_staff(clinic_id));
create policy treatment_supplies_write on public.treatment_supplies for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy campaigns_select on public.campaigns for select to authenticated using (public.is_staff(clinic_id));
create policy campaigns_write on public.campaigns for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));
create policy suppliers_admin on public.suppliers for all to authenticated using (public.is_admin(clinic_id)) with check (public.is_admin(clinic_id));

/* ───────── Pacientes ───────── */
create policy patients_select on public.patients for select to authenticated
  using (
    public.is_staff(clinic_id) and (
      public.has_role(clinic_id, array['clinic_admin', 'reception']::public.member_role[])
      or (public.has_role(clinic_id, array['dentist']::public.member_role[]) and public.is_patient_dentist(id))
    )
  );
create policy patients_insert on public.patients for insert to authenticated
  with check (
    public.is_staff(clinic_id) and created_by = (select auth.uid())
    and public.has_role(clinic_id, array['clinic_admin', 'dentist', 'reception']::public.member_role[])
  );
create policy patients_update on public.patients for update to authenticated
  using (
    public.is_staff(clinic_id) and (
      public.has_role(clinic_id, array['clinic_admin', 'reception']::public.member_role[])
      or (public.has_role(clinic_id, array['dentist']::public.member_role[]) and public.is_patient_dentist(id))
    )
  )
  with check (public.is_staff(clinic_id));

/* ───────── Agenda ───────── */
create policy appointments_select on public.appointments for select to authenticated using (public.can_use_appointment(clinic_id, dentist_id));
create policy appointments_insert on public.appointments for insert to authenticated
  with check (public.can_use_appointment(clinic_id, dentist_id) and created_by = (select auth.uid()));
create policy appointments_update on public.appointments for update to authenticated
  using (public.can_use_appointment(clinic_id, dentist_id)) with check (public.can_use_appointment(clinic_id, dentist_id));

/* ───────── Datos clinicos: solo admin u odontologo del paciente, con MFA ───────── */
create policy anamnesis_select on public.anamnesis_versions for select to authenticated using (public.can_read_clinical(patient_id));
create policy anamnesis_insert on public.anamnesis_versions for insert to authenticated
  with check (public.can_read_clinical(patient_id) and submitted_by = (select auth.uid()));
create policy anamnesis_review on public.anamnesis_versions for update to authenticated
  using (public.can_read_clinical(patient_id)) with check (public.can_read_clinical(patient_id) and reviewed_by = (select auth.uid()));

create policy encounters_select on public.encounters for select to authenticated using (public.can_read_clinical(patient_id));
create policy encounters_insert on public.encounters for insert to authenticated
  with check (
    public.can_read_clinical(patient_id) and status = 'in_progress'
    and (dentist_id = (select auth.uid()) or public.is_admin(clinic_id))
  );
create policy encounters_update on public.encounters for update to authenticated
  using (public.can_read_clinical(patient_id)) with check (public.can_read_clinical(patient_id));

create policy findings_select on public.tooth_findings for select to authenticated using (public.can_read_clinical(patient_id));
create policy findings_write on public.tooth_findings for all to authenticated
  using (
    public.can_read_clinical(patient_id)
    and exists (select 1 from public.encounters e where e.id = encounter_id and e.status = 'in_progress')
  )
  with check (
    public.can_read_clinical(patient_id) and recorded_by = (select auth.uid())
    and exists (select 1 from public.encounters e where e.id = encounter_id and e.status = 'in_progress')
  );

create policy plan_select on public.treatment_plan_items for select to authenticated using (public.can_read_clinical(patient_id));
create policy plan_insert on public.treatment_plan_items for insert to authenticated
  with check (public.can_read_clinical(patient_id) and created_by = (select auth.uid()) and status in ('planned', 'accepted'));
create policy plan_update on public.treatment_plan_items for update to authenticated
  using (public.can_read_clinical(patient_id)) with check (public.can_read_clinical(patient_id) and status <> 'done');
create policy plan_delete on public.treatment_plan_items for delete to authenticated
  using (public.can_read_clinical(patient_id) and status = 'planned');

create policy files_select on public.patient_files for select to authenticated using (public.can_read_clinical(patient_id));
create policy files_insert on public.patient_files for insert to authenticated
  with check (public.can_read_clinical(patient_id) and uploaded_by = (select auth.uid()));

/* ───────── Grants (fail closed): solo lo explicito ───────── */
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;

grant select on public.clinics, public.clinic_hours, public.clinic_holidays, public.cabinets, public.dentist_schedules,
  public.dentist_time_off, public.treatment_categories, public.treatments, public.supply_items, public.treatment_supplies,
  public.campaigns, public.suppliers, public.profiles, public.clinic_members to authenticated;
grant select (id, clinic_id, email, role, expires_at, accepted_at, invited_by, created_at) on public.member_invites to authenticated; -- sin token_hash

grant update (name, legal_name, nit, phone, whatsapp_number, address, logo_path) on public.clinics to authenticated;
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;
grant update (role, title, active) on public.clinic_members to authenticated;

-- Catalogo: el admin escribe; no se borran filas que otras tablas referencian (se desactivan).
grant insert, update, delete on public.clinic_hours, public.clinic_holidays, public.dentist_schedules, public.dentist_time_off to authenticated;
grant insert, update, delete on public.treatment_supplies to authenticated;
grant insert, update on public.cabinets, public.treatment_categories, public.treatments, public.supply_items, public.suppliers, public.campaigns to authenticated;

-- Pacientes: columnas explicitas. Recepcion ve el directorio y datos de contacto, nunca clinica.
-- (El brief omitia en el SELECT columnas que si deja editar —email, sexo, direccion—; se incluyen.)
grant select (id, clinic_id, full_name, normalized_name, phone_e164, phone_raw, email, birth_date, sex, zone, address,
  primary_dentist_id, first_source, first_campaign_id, status, archived_at, created_by, created_at, updated_at)
  on public.patients to authenticated;
grant insert (clinic_id, full_name, normalized_name, phone_e164, phone_raw, email, birth_date, sex, zone, address,
  primary_dentist_id, first_source, first_campaign_id, created_by) on public.patients to authenticated;
grant update (full_name, normalized_name, phone_e164, phone_raw, email, birth_date, sex, zone, address, primary_dentist_id, status)
  on public.patients to authenticated;

-- Citas: check-in, inicio y cierre (checked_in_at, started_at, completed_at) solo por RPC en sprints siguientes.
grant select on public.appointments to authenticated;
grant insert (clinic_id, patient_id, dentist_id, cabinet_id, treatment_id, starts_at, ends_at, status, source, campaign_id, notes, created_by)
  on public.appointments to authenticated;
grant update (dentist_id, cabinet_id, treatment_id, starts_at, ends_at, status, notes, cancellation_reason, source, campaign_id)
  on public.appointments to authenticated;

grant select on public.anamnesis_versions, public.v_current_anamnesis to authenticated;
grant insert (clinic_id, patient_id, allergies, allergy_other, conditions, medications, reason, emergency_contact_name,
  emergency_contact_phone, pregnancy, anticoagulants, notes, source, submitted_by) on public.anamnesis_versions to authenticated;
grant update (reviewed_by, reviewed_at) on public.anamnesis_versions to authenticated;

grant select on public.encounters, public.tooth_findings, public.treatment_plan_items, public.patient_files to authenticated;
grant insert (clinic_id, patient_id, appointment_id, dentist_id, chief_complaint, notes, status) on public.encounters to authenticated;
grant update (chief_complaint, notes) on public.encounters to authenticated; -- finish/void: RPC
grant insert (clinic_id, patient_id, encounter_id, tooth_fdi, condition, surfaces, notes, recorded_by) on public.tooth_findings to authenticated;
grant update (tooth_fdi, condition, surfaces, notes) on public.tooth_findings to authenticated;
grant delete on public.tooth_findings to authenticated;
grant insert (clinic_id, patient_id, encounter_id, treatment_id, tooth_fdi, surfaces, price_cents, sequence, created_by)
  on public.treatment_plan_items to authenticated;
grant update (status, sequence, tooth_fdi, surfaces, accepted_at) on public.treatment_plan_items to authenticated;
grant delete on public.treatment_plan_items to authenticated;
grant insert (clinic_id, patient_id, kind, storage_path, mime, size_bytes, sha256, uploaded_by) on public.patient_files to authenticated;
