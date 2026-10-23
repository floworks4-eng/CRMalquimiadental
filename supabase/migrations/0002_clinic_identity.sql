-- F1-011 · Clinica, perfiles, miembros e invitaciones.
set search_path = public, extensions;

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null,
  legal_name text,
  nit text,
  timezone text not null default 'America/La_Paz',
  currency char(3) not null default 'BOB',
  phone text,
  whatsapp_number text,
  address text,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un perfil por usuario de Auth. No se borra: la auditoria lo referencia (se desactiva el miembro).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role public.member_role not null,
  title text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);
-- Fase 1: un usuario activo pertenece a una sola clinica.
create unique index clinic_members_one_active_clinic on public.clinic_members (user_id) where active;
create index clinic_members_clinic_idx on public.clinic_members (clinic_id) where active;

create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  email extensions.citext not null,
  role public.member_role not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create trigger clinics_updated before update on public.clinics for each row execute function public.set_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger clinic_members_updated before update on public.clinic_members for each row execute function public.set_updated_at();

-- Auth -> perfil. Solo corre al crear un usuario (invitacion); no hay registro publico.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Siempre debe quedar un administrador activo por clinica.
create function public.prevent_last_admin() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'clinic_admin' and old.active
     and (tg_op = 'DELETE' or new.role <> 'clinic_admin' or not new.active)
     and not exists (
       select 1 from public.clinic_members m
       where m.clinic_id = old.clinic_id and m.role = 'clinic_admin' and m.active and m.id <> old.id
     )
  then
    raise exception 'LAST_ADMIN: la clinica debe conservar al menos un administrador activo' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger clinic_members_last_admin before update or delete on public.clinic_members
  for each row execute function public.prevent_last_admin();
