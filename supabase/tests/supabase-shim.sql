-- Emulacion minima de Supabase para correr migraciones y tests RLS en PGlite (sin Docker).
-- NO es una migracion ni se aplica en Supabase real. Replica: roles, esquemas auth/storage/extensions,
-- auth.uid()/auth.jwt() leyendo request.jwt.claims y los privilegios por defecto que Supabase concede.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema extensions;
create schema auth;
create schema storage;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud text default 'authenticated',
  role text default 'authenticated',
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  confirmation_token text default '', recovery_token text default '',
  email_change_token_new text default '', email_change text default '',
  raw_app_meta_data jsonb default '{}',
  raw_user_meta_data jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create function auth.jwt() returns jsonb language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable
as $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;

grant usage on schema extensions, auth, storage, public to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid(), storage.foldername(text) to anon, authenticated, service_role;
grant all on all tables in schema auth, storage to service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon; -- como en Supabase: acceso sujeto a RLS
grant select on storage.buckets to authenticated;

-- Privilegios por defecto de Supabase (las migraciones deben cerrar lo que no se debe abrir).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
