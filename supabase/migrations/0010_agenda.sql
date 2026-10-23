-- Sprint 2 · Agenda: disponibilidad, RPC transaccionales, maquina de estados, eventos y notificaciones.
-- Las citas ya no se escriben directo desde el cliente: solo por estas funciones (reglas en un solo lugar).
set search_path = public, extensions;

/* ───────── Eventos de cita y notificaciones ───────── */
create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  appointment_id uuid not null references public.appointments (id) on delete restrict,
  from_status public.appointment_status,
  to_status public.appointment_status not null,
  actor_id uuid references public.profiles (id),
  reason text,
  at timestamptz not null default now()
);
create index appointment_events_appt_idx on public.appointment_events (appointment_id, at);
alter table public.appointment_events enable row level security;
-- Ve el evento quien puede ver la cita (la subconsulta respeta el RLS de appointments).
create policy appointment_events_select on public.appointment_events for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id));
grant select on public.appointment_events to authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and public.is_staff(clinic_id));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Uso interno de las funciones de abajo; nadie la llama desde el cliente.
create function public.notify(p_clinic uuid, p_user uuid, p_kind public.notification_kind, p_title text, p_body text, p_href text)
returns void language sql security definer set search_path = ''
as $$ insert into public.notifications (clinic_id, user_id, kind, title, body, href) values (p_clinic, p_user, p_kind, p_title, p_body, p_href) $$;
revoke all on function public.notify(uuid, uuid, public.notification_kind, text, text, text) from public, anon, authenticated;

create function public.local_tz(p_clinic uuid) returns text
language sql stable security definer set search_path = ''
as $$ select timezone from public.clinics where id = p_clinic $$;
revoke all on function public.local_tz(uuid) from public, anon, authenticated;

/* ───────── Reglas de horario (una sola fuente: clinic_hours + turnos + feriados + ausencias) ───────── */
create function public.within_availability(p_clinic uuid, p_dentist uuid, p_start timestamptz, p_end timestamptz) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  tz text := public.local_tz(p_clinic);
  d date := (p_start at time zone tz)::date;
  t_start time := (p_start at time zone tz)::time;
  t_end time := (p_end at time zone tz)::time;
  dow int := extract(dow from d)::int;
  h public.clinic_hours;
begin
  if (p_end at time zone tz)::date <> d then return 'OUTSIDE_HOURS'; end if;
  if exists (select 1 from public.clinic_holidays where clinic_id = p_clinic and date = d) then return 'HOLIDAY'; end if;
  select * into h from public.clinic_hours where clinic_id = p_clinic and weekday = dow;
  if not found or h.is_closed then return 'CLOSED'; end if;
  if t_start < h.opens_at or t_end > h.closes_at then return 'OUTSIDE_HOURS'; end if;
  -- Un odontologo sin turnos definidos atiende en el horario de la clinica.
  if exists (select 1 from public.dentist_schedules where clinic_id = p_clinic and dentist_id = p_dentist and active)
     and not exists (
       select 1 from public.dentist_schedules s
       where s.clinic_id = p_clinic and s.dentist_id = p_dentist and s.active and s.weekday = dow
         and s.starts_at <= t_start and s.ends_at >= t_end
     ) then
    return 'NO_SCHEDULE';
  end if;
  if exists (
    select 1 from public.dentist_time_off o
    where o.clinic_id = p_clinic and o.dentist_id = p_dentist and tstzrange(o.starts_at, o.ends_at) && tstzrange(p_start, p_end)
  ) then
    return 'TIME_OFF';
  end if;
  return null;
