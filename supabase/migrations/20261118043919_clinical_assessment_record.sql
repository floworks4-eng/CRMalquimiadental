create table public.clinical_assessments (
 id uuid primary key default gen_random_uuid(),
 clinic_id uuid not null references public.clinics(id),
 patient_id uuid not null references public.patients(id),
 fields jsonb not null check(jsonb_typeof(fields)='object' and octet_length(fields::text)<=60000),
 patient_visible boolean not null default false,
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now()
);
create index clinical_assessments_patient_date on public.clinical_assessments(patient_id,created_at desc,id);
create trigger clinical_assessments_sync before insert on public.clinical_assessments for each row execute function public.sync_clinic_from_patient();
create function public.assessment_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'IMMUTABLE_ASSESSMENT'; end $$;
create trigger clinical_assessments_immutable before update or delete on public.clinical_assessments for each row execute function public.assessment_immutable();
revoke all on function public.assessment_immutable() from public,anon,authenticated;
alter table public.clinical_assessments enable row level security;
revoke all on public.clinical_assessments from public,anon,authenticated;
create policy clinical_assessments_select on public.clinical_assessments for select to authenticated using(public.can_read_clinical(patient_id));
create policy clinical_assessments_insert on public.clinical_assessments for insert to authenticated with check(public.can_read_clinical(patient_id) and created_by=(select auth.uid()));
grant select on public.clinical_assessments to authenticated;
grant insert(clinic_id,patient_id,fields,patient_visible,created_by) on public.clinical_assessments to authenticated;
create trigger audit_clinical_assessments after insert on public.clinical_assessments for each row execute function public.audit_row();
