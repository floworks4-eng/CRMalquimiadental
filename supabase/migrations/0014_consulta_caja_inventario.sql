-- Sprint 4 · Consulta, facturacion, caja e inventario.
-- Todo lo que mueve dinero o stock pasa por funciones de esta migracion: una transaccion, idempotente y auditada.
set search_path = public, extensions;

/* ───────── Addendas: la historia clinica cerrada no se edita, se agrega ───────── */
create table public.encounter_addenda (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  reason text not null check (char_length(reason) between 3 and 300),
  notes text not null check (char_length(notes) between 1 and 4000),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index encounter_addenda_encounter_idx on public.encounter_addenda (encounter_id);
create trigger addenda_sync_clinic before insert on public.encounter_addenda for each row execute function public.sync_clinic_from_patient();

/* ───────── Inventario por lotes ───────── */
create table public.supply_lots (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  supply_item_id uuid not null references public.supply_items (id) on delete restrict,
  lot_code text,
  expires_on date,
  qty_on_hand numeric(12, 3) not null default 0 check (qty_on_hand >= 0),
  unit_cost_cents integer check (unit_cost_cents >= 0),
  supplier_id uuid references public.suppliers (id) on delete set null,
  received_at timestamptz not null default now()
);
create index supply_lots_item_idx on public.supply_lots (supply_item_id, expires_on nulls last, received_at);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  supply_item_id uuid not null references public.supply_items (id) on delete restrict,
  lot_id uuid not null references public.supply_lots (id) on delete restrict,
  delta numeric(12, 3) not null check (delta <> 0),
  reason public.stock_reason not null,
  ref_type text,
  ref_id uuid,
  unit_cost_cents integer,
  note text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index stock_movements_item_idx on public.stock_movements (supply_item_id, created_at desc);

-- El saldo del lote solo cambia por movimientos. El check del lote impide quedar en negativo.
create function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.supply_lots set qty_on_hand = qty_on_hand + new.delta where id = new.lot_id;
  return null;
end $$;
create trigger stock_movements_apply after insert on public.stock_movements for each row execute function public.apply_stock_movement();

create view public.v_stock with (security_invoker = true) as
  select i.id as supply_item_id, i.clinic_id, i.name, i.unit, i.min_stock, i.active,
         coalesce(sum(l.qty_on_hand), 0)::numeric(12, 3) as on_hand,
         min(l.expires_on) filter (where l.qty_on_hand > 0) as next_expiry
  from public.supply_items i
  left join public.supply_lots l on l.supply_item_id = i.id
  group by i.id;

/* ───────── Facturacion y caja ───────── */
create table public.invoice_counters (
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  year integer not null,
  last_number integer not null default 0,
  primary key (clinic_id, year)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  encounter_id uuid unique references public.encounters (id) on delete restrict,
  number text not null,
  status public.invoice_status not null default 'issued',
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  discount_reason text,
  total_cents integer not null check (total_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (clinic_id, number),
  check (discount_cents <= subtotal_cents and total_cents = subtotal_cents - discount_cents and paid_cents <= total_cents)
);
create index invoices_patient_idx on public.invoices (patient_id, issued_at desc);
create index invoices_open_idx on public.invoices (clinic_id) where status in ('issued', 'partially_paid');

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  treatment_id uuid references public.treatments (id) on delete set null,
  plan_item_id uuid references public.treatment_plan_items (id) on delete set null,
  description text not null,
  tooth_fdi smallint,
  qty integer not null default 1 check (qty > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0)
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  status public.cash_session_status not null default 'open',
  opened_by uuid references public.profiles (id),
  opened_at timestamptz not null default now(),
  opening_float_cents integer not null default 0 check (opening_float_cents >= 0),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  expected_cents integer,
  counted_cents integer check (counted_cents >= 0),
  difference_cents integer,
  notes text
);
-- Una sola caja abierta por clinica.
create unique index cash_sessions_one_open on public.cash_sessions (clinic_id) where status = 'open';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  cash_session_id uuid references public.cash_sessions (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  method public.payment_method not null,
  reference text,
  status public.payment_status not null default 'confirmed',
  received_at timestamptz not null default now(),
  received_by uuid default auth.uid() references public.profiles (id),
  voided_at timestamptz,
  void_reason text
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_clinic_at_idx on public.payments (clinic_id, received_at desc);

-- Libro de caja: no se edita, se corrige con otro movimiento.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  cash_session_id uuid references public.cash_sessions (id) on delete restrict,
  kind public.transaction_kind not null,
  category text not null,
  concept text not null,
  amount_cents integer not null check (amount_cents <> 0),
  method public.payment_method not null,
  patient_id uuid references public.patients (id) on delete restrict,
  invoice_id uuid references public.invoices (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index transactions_clinic_at_idx on public.transactions (clinic_id, created_at desc);
create index transactions_session_idx on public.transactions (cash_session_id);

-- Respuestas guardadas para reintentos (doble clic, red que se corta): la misma clave devuelve lo mismo.
create table public.operation_results (
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  key text not null,
  operation text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (clinic_id, key)
);

/* ───────── RLS ───────── */
alter table public.encounter_addenda enable row level security;
alter table public.supply_lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.transactions enable row level security;
alter table public.operation_results enable row level security;

-- Cobros: admin y recepcion ven todo; el odontologo, lo de sus pacientes.
create function public.can_bill(p_clinic uuid, p_patient uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_staff(p_clinic) and (
    public.has_role(p_clinic, array['clinic_admin', 'reception']::public.member_role[])
    or (public.has_role(p_clinic, array['dentist']::public.member_role[]) and public.is_patient_dentist(p_patient))
  )
$$;
create function public.is_cashier(p_clinic uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_staff(p_clinic) and public.has_role(p_clinic, array['clinic_admin', 'reception']::public.member_role[]) $$;
grant execute on function public.can_bill(uuid, uuid), public.is_cashier(uuid) to authenticated;

create policy addenda_select on public.encounter_addenda for select to authenticated using (public.can_read_clinical(patient_id));
create policy addenda_insert on public.encounter_addenda for insert to authenticated
  with check (
    public.can_read_clinical(patient_id) and created_by = (select auth.uid())
    and exists (select 1 from public.encounters e where e.id = encounter_id and e.patient_id = encounter_addenda.patient_id and e.status = 'finished')
  );
create policy lots_select on public.supply_lots for select to authenticated using (public.is_staff(clinic_id));
create policy movements_select on public.stock_movements for select to authenticated using (public.is_staff(clinic_id));
create policy invoices_select on public.invoices for select to authenticated using (public.can_bill(clinic_id, patient_id));
create policy invoice_items_select on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy payments_select on public.payments for select to authenticated using (public.can_bill(clinic_id, patient_id));
create policy cash_sessions_select on public.cash_sessions for select to authenticated using (public.is_cashier(clinic_id));
create policy transactions_select on public.transactions for select to authenticated using (public.is_cashier(clinic_id));

grant select on public.encounter_addenda, public.supply_lots, public.stock_movements, public.v_stock, public.invoices,
  public.invoice_items, public.cash_sessions, public.payments, public.transactions to authenticated;
grant insert (patient_id, encounter_id, reason, notes, created_by) on public.encounter_addenda to authenticated;

create trigger audit_addenda after insert on public.encounter_addenda for each row execute function public.audit_row();
create trigger audit_supply_lots after insert or update on public.supply_lots for each row execute function public.audit_row();
create trigger audit_stock_movements after insert on public.stock_movements for each row execute function public.audit_row();
create trigger audit_invoices after insert or update on public.invoices for each row execute function public.audit_row();
create trigger audit_payments after insert or update on public.payments for each row execute function public.audit_row();
create trigger audit_cash_sessions after insert or update on public.cash_sessions for each row execute function public.audit_row();
create trigger audit_transactions after insert on public.transactions for each row execute function public.audit_row();
create trigger audit_supply_items after insert or update on public.supply_items for each row execute function public.audit_row();

/* ───────── Plan de tratamiento ───────── */
-- Estados: planned = proxima sesion, in_progress = se hace hoy, done = hecho (solo lo marca finish_encounter).
drop policy plan_insert on public.treatment_plan_items;
drop policy plan_delete on public.treatment_plan_items;
create policy plan_insert on public.treatment_plan_items for insert to authenticated
  with check (
    public.can_read_clinical(patient_id) and created_by = (select auth.uid()) and status in ('planned', 'accepted', 'in_progress')
    and (encounter_id is null or exists (
      select 1 from public.encounters e where e.id = encounter_id and e.patient_id = treatment_plan_items.patient_id and e.status = 'in_progress'
    ))
  );
create policy plan_delete on public.treatment_plan_items for delete to authenticated
  using (public.can_read_clinical(patient_id) and status in ('planned', 'accepted', 'in_progress'));
grant insert (status) on public.treatment_plan_items to authenticated;

-- El precio lo pone la base de datos (tarifa vigente) y queda congelado: el navegador no lo decide.
create function public.plan_item_price() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select price_cents into new.price_cents from public.treatments where id = new.treatment_id and clinic_id = new.clinic_id;
  if new.price_cents is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger plan_items_zz_price before insert on public.treatment_plan_items for each row execute function public.plan_item_price();

/* ───────── Helpers internos ───────── */
create function public.notify_role(p_clinic uuid, p_role public.member_role, p_kind public.notification_kind, p_title text, p_body text, p_href text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notifications (clinic_id, user_id, kind, title, body, href)
  select p_clinic, m.user_id, p_kind, p_title, p_body, p_href from public.clinic_members m
  where m.clinic_id = p_clinic and m.role = p_role and m.active
$$;
revoke all on function public.notify_role(uuid, public.member_role, public.notification_kind, text, text, text) from public, anon, authenticated;

-- Caja abierta; si no hay y entra efectivo, se abre con fondo 0 y se avisa al administrador.
create function public.ensure_cash_session(p_clinic uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v uuid;
begin
  select id into v from public.cash_sessions where clinic_id = p_clinic and status = 'open';
  if v is null then
    insert into public.cash_sessions (clinic_id, opened_by, opening_float_cents, notes)
    values (p_clinic, (select auth.uid()), 0, 'Abierta automáticamente al registrar un cobro en efectivo')
    returning id into v;
    perform public.notify_role(p_clinic, 'clinic_admin', 'payment', 'Se abrió la caja automáticamente', 'Entró un cobro en efectivo sin caja abierta (fondo inicial 0).', '/caja');
  end if;
  return v;
end $$;
revoke all on function public.ensure_cash_session(uuid) from public, anon, authenticated;

create function public.invoice_status_for(p_total integer, p_paid integer) returns public.invoice_status
language sql immutable set search_path = ''
as $$ select case when p_paid >= p_total then 'paid'::public.invoice_status when p_paid > 0 then 'partially_paid'::public.invoice_status else 'issued'::public.invoice_status end $$;

-- Registra un pago y su movimiento de caja. La validacion de monto y permisos la hace quien llama.
create function public.apply_payment(p_invoice public.invoices, p_amount integer, p_method public.payment_method, p_reference text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_session uuid; v_pay uuid; v_paid integer;
begin
  if p_method = 'cash' then
    v_session := public.ensure_cash_session(p_invoice.clinic_id);
  else
    select id into v_session from public.cash_sessions where clinic_id = p_invoice.clinic_id and status = 'open';
  end if;
  insert into public.payments (clinic_id, invoice_id, patient_id, cash_session_id, amount_cents, method, reference, received_by)
  values (p_invoice.clinic_id, p_invoice.id, p_invoice.patient_id, v_session, p_amount, p_method, nullif(trim(p_reference), ''), (select auth.uid()))
  returning id into v_pay;
  insert into public.transactions (clinic_id, cash_session_id, kind, category, concept, amount_cents, method, patient_id, invoice_id, payment_id, created_by)
  values (p_invoice.clinic_id, v_session, 'income', 'tratamiento', 'Cobro ' || p_invoice.number, p_amount, p_method, p_invoice.patient_id, p_invoice.id, v_pay, (select auth.uid()));
  v_paid := p_invoice.paid_cents + p_amount;
  update public.invoices set paid_cents = v_paid, status = public.invoice_status_for(total_cents, v_paid) where id = p_invoice.id;
  return v_pay;
end $$;
revoke all on function public.apply_payment(public.invoices, integer, public.payment_method, text) from public, anon, authenticated;

/* ───────── Iniciar atencion ───────── */
create function public.start_encounter(p_appointment uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments; r public.member_role; v_id uuid; v_status public.encounter_status; v_reason text;
begin
  select * into a from public.appointments where id = p_appointment for update;
  if not found or not public.can_use_appointment(a.clinic_id, a.dentist_id) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  r := public.role_in(a.clinic_id);
  if not (r = 'clinic_admin' or (r = 'dentist' and a.dentist_id = (select auth.uid()))) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select id, status into v_id, v_status from public.encounters where appointment_id = p_appointment;
  if v_id is not null then return v_id; end if; -- ya iniciada (reintento o segunda pestaña)
  if a.status not in ('scheduled', 'confirmed', 'checked_in') then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;

  select reason into v_reason from public.v_current_anamnesis where patient_id = a.patient_id;
  insert into public.encounters (clinic_id, patient_id, appointment_id, dentist_id, status, chief_complaint)
  values (a.clinic_id, a.patient_id, a.id, a.dentist_id, 'in_progress',
          coalesce(v_reason, (select name from public.treatments where id = a.treatment_id)))
  returning id into v_id;

  update public.appointments
     set status = 'in_progress', started_at = now(), checked_in_at = coalesce(checked_in_at, now())
   where id = a.id;
  insert into public.appointment_events (clinic_id, appointment_id, from_status, to_status, actor_id)
  values (a.clinic_id, a.id, a.status, 'in_progress', (select auth.uid()));
  update public.patients set status = 'active' where id = a.patient_id and status = 'new';

  -- El tratamiento de la cita entra al plan como "hoy"; el odontologo lo puede quitar.
  if a.treatment_id is not null then
    insert into public.treatment_plan_items (clinic_id, patient_id, encounter_id, treatment_id, status, price_cents, created_by)
    values (a.clinic_id, a.patient_id, v_id, a.treatment_id, 'in_progress', 0, (select auth.uid()));
  end if;
  return v_id;
end $$;

/* ───────── Finalizar atencion: factura + pago + stock + cierre, todo o nada ───────── */
create function public.finish_encounter(
  p_encounter uuid, p_idempotency_key text, p_payment_method public.payment_method default null,
  p_payment_amount_cents integer default 0, p_discount_cents integer default 0, p_discount_reason text default null,
  p_reference text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.encounters; a public.appointments; r public.member_role; v_prev jsonb; v_sub integer; v_n integer; v_total integer;
  v_short jsonb := '[]'::jsonb; v_need record; v_lot record; v_remaining numeric; v_take numeric; v_year integer; v_num integer;
  v_prefix text; v_inv public.invoices; v_res jsonb; v_tz text; v_name text;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'idempotency_key';
  end if;
  select * into e from public.encounters where id = p_encounter for update;
  if not found or not public.can_read_clinical(e.patient_id) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  r := public.role_in(e.clinic_id);
  if not (r = 'clinic_admin' or (r = 'dentist' and e.dentist_id = (select auth.uid()))) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select response into v_prev from public.operation_results where clinic_id = e.clinic_id and key = p_idempotency_key;
  if v_prev is not null then return v_prev; end if;
  if e.status <> 'in_progress' then raise exception 'ALREADY_FINISHED' using errcode = 'P0001'; end if;
  select * into a from public.appointments where id = e.appointment_id for update;
  if a.status <> 'in_progress' then raise exception 'INVALID_STATE' using errcode = 'P0001'; end if;

  select count(*), coalesce(sum(price_cents), 0) into v_n, v_sub
    from public.treatment_plan_items where patient_id = e.patient_id and status = 'in_progress';
  if v_n = 0 then raise exception 'NO_ITEMS' using errcode = 'P0001'; end if;

  p_discount_cents := coalesce(p_discount_cents, 0);
  p_payment_amount_cents := coalesce(p_payment_amount_cents, 0);
  if p_discount_cents < 0 or p_discount_cents > v_sub then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'discount'; end if;
  if p_discount_cents > 0 then
    if r <> 'clinic_admin' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    if char_length(coalesce(trim(p_discount_reason), '')) < 3 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  end if;
  v_total := v_sub - p_discount_cents;
  if p_payment_amount_cents < 0 or p_payment_amount_cents > v_total then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'amount'; end if;
  if p_payment_amount_cents > 0 and p_payment_method is null then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'method'; end if;

  -- Insumos: si falta algo no se cierra nada y se devuelve la lista completa.
  for v_need in
    select ts.supply_item_id, si.name, si.unit, sum(ts.qty) as need,
           coalesce((select sum(l.qty_on_hand) from public.supply_lots l where l.supply_item_id = ts.supply_item_id), 0) as available
      from public.treatment_plan_items p
      join public.treatment_supplies ts on ts.treatment_id = p.treatment_id
      join public.supply_items si on si.id = ts.supply_item_id
     where p.patient_id = e.patient_id and p.status = 'in_progress'
     group by ts.supply_item_id, si.name, si.unit
  loop
    if v_need.available < v_need.need then
      v_short := v_short || jsonb_build_object('item', v_need.name, 'unit', v_need.unit, 'need', v_need.need, 'available', v_need.available);
    end if;
  end loop;
  if jsonb_array_length(v_short) > 0 then raise exception 'STOCK_SHORTAGE' using errcode = 'P0001', detail = v_short::text; end if;

  -- Factura con numero correlativo por clinica y año (sin huecos por concurrencia: la fila del contador se bloquea).
  v_tz := public.local_tz(e.clinic_id);
  v_year := extract(year from (now() at time zone v_tz))::int;
  insert into public.invoice_counters (clinic_id, year, last_number) values (e.clinic_id, v_year, 1)
  on conflict (clinic_id, year) do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_num;
  select coalesce(nullif(upper(left(regexp_replace(slug, '[^a-z]', '', 'g'), 3)), ''), 'FAC') into v_prefix from public.clinics where id = e.clinic_id;

  insert into public.invoices (clinic_id, patient_id, encounter_id, number, subtotal_cents, discount_cents, discount_reason, total_cents, created_by)
  values (e.clinic_id, e.patient_id, e.id, v_prefix || '-' || v_year || '-' || lpad(v_num::text, 6, '0'),
          v_sub, p_discount_cents, nullif(trim(p_discount_reason), ''), v_total, (select auth.uid()))
  returning * into v_inv;
  insert into public.invoice_items (clinic_id, invoice_id, treatment_id, plan_item_id, description, tooth_fdi, qty, unit_price_cents, total_cents)
  select e.clinic_id, v_inv.id, p.treatment_id, p.id,
         t.name || coalesce(' · pieza ' || p.tooth_fdi, '') || case when cardinality(p.surfaces) > 0 then ' (' || array_to_string(p.surfaces, '') || ')' else '' end,
         p.tooth_fdi, 1, p.price_cents, p.price_cents
    from public.treatment_plan_items p join public.treatments t on t.id = p.treatment_id
   where p.patient_id = e.patient_id and p.status = 'in_progress'
   order by p.sequence, p.created_at;

  -- Descuento de insumos por lote: primero vence, primero sale.
  for v_need in
    select ts.supply_item_id, sum(ts.qty) as need
      from public.treatment_plan_items p join public.treatment_supplies ts on ts.treatment_id = p.treatment_id
     where p.patient_id = e.patient_id and p.status = 'in_progress'
     group by ts.supply_item_id
  loop
    v_remaining := v_need.need;
    for v_lot in
      select id, qty_on_hand, unit_cost_cents from public.supply_lots
       where supply_item_id = v_need.supply_item_id and qty_on_hand > 0
       order by expires_on nulls last, received_at
       for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_lot.qty_on_hand);
      insert into public.stock_movements (clinic_id, supply_item_id, lot_id, delta, reason, ref_type, ref_id, unit_cost_cents, created_by)
      values (e.clinic_id, v_need.supply_item_id, v_lot.id, -v_take, 'treatment', 'encounter', e.id, v_lot.unit_cost_cents, (select auth.uid()));
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;

  if p_payment_amount_cents > 0 then
    perform public.apply_payment(v_inv, p_payment_amount_cents, p_payment_method, p_reference);
  else
    update public.invoices set status = public.invoice_status_for(total_cents, 0) where id = v_inv.id;
  end if;
  select * into v_inv from public.invoices where id = v_inv.id;

  update public.treatment_plan_items set status = 'done', completed_encounter_id = e.id
   where patient_id = e.patient_id and status = 'in_progress';
  update public.encounters set status = 'finished', finished_at = now() where id = e.id;
  update public.appointments set status = 'completed', completed_at = now() where id = a.id;
  insert into public.appointment_events (clinic_id, appointment_id, from_status, to_status, actor_id)
  values (a.clinic_id, a.id, 'in_progress', 'completed', (select auth.uid()));

  -- Aviso de stock bajo para lo que se acaba de usar.
  for v_need in
    select s.name, s.on_hand, s.unit from public.v_stock s
     where s.supply_item_id in (select distinct m.supply_item_id from public.stock_movements m where m.ref_id = e.id)
       and s.on_hand <= s.min_stock
  loop
    perform public.notify_role(e.clinic_id, 'clinic_admin', 'low_stock', 'Stock bajo: ' || v_need.name, 'Quedan ' || trim(to_char(v_need.on_hand, 'FM999999990.###')) || ' ' || v_need.unit, '/inventario');
  end loop;

  select full_name into v_name from public.patients where id = e.patient_id;
  insert into public.audit_log (clinic_id, actor_id, actor_role, action, entity_type, entity_id, patient_id, after)
  values (e.clinic_id, (select auth.uid()), r, 'encounter.finish', 'encounters', e.id, e.patient_id,
          jsonb_build_object('invoice', v_inv.number, 'total_cents', v_inv.total_cents, 'paid_cents', v_inv.paid_cents));

  v_res := jsonb_build_object('invoice_id', v_inv.id, 'number', v_inv.number, 'total_cents', v_inv.total_cents,
    'paid_cents', v_inv.paid_cents, 'balance_cents', v_inv.total_cents - v_inv.paid_cents, 'patient', v_name);
  insert into public.operation_results (clinic_id, key, operation, response) values (e.clinic_id, p_idempotency_key, 'finish_encounter', v_res);
  return v_res;
end $$;

/* ───────── Cobrar saldo pendiente ───────── */
create function public.record_payment(
  p_invoice uuid, p_amount_cents integer, p_method public.payment_method, p_idempotency_key text, p_reference text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_inv public.invoices; v_prev jsonb; v_res jsonb;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'idempotency_key';
  end if;
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found or not public.can_bill(v_inv.clinic_id, v_inv.patient_id) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select response into v_prev from public.operation_results where clinic_id = v_inv.clinic_id and key = p_idempotency_key;
  if v_prev is not null then return v_prev; end if;
  if v_inv.status = 'voided' then raise exception 'INVALID_STATE' using errcode = 'P0001'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > v_inv.total_cents - v_inv.paid_cents then
    raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'amount';
  end if;
  perform public.apply_payment(v_inv, p_amount_cents, p_method, p_reference);
  select * into v_inv from public.invoices where id = p_invoice;
  v_res := jsonb_build_object('invoice_id', v_inv.id, 'number', v_inv.number, 'paid_cents', v_inv.paid_cents, 'balance_cents', v_inv.total_cents - v_inv.paid_cents);
  insert into public.operation_results (clinic_id, key, operation, response) values (v_inv.clinic_id, p_idempotency_key, 'record_payment', v_res);
  return v_res;
end $$;

/* ───────── Anular un pago (solo admin, con motivo; no se borra nada) ───────── */
create function public.void_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare p public.payments; v_inv public.invoices; v_session uuid; v_paid integer;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found or not public.is_admin(p.clinic_id) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p.status = 'voided' then raise exception 'INVALID_STATE' using errcode = 'P0001'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into v_inv from public.invoices where id = p.invoice_id for update;

  update public.payments set status = 'voided', voided_at = now(), void_reason = trim(p_reason) where id = p.id;
  select id into v_session from public.cash_sessions where clinic_id = p.clinic_id and status = 'open';
  insert into public.transactions (clinic_id, cash_session_id, kind, category, concept, amount_cents, method, patient_id, invoice_id, payment_id, created_by)
  values (p.clinic_id, v_session, 'adjustment', 'anulacion', 'Anulación de cobro ' || v_inv.number || ': ' || trim(p_reason), -p.amount_cents, p.method,
          p.patient_id, p.invoice_id, p.id, (select auth.uid()));
  v_paid := v_inv.paid_cents - p.amount_cents;
  update public.invoices set paid_cents = v_paid, status = public.invoice_status_for(total_cents, v_paid) where id = v_inv.id;
end $$;

/* ───────── Caja ───────── */
create function public.open_cash_session(p_opening_float_cents integer) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid; v uuid;
begin
  select clinic_id into v_clinic from public.clinic_members where user_id = (select auth.uid()) and active;
  if v_clinic is null or not public.is_cashier(v_clinic) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_opening_float_cents is null or p_opening_float_cents < 0 then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'amount'; end if;
  begin
    insert into public.cash_sessions (clinic_id, opened_by, opening_float_cents) values (v_clinic, (select auth.uid()), p_opening_float_cents) returning id into v;
  exception when unique_violation then raise exception 'CASH_ALREADY_OPEN' using errcode = 'P0001';
  end;
  return v;
end $$;

-- Esperado en efectivo = fondo + entradas en efectivo − salidas en efectivo (anulaciones incluidas).
create function public.cash_expected(p_session uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select s.opening_float_cents + coalesce((
    select sum(case when t.kind = 'expense' then -abs(t.amount_cents) else t.amount_cents end)::integer
      from public.transactions t where t.cash_session_id = s.id and t.method = 'cash'
  ), 0)
  from public.cash_sessions s where s.id = p_session and public.is_cashier(s.clinic_id)
$$;

create function public.close_cash_session(p_counted_cents integer, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid; s public.cash_sessions; v_expected integer; v_diff integer;
begin
  select clinic_id into v_clinic from public.clinic_members where user_id = (select auth.uid()) and active;
  if v_clinic is null or not public.is_cashier(v_clinic) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into s from public.cash_sessions where clinic_id = v_clinic and status = 'open' for update;
  if not found then raise exception 'NO_OPEN_CASH' using errcode = 'P0001'; end if;
  if p_counted_cents is null or p_counted_cents < 0 then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'amount'; end if;
  v_expected := public.cash_expected(s.id);
  v_diff := p_counted_cents - v_expected;
  if v_diff <> 0 and char_length(coalesce(trim(p_notes), '')) < 3 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  update public.cash_sessions
     set status = 'closed', closed_by = (select auth.uid()), closed_at = now(), expected_cents = v_expected,
         counted_cents = p_counted_cents, difference_cents = v_diff, notes = coalesce(nullif(trim(p_notes), ''), notes)
   where id = s.id;
  if v_diff <> 0 then
    perform public.notify_role(v_clinic, 'clinic_admin', 'payment', 'Cierre de caja con diferencia',
      'Diferencia de ' || to_char(v_diff / 100.0, 'FM999999990.00') || ' Bs.: ' || trim(p_notes), '/caja');
  end if;
  return jsonb_build_object('expected_cents', v_expected, 'counted_cents', p_counted_cents, 'difference_cents', v_diff);
end $$;

-- Gastos e ingresos que no son cobros de tratamiento (compra menor, venta de un cepillo...).
create function public.add_cash_movement(
  p_kind public.transaction_kind, p_amount_cents integer, p_method public.payment_method, p_concept text, p_category text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_clinic uuid; v_session uuid; v uuid;
begin
  select clinic_id into v_clinic from public.clinic_members where user_id = (select auth.uid()) and active;
  if v_clinic is null or not public.is_cashier(v_clinic) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('income', 'expense') then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'kind'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'amount'; end if;
  if char_length(coalesce(trim(p_concept), '')) < 3 then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'concept'; end if;
  if p_method = 'cash' then
    v_session := public.ensure_cash_session(v_clinic);
  else
    select id into v_session from public.cash_sessions where clinic_id = v_clinic and status = 'open';
  end if;
  insert into public.transactions (clinic_id, cash_session_id, kind, category, concept, amount_cents, method, created_by)
  values (v_clinic, v_session, p_kind, coalesce(nullif(trim(p_category), ''), case when p_kind = 'expense' then 'gasto' else 'otro ingreso' end),
          trim(p_concept), case when p_kind = 'expense' then -p_amount_cents else p_amount_cents end, p_method, (select auth.uid()))
  returning id into v;
  return v;
end $$;

/* ───────── Inventario ───────── */
create function public.receive_stock(
  p_item uuid, p_qty numeric, p_lot_code text default null, p_expires_on date default null,
  p_unit_cost_cents integer default null, p_supplier uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare i public.supply_items; v_lot uuid;
begin
  select * into i from public.supply_items where id = p_item;
  if not found or not public.is_admin(i.clinic_id) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'qty'; end if;
  if p_unit_cost_cents is not null and p_unit_cost_cents < 0 then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'cost'; end if;
  if p_supplier is not null and not exists (select 1 from public.suppliers where id = p_supplier and clinic_id = i.clinic_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.supply_lots (clinic_id, supply_item_id, lot_code, expires_on, unit_cost_cents, supplier_id)
  values (i.clinic_id, i.id, nullif(trim(p_lot_code), ''), p_expires_on, p_unit_cost_cents, p_supplier)
  returning id into v_lot;
  insert into public.stock_movements (clinic_id, supply_item_id, lot_id, delta, reason, unit_cost_cents, created_by)
  values (i.clinic_id, i.id, v_lot, p_qty, 'purchase', p_unit_cost_cents, (select auth.uid()));
  return v_lot;
end $$;

create function public.adjust_stock(p_lot uuid, p_delta numeric, p_reason public.stock_reason, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare l public.supply_lots;
begin
  select * into l from public.supply_lots where id = p_lot for update;
  if not found or not public.is_admin(l.clinic_id) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p_reason not in ('adjustment', 'waste', 'return') then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'reason'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'INVALID_PAYLOAD' using errcode = 'P0001', detail = 'qty'; end if;
  if char_length(coalesce(trim(p_note), '')) < 3 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if l.qty_on_hand + p_delta < 0 then raise exception 'STOCK_SHORTAGE' using errcode = 'P0001'; end if;
  insert into public.stock_movements (clinic_id, supply_item_id, lot_id, delta, reason, unit_cost_cents, note, created_by)
  values (l.clinic_id, l.supply_item_id, l.id, p_delta, p_reason, l.unit_cost_cents, trim(p_note), (select auth.uid()));
end $$;

grant execute on function
  public.start_encounter(uuid),
  public.finish_encounter(uuid, text, public.payment_method, integer, integer, text, text),
  public.record_payment(uuid, integer, public.payment_method, text, text),
  public.void_payment(uuid, text),
  public.open_cash_session(integer),
  public.cash_expected(uuid),
  public.close_cash_session(integer, text),
  public.add_cash_movement(public.transaction_kind, integer, public.payment_method, text, text),
  public.receive_stock(uuid, numeric, text, date, integer, uuid),
  public.adjust_stock(uuid, numeric, public.stock_reason, text)
to authenticated;