end $$;
revoke all on function public.within_availability(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

/* ───────── Horarios libres ───────── */
create function public.available_slots(
  p_clinic uuid, p_treatment uuid, p_from date, p_to date, p_dentist uuid default null, p_step integer default 30
) returns table (slot_start timestamptz, slot_end timestamptz, slot_dentist uuid, slot_cabinet uuid)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz text;
  v_dur integer;
begin
  if not public.is_staff(p_clinic) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_to < p_from or p_to - p_from > 31 then raise exception 'BAD_RANGE' using errcode = 'P0001'; end if;
  if p_step < 15 or p_step % 15 <> 0 then raise exception 'BAD_STEP' using errcode = 'P0001'; end if;
  v_tz := public.local_tz(p_clinic);
  select duration_min into v_dur from public.treatments where id = p_treatment and clinic_id = p_clinic and active;
  if v_dur is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

  return query
  with days as (
    select gs::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
  ),
  open_days as (
    select dy.day, h.opens_at, h.closes_at
    from days dy
    join public.clinic_hours h on h.clinic_id = p_clinic and h.weekday = extract(dow from dy.day)::int and not h.is_closed
    where not exists (select 1 from public.clinic_holidays hh where hh.clinic_id = p_clinic and hh.date = dy.day)
  ),
  dentists as (
    select m.user_id from public.clinic_members m
    where m.clinic_id = p_clinic and m.active and m.role in ('dentist', 'clinic_admin') and (p_dentist is null or m.user_id = p_dentist)
  ),
  windows as (
    select o.day, dn.user_id as w_dentist,
           greatest(o.opens_at, coalesce(s.starts_at, o.opens_at)) as w_start,
           least(o.closes_at, coalesce(s.ends_at, o.closes_at)) as w_end,
           s.cabinet_id as sched_cabinet
    from open_days o
    cross join dentists dn
    left join public.dentist_schedules s
      on s.clinic_id = p_clinic and s.dentist_id = dn.user_id and s.active and s.weekday = extract(dow from o.day)::int
    where s.id is not null
       or not exists (select 1 from public.dentist_schedules s2 where s2.clinic_id = p_clinic and s2.dentist_id = dn.user_id and s2.active)
  ),
  cand as (
    select w.w_dentist as c_dentist, w.sched_cabinet, (g.t at time zone v_tz) as c_start
    from windows w
    cross join lateral generate_series(w.day + w.w_start, w.day + w.w_end - make_interval(mins => v_dur), make_interval(mins => p_step)) as g (t)
  )
  select c.c_start, c.c_start + make_interval(mins => v_dur), c.c_dentist, cab.id
  from cand c
  cross join lateral (
    select k.id from public.cabinets k
    where k.clinic_id = p_clinic and k.active and (c.sched_cabinet is null or k.id = c.sched_cabinet)
      and not exists (
        select 1 from public.appointments a
        where a.cabinet_id = k.id and a.status not in ('cancelled', 'no_show')
          and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(c.c_start, c.c_start + make_interval(mins => v_dur), '[)')
      )
    order by k.sort, k.name limit 1
  ) cab
  where c.c_start > now()
    and not exists (
      select 1 from public.appointments a
      where a.dentist_id = c.c_dentist and a.status not in ('cancelled', 'no_show')
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(c.c_start, c.c_start + make_interval(mins => v_dur), '[)')
    )
    and not exists (
      select 1 from public.dentist_time_off o
      where o.clinic_id = p_clinic and o.dentist_id = c.c_dentist
        and tstzrange(o.starts_at, o.ends_at) && tstzrange(c.c_start, c.c_start + make_interval(mins => v_dur))
    )
  order by c.c_start, c.c_dentist;
end $$;

/* ───────── Crear ───────── */
create function public.create_appointment(
  p_patient uuid, p_dentist uuid, p_cabinet uuid, p_treatment uuid, p_starts_at timestamptz,
  p_duration integer default null, p_source public.appointment_source default 'phone',
  p_campaign uuid default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_clinic uuid; v_pname text; v_tz text; v_dur integer; v_end timestamptz; v_err text; v_id uuid;
begin
  select clinic_id, full_name into v_clinic, v_pname from public.patients where id = p_patient;
  -- Mismo error si el paciente no existe o no se puede agendar: no se filtra existencia.
  if v_clinic is null or not public.can_use_appointment(v_clinic, p_dentist) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  -- Una cita da acceso clinico al odontologo (is_patient_dentist). Por eso un odontologo solo agenda a sus
  -- propios pacientes; asignar a otro colega es tarea de recepcion o del admin.
  if public.role_in(v_clinic) = 'dentist' and not public.is_patient_dentist(p_patient) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_tz := public.local_tz(v_clinic);

  if p_treatment is not null then
    select duration_min into v_dur from public.treatments where id = p_treatment and clinic_id = v_clinic and active;
    if v_dur is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  v_dur := coalesce(p_duration, v_dur, 30);
  if v_dur not between 15 and 240 or v_dur % 15 <> 0 then raise exception 'BAD_DURATION' using errcode = 'P0001'; end if;
  if extract(minute from (p_starts_at at time zone v_tz))::int % 15 <> 0 or extract(second from p_starts_at) <> 0 then
    raise exception 'BAD_GRANULARITY' using errcode = 'P0001';
  end if;
  if p_starts_at < now() and not public.is_admin(v_clinic) then raise exception 'PAST' using errcode = 'P0001'; end if;
  if p_campaign is not null and not exists (select 1 from public.campaigns where id = p_campaign and clinic_id = v_clinic) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  v_end := p_starts_at + make_interval(mins => v_dur);
  v_err := public.within_availability(v_clinic, p_dentist, p_starts_at, v_end);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;

  begin
    insert into public.appointments (clinic_id, patient_id, dentist_id, cabinet_id, treatment_id, starts_at, ends_at, source, campaign_id, notes, created_by)
    values (v_clinic, p_patient, p_dentist, p_cabinet, p_treatment, p_starts_at, v_end, p_source, p_campaign, nullif(trim(p_notes), ''), (select auth.uid()))
    returning id into v_id;
  exception
    when exclusion_violation then raise exception 'SLOT_TAKEN' using errcode = 'P0001';
    when foreign_key_violation then raise exception 'INVALID_REFERENCE' using errcode = 'P0001';
  end;

  insert into public.appointment_events (clinic_id, appointment_id, from_status, to_status, actor_id)
  values (v_clinic, v_id, null, 'scheduled', (select auth.uid()));
  if p_dentist <> (select auth.uid()) then
    perform public.notify(v_clinic, p_dentist, 'appointment', 'Nueva cita', v_pname || ' · ' || to_char(p_starts_at at time zone v_tz, 'DD/MM HH24:MI'), '/agenda');
  end if;
  return v_id;
end $$;

/* ───────── Reprogramar ───────── */
create function public.reschedule_appointment(
  p_id uuid, p_starts_at timestamptz, p_cabinet uuid default null, p_dentist uuid default null,
  p_expected_updated_at timestamptz default null, p_duration integer default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments; v_tz text; v_dur integer; v_end timestamptz; v_err text; v_dentist uuid; v_pname text;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found or not public.can_use_appointment(a.clinic_id, a.dentist_id) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_dentist := coalesce(p_dentist, a.dentist_id);
  if not public.can_use_appointment(a.clinic_id, v_dentist) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_expected_updated_at is not null and a.updated_at <> p_expected_updated_at then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
  if a.status not in ('scheduled', 'confirmed') then raise exception 'NOT_RESCHEDULABLE' using errcode = 'P0001'; end if;

  v_tz := public.local_tz(a.clinic_id);
  v_dur := coalesce(p_duration, (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int);
  if v_dur not between 15 and 240 or v_dur % 15 <> 0 then raise exception 'BAD_DURATION' using errcode = 'P0001'; end if;
  if extract(minute from (p_starts_at at time zone v_tz))::int % 15 <> 0 or extract(second from p_starts_at) <> 0 then
    raise exception 'BAD_GRANULARITY' using errcode = 'P0001';
  end if;
  if p_starts_at < now() and not public.is_admin(a.clinic_id) then raise exception 'PAST' using errcode = 'P0001'; end if;
  v_end := p_starts_at + make_interval(mins => v_dur);
  v_err := public.within_availability(a.clinic_id, v_dentist, p_starts_at, v_end);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;

  begin
    update public.appointments
       set starts_at = p_starts_at, ends_at = v_end, cabinet_id = coalesce(p_cabinet, cabinet_id), dentist_id = v_dentist
     where id = p_id;
  exception
    when exclusion_violation then raise exception 'SLOT_TAKEN' using errcode = 'P0001';
    when foreign_key_violation then raise exception 'INVALID_REFERENCE' using errcode = 'P0001';
  end;

  insert into public.appointment_events (clinic_id, appointment_id, from_status, to_status, actor_id, reason)
  values (a.clinic_id, p_id, a.status, a.status, (select auth.uid()), 'rescheduled');
  select full_name into v_pname from public.patients where id = a.patient_id;
  if v_dentist <> (select auth.uid()) then
    perform public.notify(a.clinic_id, v_dentist, 'appointment', 'Cita reprogramada', v_pname || ' · ' || to_char(p_starts_at at time zone v_tz, 'DD/MM HH24:MI'), '/agenda');
  end if;
end $$;

/* ───────── Cambiar estado (maquina de estados §7.2) ───────── */
create function public.change_appointment_status(
  p_id uuid, p_to public.appointment_status, p_reason text default null, p_expected_updated_at timestamptz default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments; r public.member_role; v_pname text; v_tz text;
  v_reason text := nullif(trim(p_reason), '');
begin
  select * into a from public.appointments where id = p_id for update;
  if not found or not public.can_use_appointment(a.clinic_id, a.dentist_id) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p_expected_updated_at is not null and a.updated_at <> p_expected_updated_at then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
  r := public.role_in(a.clinic_id);

  -- Transiciones validas (in_progress y completed las manejan start_encounter / finish_encounter en el Sprint 4).
  if not (
       (a.status = 'scheduled' and p_to = 'confirmed')
    or (a.status in ('scheduled', 'confirmed') and p_to = 'checked_in')
    or (a.status in ('scheduled', 'confirmed', 'checked_in') and p_to = 'cancelled')
    or (a.status in ('scheduled', 'confirmed') and p_to = 'no_show')
    or (a.status in ('cancelled', 'no_show') and p_to = 'scheduled')
  ) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  if p_to = 'scheduled' then
    if r <> 'clinic_admin' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  elsif r not in ('clinic_admin', 'reception') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_to in ('cancelled', 'scheduled') and (v_reason is null or char_length(v_reason) < 3) then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if p_to = 'no_show' and now() < a.starts_at + interval '15 minutes' then
    raise exception 'TOO_EARLY' using errcode = 'P0001';
  end if;

  begin
    update public.appointments
       set status = p_to,
           checked_in_at = case when p_to = 'checked_in' then now() else checked_in_at end,
           cancellation_reason = case when p_to = 'cancelled' then v_reason when p_to = 'scheduled' then null else cancellation_reason end
     where id = p_id;
  exception when exclusion_violation then raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  insert into public.appointment_events (clinic_id, appointment_id, from_status, to_status, actor_id, reason)
  values (a.clinic_id, p_id, a.status, p_to, (select auth.uid()), v_reason);

  select full_name into v_pname from public.patients where id = a.patient_id;
  v_tz := public.local_tz(a.clinic_id);
  if p_to = 'checked_in' then
    perform public.notify(a.clinic_id, a.dentist_id, 'checkin', v_pname || ' está en sala de espera', to_char(a.starts_at at time zone v_tz, 'HH24:MI'), '/agenda');
  elsif p_to = 'cancelled' and a.dentist_id <> (select auth.uid()) then
    perform public.notify(a.clinic_id, a.dentist_id, 'appointment', 'Cita cancelada', v_pname || ' · ' || to_char(a.starts_at at time zone v_tz, 'DD/MM HH24:MI'), '/agenda');
  end if;
end $$;

grant execute on function
  public.available_slots(uuid, uuid, date, date, uuid, integer),
  public.create_appointment(uuid, uuid, uuid, uuid, timestamptz, integer, public.appointment_source, uuid, text),
  public.reschedule_appointment(uuid, timestamptz, uuid, uuid, timestamptz, integer),
  public.change_appointment_status(uuid, public.appointment_status, text, timestamptz)
to authenticated;

/* ───────── Las citas solo se escriben por las funciones de arriba ───────── */
drop policy appointments_insert on public.appointments;
drop policy appointments_update on public.appointments;
revoke insert, update on public.appointments from authenticated;
