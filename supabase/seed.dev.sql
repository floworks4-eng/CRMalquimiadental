-- DATOS FICTICIOS SOLO PARA DESARROLLO (supabase db reset). Nunca se aplica en produccion.
-- Todo lo que la clinica no ha confirmado (precios, horarios, recetas, nombres) es un borrador: [draft].
-- Usuarios de desarrollo: <rol>@alquimia.test, contrasena local "DevOnly-Alquimia-2026!". Cada login exige enrolar TOTP (MFA).
set search_path = public, extensions;

insert into public.clinics (id, slug, name, legal_name, address, timezone)
values ('00000000-0000-4000-8000-0000000000c1', 'alquimia-dev', 'Alquimia Dental (dev)', 'Clinica Odontologica Alquimia Dental [draft]', 'San Miguel, La Paz [draft]', 'America/La_Paz');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
  extensions.crypt('DevOnly-Alquimia-2026!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.full_name)
from (values
  ('00000000-0000-4000-8000-0000000000a1', 'doc@alquimia.test', 'Doc [draft]'),
  ('00000000-0000-4000-8000-0000000000a2', 'valeria@alquimia.test', 'Dra. Valeria Mamani [draft]'),
  ('00000000-0000-4000-8000-0000000000a3', 'sergio@alquimia.test', 'Dr. Sergio Choque [draft]'),
  ('00000000-0000-4000-8000-0000000000a4', 'paola@alquimia.test', 'Paola Condori [draft]')
) as u (id, email, full_name);

insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at)
select id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now() from auth.users;

insert into public.clinic_members (clinic_id, user_id, role, title) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'clinic_admin', 'Director clinico'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a2', 'dentist', 'Odontologa general'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a3', 'dentist', 'Endodoncista'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a4', 'reception', 'Recepcion');

-- Horarios [draft]: Lun-Vie 08:30-19:30, Sab 09:00-13:00, Dom cerrado.
insert into public.clinic_hours (clinic_id, weekday, opens_at, closes_at, is_closed)
select '00000000-0000-4000-8000-0000000000c1', d,
  case when d between 1 and 5 then time '08:30' when d = 6 then time '09:00' end,
  case when d between 1 and 5 then time '19:30' when d = 6 then time '13:00' end,
  d = 0
from generate_series(0, 6) as d;

insert into public.cabinets (id, clinic_id, name, sort) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1', 'Gabinete 1', 1),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c1', 'Gabinete 2', 2),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000c1', 'Gabinete 3', 3);

insert into public.treatment_categories (id, clinic_id, name, sort) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'Diagnostico y prevencion', 1),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', 'Restauradora', 2),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', 'Endodoncia y protesis', 3),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c1', 'Cirugia', 4),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000c1', 'Estetica y ortodoncia', 5);

-- Precios de mercado de La Paz [draft], en centavos de Bs. Reemplazar por la lista oficial de la clinica.
insert into public.treatments (clinic_id, code, name, category_id, duration_min, price_cents, requires_tooth, sort)
select '00000000-0000-4000-8000-0000000000c1', t.code, t.name, t.cat::uuid, t.mins, t.bs * 100, t.tooth, t.sort
from (values
  ('consulta', 'Consulta y diagnostico', '00000000-0000-4000-8000-0000000000d1', 30, 100, false, 1),
  ('limpieza', 'Limpieza dental (profilaxis)', '00000000-0000-4000-8000-0000000000d1', 45, 150, false, 2),
  ('resina1', 'Resina 1 superficie', '00000000-0000-4000-8000-0000000000d2', 40, 160, true, 3),
  ('resina2', 'Resina 2 superficies', '00000000-0000-4000-8000-0000000000d2', 45, 200, true, 4),
  ('resina3', 'Resina 3 superficies', '00000000-0000-4000-8000-0000000000d2', 60, 330, true, 5),
  ('endo_uni', 'Endodoncia unirradicular', '00000000-0000-4000-8000-0000000000d3', 60, 400, true, 6),
  ('endo_multi', 'Endodoncia multirradicular', '00000000-0000-4000-8000-0000000000d3', 90, 650, true, 7),
  ('corona_mp', 'Corona metal-porcelana', '00000000-0000-4000-8000-0000000000d3', 60, 1530, true, 8),
  ('extraccion', 'Extraccion simple', '00000000-0000-4000-8000-0000000000d4', 30, 180, true, 9),
  ('blanqueamiento', 'Blanqueamiento en consultorio', '00000000-0000-4000-8000-0000000000d5', 60, 630, false, 10)
) as t (code, name, cat, mins, bs, tooth, sort);

