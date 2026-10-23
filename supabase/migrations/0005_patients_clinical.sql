-- Tablas de pacientes, agenda y clinica. El brief las ubica en los sprints 2 y 4, pero el Gate G1
-- prueba RLS sobre ellas, asi que el esquema se adelanta aqui; la logica (RPC, servicios, UI) llega despues.
set search_path = public, extensions;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  channel text,
  utm_campaign text not null,
  external_id text,
  starts_on date,
  ends_on date,
  budget_cents integer check (budget_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, utm_campaign)
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  full_name text not null check (char_length(full_name) between 3 and 120),
  normalized_name text,
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_raw text,
  email extensions.citext,
  birth_date date check (birth_date is null or birth_date <= current_date),
  sex text,
  zone text,
  address text,
  primary_dentist_id uuid references public.profiles (id),
  first_source public.appointment_source not null default 'phone',
  first_campaign_id uuid references public.campaigns (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'active', 'in_treatment', 'inactive')),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index patients_phone_unique on public.patients (clinic_id, phone_e164) where phone_e164 is not null;
create index patients_clinic_name_idx on public.patients (clinic_id, normalized_name);
create index patients_dentist_idx on public.patients (primary_dentist_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  dentist_id uuid not null references public.profiles (id) on delete restrict,
  cabinet_id uuid not null references public.cabinets (id) on delete restrict,
  treatment_id uuid references public.treatments (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  source public.appointment_source not null default 'phone',
  campaign_id uuid references public.campaigns (id) on delete set null,
  notes text,
  cancellation_reason text,
  checked_in_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_valid check (ends_at > starts_at),
  -- Doble reserva imposible a nivel de base de datos: odontologo, gabinete y paciente.
  constraint appointments_dentist_no_overlap exclude using gist (
    dentist_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show')),
  constraint appointments_cabinet_no_overlap exclude using gist (
    cabinet_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show')),
  constraint appointments_patient_no_overlap exclude using gist (
    patient_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show'))
);
create index appointments_clinic_day_idx on public.appointments (clinic_id, starts_at);
create index appointments_dentist_day_idx on public.appointments (dentist_id, starts_at);
create index appointments_patient_idx on public.appointments (patient_id, starts_at desc);

-- Anamnesis versionada: nunca se edita, se crea una version nueva.
create table public.anamnesis_versions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  version integer not null,
  allergies text[] not null default '{}',
  allergy_other text,
  conditions text[] not null default '{}',
  medications text,
  reason text,
  emergency_contact_name text,
  emergency_contact_phone text,
  pregnancy boolean,
  anticoagulants boolean,
  notes text,
  source public.anamnesis_source not null default 'staff',
  submitted_at timestamptz not null default now(),
  submitted_by uuid references public.profiles (id),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  unique (patient_id, version)
);

create function public.anamnesis_next_version() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select coalesce(max(version), 0) + 1 into new.version from public.anamnesis_versions where patient_id = new.patient_id;
  return new;
end $$;
create trigger anamnesis_version_before_insert before insert on public.anamnesis_versions
  for each row execute function public.anamnesis_next_version();

create view public.v_current_anamnesis with (security_invoker = true) as
  select distinct on (patient_id) * from public.anamnesis_versions order by patient_id, version desc;

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  appointment_id uuid not null unique references public.appointments (id) on delete restrict,
  dentist_id uuid not null references public.profiles (id) on delete restrict,
  status public.encounter_status not null default 'in_progress',
  chief_complaint text,
  notes text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  voided_at timestamptz,
  void_reason text
);
create index encounters_patient_idx on public.encounters (patient_id, started_at desc);

create table public.tooth_findings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  tooth_fdi smallint not null check (
    tooth_fdi between 11 and 18 or tooth_fdi between 21 and 28 or tooth_fdi between 31 and 38 or tooth_fdi between 41 and 48
    or tooth_fdi between 51 and 55 or tooth_fdi between 61 and 65 or tooth_fdi between 71 and 75 or tooth_fdi between 81 and 85
  ),
  condition public.tooth_condition not null,
  surfaces text[] not null default '{}' check (surfaces <@ array['M', 'D', 'V', 'L', 'O', 'I']),
  notes text,
  recorded_at timestamptz not null default now(),
  recorded_by uuid default auth.uid() references public.profiles (id)
);
create index tooth_findings_patient_idx on public.tooth_findings (patient_id, tooth_fdi);

create table public.treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  encounter_id uuid references public.encounters (id) on delete restrict,
  treatment_id uuid not null references public.treatments (id) on delete restrict,
  tooth_fdi smallint,
  surfaces text[] not null default '{}',
  status public.plan_status not null default 'planned',
  price_cents integer not null check (price_cents >= 0), -- precio congelado al agregar el item
  sequence integer not null default 0,
  accepted_at timestamptz,
  completed_encounter_id uuid references public.encounters (id) on delete restrict,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index plan_items_patient_idx on public.treatment_plan_items (patient_id, status);

create table public.patient_files (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  kind text not null check (kind in ('radiograph', 'photo', 'consent', 'document')),
  storage_path text not null,
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  sha256 text not null,
  uploaded_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index patient_files_patient_idx on public.patient_files (patient_id);

create trigger patients_updated before update on public.patients for each row execute function public.set_updated_at();
create trigger appointments_updated before update on public.appointments for each row execute function public.set_updated_at();

-- El clinic_id de una fila clinica no lo decide el cliente: se toma del paciente.
create function public.sync_clinic_from_patient() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare c uuid;
begin
  select clinic_id into c from public.patients where id = new.patient_id;
  if c is null then
    raise exception 'patient not found' using errcode = 'foreign_key_violation';
  end if;
  new.clinic_id := c;
  return new;
end $$;

create trigger anamnesis_sync_clinic before insert or update of patient_id on public.anamnesis_versions for each row execute function public.sync_clinic_from_patient();
create trigger encounters_sync_clinic before insert or update of patient_id on public.encounters for each row execute function public.sync_clinic_from_patient();
create trigger findings_sync_clinic before insert or update of patient_id on public.tooth_findings for each row execute function public.sync_clinic_from_patient();
create trigger plan_items_sync_clinic before insert or update of patient_id on public.treatment_plan_items for each row execute function public.sync_clinic_from_patient();
create trigger patient_files_sync_clinic before insert or update of patient_id on public.patient_files for each row execute function public.sync_clinic_from_patient();
create trigger appointments_sync_clinic before insert or update of patient_id on public.appointments for each row execute function public.sync_clinic_from_patient();

-- La cita solo puede usar gabinete y odontologo de su propia clinica.
create function public.appointments_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.cabinets where id = new.cabinet_id and clinic_id = new.clinic_id and active) then
    raise exception 'invalid cabinet' using errcode = 'foreign_key_violation';
  end if;
  if not exists (
    select 1 from public.clinic_members where user_id = new.dentist_id and clinic_id = new.clinic_id and active and role in ('dentist', 'clinic_admin')
  ) then
    raise exception 'invalid dentist' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;
-- Orden alfabetico: debe ir DESPUES de appointments_sync_clinic (que fija clinic_id).
create trigger appointments_zz_guard before insert or update of cabinet_id, dentist_id on public.appointments
  for each row execute function public.appointments_guard();

-- Un encuentro cerrado es inmutable: se corrige con addenda. Solo un admin puede anularlo.
create function public.encounters_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'voided' then
    raise exception 'IMMUTABLE: encuentro anulado' using errcode = 'P0001';
  end if;
  if old.status = 'finished' and not (
    new.status = 'voided' and public.has_role(old.clinic_id, array['clinic_admin']::public.member_role[])
  ) then
    raise exception 'IMMUTABLE: encuentro finalizado, usa una addenda' using errcode = 'P0001';
  end if;
  return new;
end $$;
