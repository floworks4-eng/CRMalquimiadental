-- F1-019 · Auditoria append-only. Nadie (ni authenticated ni service_role por accidente) la edita ni la borra.
set search_path = public, extensions;

create table public.audit_log (
  id bigint generated always as identity primary key,
  clinic_id uuid not null,
  actor_id uuid,
  actor_role public.member_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  patient_id uuid,
  before jsonb,
  after jsonb,
  ip_hash text,
  user_agent text,
  at timestamptz not null default now()
);
create index audit_clinic_at_idx on public.audit_log (clinic_id, at desc);
create index audit_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_patient_idx on public.audit_log (patient_id, at desc);

alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select to authenticated using (public.is_admin(clinic_id));
-- Sin politicas de escritura: solo triggers y funciones definer escriben.
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create function public.audit_immutable() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'audit_log es append-only' using errcode = 'P0001';
end $$;
create trigger audit_no_change before update or delete on public.audit_log for each row execute function public.audit_immutable();
create trigger audit_no_truncate before truncate on public.audit_log for each statement execute function public.audit_immutable();

-- Trigger generico: una fila de auditoria por cambio, en la misma transaccion que el cambio.
create function public.audit_row() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  c uuid := case when tg_table_name = 'clinics' then (r ->> 'id')::uuid else (r ->> 'clinic_id')::uuid end;
begin
  insert into public.audit_log (clinic_id, actor_id, actor_role, action, entity_type, entity_id, patient_id, before, after)
  values (
    c, (select auth.uid()), public.role_in(c),
    tg_table_name || '.' || case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
    tg_table_name, (r ->> 'id')::uuid,
    case when tg_table_name = 'patients' then (r ->> 'id')::uuid else (r ->> 'patient_id')::uuid end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

create trigger audit_clinics after insert or update or delete on public.clinics for each row execute function public.audit_row();
create trigger audit_clinic_members after insert or update or delete on public.clinic_members for each row execute function public.audit_row();
create trigger audit_clinic_hours after insert or update or delete on public.clinic_hours for each row execute function public.audit_row();
create trigger audit_cabinets after insert or update or delete on public.cabinets for each row execute function public.audit_row();
create trigger audit_treatments after insert or update or delete on public.treatments for each row execute function public.audit_row();
create trigger audit_treatment_supplies after insert or update or delete on public.treatment_supplies for each row execute function public.audit_row();
create trigger audit_patients after insert or update or delete on public.patients for each row execute function public.audit_row();
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function public.audit_row();
create trigger audit_anamnesis after insert or update or delete on public.anamnesis_versions for each row execute function public.audit_row();
create trigger audit_encounters after insert or update or delete on public.encounters for each row execute function public.audit_row();
create trigger audit_findings after insert or update or delete on public.tooth_findings for each row execute function public.audit_row();
create trigger audit_plan_items after insert or update or delete on public.treatment_plan_items for each row execute function public.audit_row();
create trigger audit_patient_files after insert or update or delete on public.patient_files for each row execute function public.audit_row();

-- Eventos que no son un simple INSERT/UPDATE (abrir ficha, exportar, descargar, login). El servidor lo llama.
create function public.log_event(
  p_clinic uuid, p_action text, p_entity_type text, p_entity_id uuid default null, p_patient uuid default null, p_meta jsonb default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member(p_clinic) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.audit_log (clinic_id, actor_id, actor_role, action, entity_type, entity_id, patient_id, after)
  values (p_clinic, (select auth.uid()), public.role_in(p_clinic), p_action, p_entity_type, p_entity_id, p_patient, p_meta);
end $$;
grant execute on function public.log_event(uuid, text, text, uuid, uuid, jsonb) to authenticated;