insert into public.supply_items (clinic_id, name, unit, min_stock)
select '00000000-0000-4000-8000-0000000000c1', s.name, s.unit, s.min
from (values
  ('Guantes de nitrilo', 'par', 100), ('Mascarillas descartables', 'u.', 60), ('Anestesico lidocaina 2 %', 'carpule', 30),
  ('Agujas dentales cortas', 'u.', 40), ('Resina compuesta A2', 'capsula', 20), ('Acido grabador 37 %', 'dosis', 20),
  ('Adhesivo universal', 'dosis', 25), ('Rollos de algodon', 'u.', 200)
) as s (name, unit, min);

-- Recetas [draft]: cantidades de ejemplo; las valida el Doc.
insert into public.treatment_supplies (clinic_id, treatment_id, supply_item_id, qty)
select '00000000-0000-4000-8000-0000000000c1', t.id, i.id, r.qty
from (values
  ('resina2', 'Guantes de nitrilo', 2), ('resina2', 'Mascarillas descartables', 1), ('resina2', 'Anestesico lidocaina 2 %', 1),
  ('resina2', 'Agujas dentales cortas', 1), ('resina2', 'Resina compuesta A2', 2), ('resina2', 'Acido grabador 37 %', 1),
  ('resina2', 'Adhesivo universal', 1), ('limpieza', 'Guantes de nitrilo', 2), ('limpieza', 'Rollos de algodon', 4)
) as r (code, item, qty)
join public.treatments t on t.code = r.code and t.clinic_id = '00000000-0000-4000-8000-0000000000c1'
join public.supply_items i on i.name = r.item and i.clinic_id = '00000000-0000-4000-8000-0000000000c1';

insert into public.campaigns (id, clinic_id, name, channel, utm_campaign) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'Limpieza San Miguel [draft]', 'tiktok+meta', 'limpieza-san-miguel'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', 'Primera visita de ninos [draft]', 'tiktok', 'primera-visita-ninos');

-- 12 pacientes ficticios. 1-4: Dra. Valeria · 5-8: Dr. Sergio · 9-12: sin odontologo primario.
insert into public.patients (id, clinic_id, full_name, normalized_name, phone_e164, birth_date, zone, primary_dentist_id, first_source, first_campaign_id, status, created_by)
select p.id::uuid, '00000000-0000-4000-8000-0000000000c1', p.name, lower(p.name), p.phone, p.birth::date, p.zone,
  p.dentist::uuid, p.src::public.appointment_source, p.camp::uuid, p.status, '00000000-0000-4000-8000-0000000000a4'
