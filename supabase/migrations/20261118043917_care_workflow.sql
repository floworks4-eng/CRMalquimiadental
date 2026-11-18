-- Shortfalls are outstanding material requirements, never lot movements.
create table public.stock_consumption_deficits (
  encounter_id uuid not null references public.encounters(id),
  supply_item_id uuid not null references public.supply_items(id),
  clinic_id uuid not null references public.clinics(id),
  qty_missing numeric not null check (qty_missing > 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (encounter_id, supply_item_id)
);
create index stock_consumption_deficits_pending_idx on public.stock_consumption_deficits (clinic_id, supply_item_id)
  where resolved_at is null;
alter table public.stock_consumption_deficits enable row level security;
revoke all on public.stock_consumption_deficits from public, anon, authenticated;
grant select on public.stock_consumption_deficits to authenticated;
create policy deficits_inventory_admin on public.stock_consumption_deficits for select to authenticated
  using (public.is_admin(clinic_id));

-- Separate from the clinic-wide payment/checkout key space. Only finish_care reads receipts.
create table public.care_finish_receipts (
  encounter_id uuid primary key references public.encounters(id),
  idempotency_key text not null,
  response jsonb not null
);
alter table public.care_finish_receipts enable row level security;
revoke all on public.care_finish_receipts from public, anon, authenticated;

-- An editor can have seen an open visit just before the dentist clicked finish.
-- Serialize new "today" selections with finish_care's encounter row lock.
create function public.guard_care_today_item() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_read_clinical(new.patient_id) then return new; end if;
  perform 1 from public.encounters where id = new.encounter_id and patient_id = new.patient_id
    for key share;
  if found and exists (select 1 from public.care_finish_receipts where encounter_id = new.encounter_id) then
    raise exception 'IMMUTABLE';
  end if;
  return new;
end $$;
revoke all on function public.guard_care_today_item() from public, anon, authenticated;
create trigger guard_care_today_item before insert or update of status on public.treatment_plan_items
  for each row when (new.encounter_id is not null and new.status = 'in_progress')
  execute function public.guard_care_today_item();

-- Start the existing encounter transaction and attach its journal in the same request.
create function public.start_care(p_appointment uuid) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  encounter_id_for_visit uuid;
  e public.encounters;
begin
  -- Same lock order as finish_care when a second tab resumes an existing visit.
  perform 1 from public.encounters where appointment_id = p_appointment for key share;
  encounter_id_for_visit := public.start_encounter(p_appointment);
  select e1.* into e from public.encounters e1 join public.appointments a
    on a.id = e1.appointment_id and a.clinic_id = e1.clinic_id and a.patient_id = e1.patient_id
    and a.dentist_id = e1.dentist_id
    where e1.id = encounter_id_for_visit and a.id = p_appointment;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.status <> 'in_progress' then raise exception 'ALREADY_FINISHED'; end if;

  insert into public.clinical_sessions (clinic_id, patient_id, encounter_id, title, session_date, created_by)
    select e.clinic_id, e.patient_id, e.id, 'Consulta odontológica', (e.started_at at time zone c.timezone)::date, auth.uid()
    from public.clinics c where c.id = e.clinic_id
    on conflict (encounter_id) do nothing;
  return jsonb_build_object('encounterId', e.id, 'patientId', e.patient_id);
end $$;
revoke all on function public.start_care(uuid) from public, anon, authenticated;
grant execute on function public.start_care(uuid) to authenticated;

create function public.finish_care(p_encounter uuid, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.encounters;
  a public.appointments;
  receipt public.care_finish_receipts;
  actor uuid := auth.uid();
  member_role public.member_role;
  item_ids uuid[];
  subtotal integer;
  invoice_id uuid;
  invoice_number text;
  invoice_year integer;
  sequence_number integer;
  clinic_date date;
  supply record;
  lot record;
  remaining numeric;
  taken numeric;
  on_hand numeric;
  pending_count integer := 0;
  result jsonb;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then
    raise exception 'INVALID_PAYLOAD';
  end if;
  select * into e from public.encounters where id = p_encounter for update;
  if not found or not public.can_read_clinical(e.patient_id) then raise exception 'NOT_FOUND'; end if;

  select * into a from public.appointments
    where id = e.appointment_id and clinic_id = e.clinic_id and patient_id = e.patient_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  member_role := public.role_in(e.clinic_id);
  if (member_role = 'clinic_admin' or
      (member_role = 'dentist' and actor = a.dentist_id and actor = e.dentist_id)) is not true then
    raise exception 'FORBIDDEN';
  end if;

  select * into receipt from public.care_finish_receipts where encounter_id = e.id;
  if found and receipt.idempotency_key = p_idempotency_key then return receipt.response; end if;
  if e.status <> 'in_progress' then raise exception 'ALREADY_FINISHED'; end if;
  if a.status <> 'in_progress' then raise exception 'INVALID_STATE'; end if;

  -- Freeze exactly the billed set, including its prices, before any stock or invoice work.
  with completed as (
    update public.treatment_plan_items set status = 'done', completed_encounter_id = e.id
      where encounter_id = e.id and patient_id = e.patient_id and clinic_id = e.clinic_id and status = 'in_progress'
      returning id, price_cents
  )
  select array_agg(id), coalesce(sum(price_cents), 0) into item_ids, subtotal from completed;

  if item_ids is null and coalesce(e.notes, '') !~ '[^[:space:]]' and not exists (
    select 1 from public.clinical_sessions s join public.clinical_messages m on m.session_id = s.id
    where s.encounter_id = e.id and s.patient_id = e.patient_id and m.body ~ '[^[:space:]]'
  ) then
    raise exception 'EVALUATION_NOTE_REQUIRED';
  end if;

  clinic_date := (now() at time zone public.local_tz(e.clinic_id))::date;
  if item_ids is not null then
    invoice_year := extract(year from clinic_date)::int;
    insert into public.invoice_counters (clinic_id, year, last_number) values (e.clinic_id, invoice_year, 1)
      on conflict (clinic_id, year) do update set last_number = public.invoice_counters.last_number + 1
      returning last_number into sequence_number;
    select coalesce(nullif(upper(left(regexp_replace(slug, '[^a-z]', '', 'g'), 3)), ''), 'FAC')
           || '-' || invoice_year || '-' || lpad(sequence_number::text, 6, '0')
      into invoice_number from public.clinics where id = e.clinic_id;

    insert into public.invoices (clinic_id, patient_id, encounter_id, number, status, subtotal_cents, total_cents, created_by)
      values (e.clinic_id, e.patient_id, e.id, invoice_number, public.invoice_status_for(subtotal, 0), subtotal, subtotal, actor)
      returning id into invoice_id;
    insert into public.invoice_items (clinic_id, invoice_id, treatment_id, plan_item_id, description, tooth_fdi, unit_price_cents, total_cents)
      select e.clinic_id, invoice_id, p.treatment_id, p.id,
             t.name || coalesce(' · pieza ' || p.tooth_fdi, '') ||
             case when cardinality(p.surfaces) > 0 then ' (' || array_to_string(p.surfaces, '') || ')' else '' end,
             p.tooth_fdi, p.price_cents, p.price_cents
        from public.treatment_plan_items p join public.treatments t on t.id = p.treatment_id
        where p.id = any(item_ids);
  end if;

  for supply in
    select s.id, s.name, s.unit, s.min_stock, sum(ts.qty) as required
      from public.treatment_plan_items p
      join public.treatment_supplies ts on ts.treatment_id = p.treatment_id and ts.clinic_id = e.clinic_id
      join public.supply_items s on s.id = ts.supply_item_id and s.clinic_id = e.clinic_id
      where p.id = any(item_ids)
      group by s.id order by s.id
  loop
    remaining := supply.required;
    for lot in
      select id, qty_on_hand, unit_cost_cents from public.supply_lots
        where clinic_id = e.clinic_id and supply_item_id = supply.id and qty_on_hand > 0
          and (expires_on is null or expires_on >= clinic_date)
        order by expires_on nulls last, received_at, id for update
    loop
      taken := least(remaining, lot.qty_on_hand);
      insert into public.stock_movements (clinic_id, supply_item_id, lot_id, delta, reason, ref_type, ref_id, unit_cost_cents, created_by)
        values (e.clinic_id, supply.id, lot.id, -taken, 'treatment', 'encounter', e.id, lot.unit_cost_cents, actor);
      remaining := remaining - taken;
      exit when remaining = 0;
    end loop;

    if remaining > 0 then
      insert into public.stock_consumption_deficits (clinic_id, encounter_id, supply_item_id, qty_missing)
        values (e.clinic_id, e.id, supply.id, remaining);
      pending_count := pending_count + 1;
      perform public.notify_role(e.clinic_id, 'clinic_admin', 'low_stock', 'Insumo pendiente: ' || supply.name,
        'Faltan ' || remaining || ' ' || supply.unit || ' para conciliar la atención.', '/inventario');
    else
      select coalesce(sum(qty_on_hand), 0) into on_hand from public.supply_lots
        where clinic_id = e.clinic_id and supply_item_id = supply.id and (expires_on is null or expires_on >= clinic_date);
      if on_hand <= supply.min_stock then
        perform public.notify_role(e.clinic_id, 'clinic_admin', 'low_stock', 'Stock bajo: ' || supply.name,
          'Quedan ' || on_hand || ' ' || supply.unit || '.', '/inventario');
      end if;
    end if;
  end loop;

  update public.clinical_sessions set status = 'closed'
    where encounter_id = e.id and clinic_id = e.clinic_id and patient_id = e.patient_id and status = 'open';
  update public.encounters set status = 'finished', finished_at = now() where id = e.id;
  update public.appointments set status = 'completed', completed_at = now() where id = a.id;
  insert into public.appointment_events (clinic_id, appointment_id, from_status, to_status, actor_id)
    values (e.clinic_id, a.id, 'in_progress', 'completed', actor);
  result := jsonb_build_object('encounterId', e.id, 'invoiceId', invoice_id, 'totalCents', subtotal,
                               'pendingSupplyCount', pending_count);
  insert into public.audit_log (clinic_id, actor_id, actor_role, action, entity_type, entity_id, patient_id, after)
    values (e.clinic_id, actor, member_role, 'encounter.finish', 'encounters', e.id, e.patient_id, result);
  insert into public.care_finish_receipts (encounter_id, idempotency_key, response)
    values (e.id, p_idempotency_key, result);
  return result;
end $$;
revoke all on function public.finish_care(uuid, text) from public, anon, authenticated;
grant execute on function public.finish_care(uuid, text) to authenticated;
