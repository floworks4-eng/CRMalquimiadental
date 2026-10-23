-- F1-013 · Catalogo clinico y de insumos. La "receta" (treatment_supplies) la valida el Doc antes de cargarse.
set search_path = public, extensions;

create table public.treatment_categories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  sort integer not null default 0,
  unique (clinic_id, name)
);

create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  code text not null,
  name text not null,
  category_id uuid references public.treatment_categories (id) on delete set null,
  duration_min integer not null check (duration_min between 15 and 240),
  price_cents integer not null check (price_cents >= 0),
  requires_tooth boolean not null default false,
  active boolean not null default true,
  sort integer not null default 0,
  unique (clinic_id, code)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  active boolean not null default true
);

create table public.supply_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  sku text,
  unit text not null,
  min_stock numeric(12, 3) not null default 0 check (min_stock >= 0),
  track_lots boolean not null default true,
  active boolean not null default true,
  unique (clinic_id, name)
);

create table public.treatment_supplies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  treatment_id uuid not null references public.treatments (id) on delete cascade,
  supply_item_id uuid not null references public.supply_items (id) on delete restrict,
  qty numeric(12, 3) not null check (qty > 0),
  unique (treatment_id, supply_item_id)
);
