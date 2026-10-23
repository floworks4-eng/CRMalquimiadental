-- F1-010 · Extensiones, tipos base y privilegios por defecto (fail closed).
-- Las extensiones van en el esquema `extensions` (como en Supabase). Los helpers usan
-- gen_random_uuid() y sha256(), que ya son parte de Postgres; pgcrypto solo se usa en el seed.
set search_path = public, extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- Todo objeto nuevo nace cerrado: cada migracion concede de forma explicita lo que hace falta.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

create type public.member_role as enum ('clinic_admin', 'dentist', 'reception');
create type public.appointment_status as enum
  ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'no_show', 'cancelled');
create type public.appointment_source as enum
  ('whatsapp', 'web', 'campaign', 'phone', 'walk_in', 'referral', 'historical');
create type public.encounter_status as enum ('in_progress', 'finished', 'voided');
create type public.tooth_condition as enum
  ('caries', 'corona', 'endodoncia', 'ausente', 'fractura', 'sellante', 'implante', 'protesis', 'otro');
create type public.plan_status as enum ('planned', 'accepted', 'in_progress', 'done', 'cancelled');
create type public.invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'voided');
create type public.payment_method as enum ('cash', 'qr', 'transfer', 'card');
create type public.payment_status as enum ('confirmed', 'voided');
create type public.transaction_kind as enum ('income', 'expense', 'adjustment');
create type public.stock_reason as enum ('purchase', 'treatment', 'adjustment', 'waste', 'return');
create type public.consent_type as enum ('data_processing', 'clinical_treatment', 'whatsapp_reminders', 'marketing');
create type public.anamnesis_source as enum ('patient_checkin', 'staff', 'import');
create type public.cash_session_status as enum ('open', 'closed');
create type public.notification_kind as enum ('checkin', 'appointment', 'low_stock', 'payment', 'system');

create function public.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;
