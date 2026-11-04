-- Estado actual editable por pieza desde la ficha, separado del historial inmutable de atenciones.
create table public.patient_tooth_states (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete cascade,
  tooth_fdi smallint not null check (
    tooth_fdi between 11 and 18 or tooth_fdi between 21 and 28 or tooth_fdi between 31 and 38 or tooth_fdi between 41 and 48
    or tooth_fdi between 51 and 55 or tooth_fdi between 61 and 65 or tooth_fdi between 71 and 75 or tooth_fdi between 81 and 85
  ),
  condition public.tooth_condition not null,
  surfaces text[] not null default '{}' check (surfaces <@ array['M','D','V','L','O','I']),
  notes text,
  updated_by uuid not null default auth.uid() references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique(patient_id, tooth_fdi)
);
create trigger patient_tooth_states_sync_clinic before insert or update of patient_id on public.patient_tooth_states
  for each row execute function public.sync_clinic_from_patient();
create trigger audit_patient_tooth_states after insert or update or delete on public.patient_tooth_states
  for each row execute function public.audit_row();
alter table public.patient_tooth_states enable row level security;
create policy patient_tooth_states_select on public.patient_tooth_states for select to authenticated
  using (public.can_read_clinical(patient_id));
create policy patient_tooth_states_insert on public.patient_tooth_states for insert to authenticated
  with check (public.can_read_clinical(patient_id) and updated_by=(select auth.uid()) and public.has_role(clinic_id,array['clinic_admin','dentist']::public.member_role[]));
create policy patient_tooth_states_update on public.patient_tooth_states for update to authenticated
  using (public.can_read_clinical(patient_id) and public.has_role(clinic_id,array['clinic_admin','dentist']::public.member_role[]))
  with check (public.can_read_clinical(patient_id) and updated_by=(select auth.uid()) and public.has_role(clinic_id,array['clinic_admin','dentist']::public.member_role[]));
create policy patient_tooth_states_delete on public.patient_tooth_states for delete to authenticated
  using (public.can_read_clinical(patient_id) and public.has_role(clinic_id,array['clinic_admin','dentist']::public.member_role[]));
grant select on public.patient_tooth_states to authenticated;
grant insert (clinic_id,patient_id,tooth_fdi,condition,surfaces,notes,updated_by) on public.patient_tooth_states to authenticated;
grant update (condition,surfaces,notes,updated_by,updated_at) on public.patient_tooth_states to authenticated;
grant delete on public.patient_tooth_states to authenticated;
