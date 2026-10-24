-- Primera version: el sistema es solo para el Doc y su equipo. Los pacientes nunca entran.
-- Decisiones de la clinica (24/10/2026):
--   1. Acceso con correo y contrasena, sin verificacion en dos pasos.
--   2. Se elimina todo lo que usaba el paciente: check-in por QR, reserva en linea, consentimientos firmados en linea
--      y atribucion de anuncios. La anamnesis la carga el personal en la ficha.
set search_path = public, extensions;

-- 1. Sin segundo factor. Las politicas siguen llamando a has_mfa(): para volver a exigirlo basta con restaurar
--    la version de 0006 (coalesce(auth.jwt() ->> 'aal', '') = 'aal2').
create or replace function public.has_mfa() returns boolean
language sql stable set search_path = ''
as $$ select (select auth.uid()) is not null $$;

-- 2. Funciones publicas y de check-in
drop function public.public_consent_texts(uuid);
drop function public.public_book(uuid, uuid, timestamptz, text, text, boolean, boolean, jsonb, bytea, text);
drop function public.public_slots(uuid, uuid, date, date);
drop function public.submit_checkin(bytea, jsonb, text, text);
drop function public.checkin_target(bytea);
drop function public.checkin_context(bytea);
drop function public.issue_checkin_token(uuid, bytea);
drop function public.current_consent(uuid, public.consent_type);
drop function public.rate_limit_hit(text, integer, interval);

-- Tablas (sus politicas y triggers se van con ellas)
drop table public.checkin_submissions;
drop table public.attribution_touches;
drop table public.patient_consents;
drop table public.checkin_tokens;
drop table public.consent_versions;
drop table public.rate_limit_events;
drop function public.consent_body_immutable();
drop function public.consent_set_hash();
drop type public.consent_type;

alter table public.treatments drop column bookable_online;
alter table public.clinics drop column allow_draft_legal;
