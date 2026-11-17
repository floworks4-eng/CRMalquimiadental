-- Session journal: original evidence, immutable notes and explicit patient publication.
create table public.clinical_sessions (
 id uuid primary key default gen_random_uuid(),
 clinic_id uuid not null references public.clinics(id),
 patient_id uuid not null references public.patients(id),
 encounter_id uuid unique references public.encounters(id),
 title text not null check (char_length(trim(title)) between 1 and 160),
 session_date date not null default (now() at time zone 'America/La_Paz')::date,
 status text not null default 'open' check(status in ('open','closed')),
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), closed_at timestamptz,
 unique(id,patient_id)
);
create index clinical_sessions_patient_date on public.clinical_sessions(patient_id,session_date desc);
create table public.clinical_messages (
 id uuid primary key default gen_random_uuid(),
 clinic_id uuid not null references public.clinics(id),
 patient_id uuid not null references public.patients(id),
 session_id uuid not null,
 source_file_id uuid references public.patient_files(id),
 body text not null check(char_length(trim(body)) between 1 and 12000),
 patient_visible boolean not null default false,
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(session_id,patient_id) references public.clinical_sessions(id,patient_id)
);
create index clinical_messages_session_date on public.clinical_messages(session_id,created_at,id);
alter table public.patient_files add column session_id uuid,
 add column original_name text,
 add column category text not null default 'document' check(category in ('radiograph','history','surgical_contract','image','document','audio')),
 add column patient_visible boolean not null default true,
 add constraint patient_files_session_patient_fkey foreign key(session_id,patient_id) references public.clinical_sessions(id,patient_id);
alter table public.patient_files drop constraint patient_files_kind_check;
alter table public.patient_files add constraint patient_files_kind_check check(kind in ('radiograph','photo','consent','document','audio'));
create index patient_files_session_idx on public.patient_files(session_id);
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf','audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav'] where id='clinical';

create function public.validate_journal_write() returns trigger language plpgsql set search_path='' as $$
declare v_patient uuid; v_clinic uuid; v_status text;
begin
 if tg_table_name='clinical_sessions' then
   if new.encounter_id is not null then
    select patient_id,clinic_id into v_patient,v_clinic from public.encounters where id=new.encounter_id;
    if v_patient is distinct from new.patient_id or v_clinic is distinct from new.clinic_id then raise exception 'INVALID_SESSION_PATIENT'; end if;
   end if;
   if tg_op='UPDATE' then
    if (to_jsonb(new)-'status'-'closed_at') is distinct from (to_jsonb(old)-'status'-'closed_at') or old.status='closed' or new.status<>'closed' then raise exception 'IMMUTABLE_SESSION'; end if;
    new.closed_at=now();
   end if;
 else
   if tg_table_name='clinical_messages' then
    if new.source_file_id is not null then
    select patient_id into v_patient from public.patient_files where id=new.source_file_id;
    if v_patient is distinct from new.patient_id then raise exception 'INVALID_SOURCE_PATIENT'; end if;
    end if;
   end if;
   if tg_table_name='clinical_messages' and tg_op='UPDATE' then
    if (to_jsonb(new)-'patient_visible') is distinct from (to_jsonb(old)-'patient_visible') then raise exception 'IMMUTABLE_MESSAGE'; end if;
    return new;
   end if;
   if new.session_id is not null then
    select patient_id,clinic_id,status into v_patient,v_clinic,v_status from public.clinical_sessions where id=new.session_id for update;
    if v_patient is distinct from new.patient_id or v_clinic is distinct from new.clinic_id then raise exception 'INVALID_SESSION_PATIENT'; end if;
    if v_status<>'open' then raise exception 'SESSION_CLOSED'; end if;
   end if;
 end if;
 return new;
end $$;
create trigger clinical_sessions_sync before insert on public.clinical_sessions for each row execute function public.sync_clinic_from_patient();
create trigger clinical_sessions_validate before insert or update on public.clinical_sessions for each row execute function public.validate_journal_write();
create trigger clinical_messages_sync before insert on public.clinical_messages for each row execute function public.sync_clinic_from_patient();
create trigger clinical_messages_validate before insert or update on public.clinical_messages for each row execute function public.validate_journal_write();
create trigger patient_files_validate_session before insert on public.patient_files for each row execute function public.validate_journal_write();
alter table public.clinical_sessions enable row level security;
alter table public.clinical_messages enable row level security;
create policy clinical_sessions_read on public.clinical_sessions for select to authenticated using(public.can_read_clinical(patient_id));
create policy clinical_sessions_insert on public.clinical_sessions for insert to authenticated with check(public.can_read_clinical(patient_id) and created_by=(select auth.uid()));
create policy clinical_sessions_close on public.clinical_sessions for update to authenticated using(public.can_read_clinical(patient_id)) with check(public.can_read_clinical(patient_id));
create policy clinical_messages_read on public.clinical_messages for select to authenticated using(public.can_read_clinical(patient_id));
create policy clinical_messages_insert on public.clinical_messages for insert to authenticated with check(public.can_read_clinical(patient_id) and created_by=(select auth.uid()));
create policy clinical_messages_publish on public.clinical_messages for update to authenticated using(public.can_read_clinical(patient_id)) with check(public.can_read_clinical(patient_id));
grant select on public.clinical_sessions,public.clinical_messages to authenticated;
grant insert(clinic_id,patient_id,encounter_id,title,session_date,created_by) on public.clinical_sessions to authenticated;
grant update(status) on public.clinical_sessions to authenticated;
grant insert(clinic_id,patient_id,session_id,source_file_id,body,patient_visible,created_by) on public.clinical_messages to authenticated;
grant update(patient_visible) on public.clinical_messages to authenticated;
grant insert(session_id,original_name,category,patient_visible) on public.patient_files to authenticated;
create trigger audit_clinical_sessions after insert or update on public.clinical_sessions for each row execute function public.audit_row();
create trigger audit_clinical_messages after insert or update on public.clinical_messages for each row execute function public.audit_row();
-- Existing clinical notes, encounters, files and signatures remain untouched.
create index clinical_messages_source_file_idx on public.clinical_messages(source_file_id);
revoke all on function public.validate_journal_write() from public,anon,authenticated;
