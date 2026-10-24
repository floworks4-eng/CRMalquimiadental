-- Historial clinico en texto: lo que viene de fichas en papel o planillas (importado) y las notas que agrega el equipo.
-- Como el resto de la historia clinica: no se edita ni se borra; una correccion es otra nota.
set search_path = public, extensions;

create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  noted_on date not null default current_date,
  body text not null check (char_length(body) between 1 and 10000),
  source text not null default 'staff' check (source in ('staff', 'import')),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index clinical_notes_patient_idx on public.clinical_notes (patient_id, noted_on desc);
create trigger clinical_notes_sync_clinic before insert on public.clinical_notes for each row execute function public.sync_clinic_from_patient();

alter table public.clinical_notes enable row level security;
create policy clinical_notes_select on public.clinical_notes for select to authenticated using (public.can_read_clinical(patient_id));
create policy clinical_notes_insert on public.clinical_notes for insert to authenticated
  with check (public.can_read_clinical(patient_id) and created_by = (select auth.uid()));
grant select on public.clinical_notes to authenticated;
grant insert (clinic_id, patient_id, noted_on, body, source, created_by) on public.clinical_notes to authenticated;
create trigger audit_clinical_notes after insert on public.clinical_notes for each row execute function public.audit_row();
