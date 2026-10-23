-- F1-012 · Horarios, feriados, gabinetes y turnos. Una sola fuente de horarios (clinic_hours).
set search_path = public, extensions;

create table public.clinic_hours (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  unique (clinic_id, weekday),
  check (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.clinic_holidays (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  date date not null,
  name text not null,
  unique (clinic_id, date)
);

-- Se activan y desactivan, no se borran: las citas los referencian.
create table public.cabinets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, name)
);

create table public.dentist_schedules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  dentist_id uuid not null references public.profiles (id),
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null check (ends_at > starts_at),
  cabinet_id uuid references public.cabinets (id) on delete set null,
  active boolean not null default true
);
create index dentist_schedules_idx on public.dentist_schedules (clinic_id, dentist_id, weekday);

create table public.dentist_time_off (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  dentist_id uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text
);
create index dentist_time_off_idx on public.dentist_time_off (clinic_id, dentist_id, starts_at);