from (values
  ('00000000-0000-4000-8000-000000000101', 'Juan Carlos Quispe Mamani', '+59170001001', '1990-04-12', 'Achumani', '00000000-0000-4000-8000-0000000000a2', 'whatsapp', null, 'in_treatment'),
  ('00000000-0000-4000-8000-000000000102', 'Wilma Condori Apaza', '+59170001002', '1978-09-03', 'Obrajes', '00000000-0000-4000-8000-0000000000a2', 'web', null, 'in_treatment'),
  ('00000000-0000-4000-8000-000000000103', 'Gabriela Rojas Salazar', '+59170001003', '1996-06-30', 'San Miguel', '00000000-0000-4000-8000-0000000000a2', 'campaign', '00000000-0000-4000-8000-0000000000e1', 'active'),
  ('00000000-0000-4000-8000-000000000104', 'Ana Lucia Paredes Vargas', '+59170001004', '1999-02-08', 'Calacoto', '00000000-0000-4000-8000-0000000000a2', 'campaign', '00000000-0000-4000-8000-0000000000e1', 'active'),
  ('00000000-0000-4000-8000-000000000105', 'Rodrigo Choque Flores', '+59170001005', '1982-05-25', 'El Alto', '00000000-0000-4000-8000-0000000000a3', 'whatsapp', null, 'in_treatment'),
  ('00000000-0000-4000-8000-000000000106', 'Carla Gutierrez Vargas', '+59170001006', '1993-03-14', 'San Miguel', '00000000-0000-4000-8000-0000000000a3', 'whatsapp', null, 'active'),
  ('00000000-0000-4000-8000-000000000107', 'Luis Fernando Ticona Paz', '+59170001007', '1975-08-09', 'Alto Obrajes', '00000000-0000-4000-8000-0000000000a3', 'historical', null, 'in_treatment'),
  ('00000000-0000-4000-8000-000000000108', 'Jhonny Apaza Limachi', '+59170001008', '2017-05-03', 'Irpavi', '00000000-0000-4000-8000-0000000000a3', 'campaign', '00000000-0000-4000-8000-0000000000e2', 'active'),
  ('00000000-0000-4000-8000-000000000109', 'Fernando Limachi Torrez', '+59170001009', '1985-01-22', 'Irpavi', null, 'whatsapp', null, 'new'),
  ('00000000-0000-4000-8000-000000000110', 'Marco Antonio Huanca Rivero', '+59170001010', '1972-11-15', 'Sopocachi', null, 'web', null, 'active'),
  ('00000000-0000-4000-8000-000000000111', 'Silvia Poma Quisbert', '+59170001011', '1988-12-01', 'Cota Cota', null, 'phone', null, 'new'),
  ('00000000-0000-4000-8000-000000000112', 'Rosario Callisaya Mendoza', '+59170001012', '1969-10-27', 'Achumani', null, 'web', null, 'new')
) as p (id, name, phone, birth, zone, dentist, src, camp, status);

-- Agenda de hoy (hora La Paz). El paciente 109 la atiende el Dr. Sergio sin ser su paciente primario.
insert into public.appointments (id, clinic_id, patient_id, dentist_id, cabinet_id, treatment_id, starts_at, ends_at, status, source, created_by)
select a.id::uuid, '00000000-0000-4000-8000-0000000000c1', a.patient::uuid, a.dentist::uuid, a.cabinet::uuid,
  (select id from public.treatments where code = a.code),
  ((current_date + a.start::time) at time zone 'America/La_Paz'),
  ((current_date + a.start::time + a.mins * interval '1 minute') at time zone 'America/La_Paz'),
  a.status::public.appointment_status, 'phone', '00000000-0000-4000-8000-0000000000a4'
from (values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b1', 'consulta', '09:00', 30, 'confirmed'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b1', 'corona_mp', '10:00', 60, 'scheduled'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000b3', 'endo_multi', '09:00', 90, 'confirmed'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000b3', 'consulta', '11:00', 30, 'scheduled')
) as a (id, patient, dentist, cabinet, code, start, mins, status);

insert into public.anamnesis_versions (patient_id, allergies, conditions, reason, source, submitted_by) values
  ('00000000-0000-4000-8000-000000000101', '{Penicilina}', '{Ninguno}', 'Control de ortodoncia', 'staff', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-000000000105', '{Ninguna}', '{Diabetes}', 'Continuar endodoncia', 'staff', '00000000-0000-4000-8000-0000000000a3');

-- Una atencion ya cerrada del Dr. Sergio (ayer), con un hallazgo.
insert into public.appointments (id, clinic_id, patient_id, dentist_id, cabinet_id, treatment_id, starts_at, ends_at, status, source, created_by)
values ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000107',
  '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000b3', (select id from public.treatments where code = 'endo_uni'),
  ((current_date - 1 + time '15:00') at time zone 'America/La_Paz'), ((current_date - 1 + time '16:00') at time zone 'America/La_Paz'),
  'completed', 'phone', '00000000-0000-4000-8000-0000000000a4');
insert into public.encounters (id, patient_id, appointment_id, dentist_id, status, chief_complaint, finished_at) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000205',
   '00000000-0000-4000-8000-0000000000a3', 'finished', 'Dolor pieza 46', now() - interval '1 day');
insert into public.tooth_findings (patient_id, encounter_id, tooth_fdi, condition, surfaces, recorded_by) values
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000301', 46, 'endodoncia', '{O}', '00000000-0000-4000-8000-0000000000a3');
