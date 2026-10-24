-- Primer arranque: crea la clinica y su administrador. Solo funciona mientras no exista ninguna clinica,
-- y solo lo llama el servidor (service_role) desde /configuracion-inicial, despues de crear el usuario de Auth.
set search_path = public, extensions;

create function public.setup_clinic(p_user uuid, p_clinic_name text, p_full_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid; v_slug text;
begin
  -- Bloqueo para que dos envios simultaneos no creen dos clinicas.
  perform pg_advisory_xact_lock(hashtext('setup_clinic'));
  if exists (select 1 from public.clinics) then raise exception 'ALREADY_SETUP' using errcode = 'P0001'; end if;
  if char_length(coalesce(trim(p_clinic_name), '')) < 3 or char_length(coalesce(trim(p_full_name), '')) < 3 then
    raise exception 'INVALID_PAYLOAD' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

  v_slug := trim(both '-' from regexp_replace(lower(translate(trim(p_clinic_name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]+', '-', 'g'));
  v_slug := left(case when char_length(v_slug) < 3 then 'clinica' else v_slug end, 40);

  insert into public.clinics (slug, name) values (v_slug, trim(p_clinic_name)) returning id into v_clinic;
  update public.profiles set full_name = trim(p_full_name) where id = p_user;
  insert into public.clinic_members (clinic_id, user_id, role, title) values (v_clinic, p_user, 'clinic_admin', 'Director clínico');

  -- Punto de partida editable en Configuración: Lun-Vie 08:30-19:30, Sáb 09:00-13:00, Dom cerrado, un gabinete.
  insert into public.clinic_hours (clinic_id, weekday, opens_at, closes_at, is_closed)
  select v_clinic, d,
    case when d between 1 and 5 then time '08:30' when d = 6 then time '09:00' end,
    case when d between 1 and 5 then time '19:30' when d = 6 then time '13:00' end,
    d = 0
  from generate_series(0, 6) as d;
  insert into public.cabinets (clinic_id, name, sort) values (v_clinic, 'Gabinete 1', 1);
  return v_clinic;
end $$;
revoke all on function public.setup_clinic(uuid, text, text) from public, anon, authenticated;
grant execute on function public.setup_clinic(uuid, text, text) to service_role;

-- ¿Ya hay clinica? (para que /configuracion-inicial se cierre sola). No revela nada mas.
create function public.is_setup_done() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.clinics) $$;
revoke all on function public.is_setup_done() from public, anon, authenticated;
grant execute on function public.is_setup_done() to service_role;
