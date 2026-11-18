import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, ID, rows, type Actor, type Db } from './harness'
import type { FinishCareResult } from '../../src/server/actions/workflow'

const dentist = { uid: ID.dentistA }
const other = { uid: ID.dentistB }
const reception = { uid: ID.reception }
const admin = { uid: ID.admin }
const appointment = '00000000-0000-4000-8000-000000000201'
const anotherAppointment = '00000000-0000-4000-8000-000000000202'
let db: Db

beforeEach(async () => { db = await createDb() })
afterEach(async () => { await db.close() })

const start = async (actor: Actor, id = appointment) =>
  (await rows(db, actor, "select public.start_care($1)->>'encounterId' as id", [id]))[0].id as string
const finish = async (actor: Actor, encounter: string, key = 'same-click-key') =>
  (await rows(db, actor, 'select public.finish_care($1, $2) as result', [encounter, key]))[0].result as FinishCareResult
const query = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows
const receiveGloves = (qty: number, expires: string) => rows(db, admin,
  "select public.receive_stock((select id from public.supply_items where name = 'Guantes de nitrilo'), $1, null, $2::date)",
  [qty, expires])
const configureCleaning = () => query(`update public.appointments set
  treatment_id = (select id from public.treatments where code = 'limpieza')
  where id in ($1, $2)`, [appointment, anotherAppointment])

describe('care workflow', () => {
  it('reception checks in, only the assigned dentist/admin can start or finish, including on replay', async () => {
    await rows(db, reception, "select public.change_appointment_status($1, 'checked_in')", [appointment])
    expect(await rows(db, other, 'select id from public.appointments where id = $1', [appointment])).toEqual([])
    await expect(start(reception)).rejects.toThrow('FORBIDDEN')
    await expect(start(other)).rejects.toThrow('NOT_FOUND')
    const [encounter, duplicate] = await Promise.all([start(dentist), start(dentist)])
    expect(duplicate).toBe(encounter)
    // Both dentists can read this patient's chart, only A owns this appointment.
    await query('update public.patients set primary_dentist_id = $1 where id = (select patient_id from public.encounters where id = $2)', [ID.dentistB, encounter])
    expect(await rows(db, other, 'select id from public.encounters where id = $1', [encounter])).toHaveLength(1)
    await expect(finish(other, encounter)).rejects.toThrow('FORBIDDEN')
    await expect(finish(reception, encounter)).rejects.toThrow('NOT_FOUND')
    await expect(finish('anon', encounter)).rejects.toThrow(/permission denied/)
    await expect(finish({ uid: '00000000-0000-4000-8000-000000000999' }, encounter)).rejects.toThrow('NOT_FOUND')
    const result = await finish(admin, encounter)
    expect(await finish(dentist, encounter)).toEqual(result)
    await expect(finish(other, encounter)).rejects.toThrow('FORBIDDEN')
    expect(await rows(db, reception, 'select id from public.encounters where id = $1', [encounter])).toEqual([])
  })

  it('bills only today’s items attached to this visit, exactly once, even when stock is missing', async () => {
    await configureCleaning()
    await query('update public.appointments set patient_id = (select patient_id from public.appointments where id = $1) where id = $2', [appointment, anotherAppointment])
    const encounter = await start(dentist)
    const sibling = await start(dentist, anotherAppointment)
    await query(`insert into public.treatment_plan_items(patient_id, encounter_id, treatment_id, status, price_cents)
      select patient_id, id, (select id from public.treatments where code = 'consulta'), 'planned', 0
      from public.encounters where id = $1`, [encounter])
    await receiveGloves(1.5, '2099-01-01')
    await receiveGloves(10, '2000-01-01')
    const [a, b] = await Promise.all([finish(dentist, encounter), finish(dentist, encounter)])
    expect(a).toEqual(b)
    expect(a).toMatchObject({ encounterId: encounter, pendingSupplyCount: 2, invoiceId: expect.any(String) })
    await expect(finish(dentist, encounter, 'different-key')).rejects.toThrow('ALREADY_FINISHED')
    expect(await query('select e.status, a.status as appointment from public.encounters e join public.appointments a on a.id = e.appointment_id where e.id = $1', [encounter]))
      .toEqual([{ status: 'finished', appointment: 'completed' }])
    expect(await query("select 1 from public.appointment_events where appointment_id = $1 and to_status = 'completed'", [appointment])).toHaveLength(1)
    expect(await query('select total_cents, paid_cents from public.invoices where id = $1', [a.invoiceId]))
      .toEqual([{ total_cents: a.totalCents, paid_cents: 0 }])
    expect(await query('select total_cents from public.invoice_items where invoice_id = $1', [a.invoiceId])).toEqual([{ total_cents: a.totalCents }])
    expect(await query("select price_cents from public.treatments where code = 'limpieza'")).toEqual([{ price_cents: a.totalCents }])
    expect(await query('select status from public.treatment_plan_items where encounter_id = $1 order by status::text', [encounter]))
      .toEqual([{ status: 'done' }, { status: 'planned' }])
    await expect(rows(db, dentist, "update public.treatment_plan_items set status = 'in_progress' where encounter_id = $1 and status = 'planned'", [encounter]))
      .rejects.toThrow('IMMUTABLE')
    expect(await query('select status from public.treatment_plan_items where encounter_id = $1', [sibling])).toEqual([{ status: 'in_progress' }])
    expect(await query('select delta::float from public.stock_movements where ref_id = $1', [encounter])).toEqual([{ delta: -1.5 }])
    expect(await query('select qty_on_hand::float as qty from public.supply_lots order by expires_on')).toEqual([{ qty: 10 }, { qty: 0 }])
    expect(await rows(db, admin, 'select qty_missing::float as qty from public.stock_consumption_deficits where resolved_at is null order by qty'))
      .toEqual([{ qty: 0.5 }, { qty: 4 }])
    expect(await rows(db, other, 'select 1 from public.stock_consumption_deficits')).toEqual([])
    await expect(rows(db, admin, 'delete from public.stock_consumption_deficits')).rejects.toThrow(/permission denied/)
    expect(await rows(db, admin, "select 1 from public.notifications where kind = 'low_stock'")).toHaveLength(2)
    expect(await query('select 1 from public.payments union all select 1 from public.transactions union all select 1 from public.cash_sessions')).toEqual([])
  })

  it('two visits sharing the same retry key allocate usable lots FEFO and only record the uncovered remainder', async () => {
    await configureCleaning()
    const first = await start(admin)
    const second = await start(dentist, anotherAppointment)
    await receiveGloves(2, '2099-02-01')
    await receiveGloves(1, '2099-01-01')
    const [a, b] = await Promise.all([finish(dentist, first), finish(dentist, second)])
    expect(a.invoiceId).not.toBe(b.invoiceId)
    expect([a.pendingSupplyCount, b.pendingSupplyCount].sort()).toEqual([1, 2])
    const fullySupplied = a.pendingSupplyCount === 1 ? first : second
    expect(await query(`select l.expires_on::text, m.delta::float from public.stock_movements m
      join public.supply_lots l on l.id = m.lot_id where m.ref_id = $1 order by l.expires_on`, [fullySupplied]))
      .toEqual([{ expires_on: '2099-01-01', delta: -1 }, { expires_on: '2099-02-01', delta: -1 }])
    expect(await query('select qty_on_hand::float as qty from public.supply_lots')).toEqual([{ qty: 0 }, { qty: 0 }])
    expect(await query(`select sum(d.qty_missing)::float as missing from public.stock_consumption_deficits d
      join public.supply_items s on s.id = d.supply_item_id where s.name = 'Guantes de nitrilo'`)).toEqual([{ missing: 1 }])
  })

  it('requires a written evaluation when no treatment was performed and returns the original unbilled receipt on retry', async () => {
    const encounter = await start(dentist)
    await rows(db, dentist, 'delete from public.treatment_plan_items where encounter_id = $1', [encounter])
    await rows(db, dentist, 'update public.encounters set notes = $1 where id = $2', [' \n\t', encounter])
    await expect(finish(dentist, encounter)).rejects.toThrow('EVALUATION_NOTE_REQUIRED')
    expect(await query('select status from public.encounters where id = $1', [encounter])).toEqual([{ status: 'in_progress' }])
    await rows(db, dentist, 'update public.encounters set notes = $1 where id = $2', ['Evaluación registrada en la consulta.', encounter])
    const result = await finish(dentist, encounter)
    expect(result).toEqual({ encounterId: encounter, invoiceId: null, totalCents: 0, pendingSupplyCount: 0 })
    expect(await finish(dentist, encounter)).toEqual(result)
    expect(await query('select 1 from public.invoices union all select 1 from public.invoice_counters')).toEqual([])
  })

  it('resumes a legacy encounter, reuses its linked journal, and closes only that session with its original notes', async () => {
    const [{ id: legacy }] = await rows(db, dentist, 'select public.start_encounter($1) as id', [appointment])
    const encounter = await start(dentist)
    expect(encounter).toBe(legacy)
    const [linked] = await rows(db, dentist, 'select id,patient_id from public.clinical_sessions where encounter_id = $1', [encounter])
    expect(await start(dentist)).toBe(encounter)
    expect(await query('select id from public.clinical_sessions where encounter_id = $1', [encounter])).toEqual([{ id: linked.id }])
    const [manual] = await rows(db, dentist, "insert into public.clinical_sessions (patient_id,title) values ($1,'Control manual') returning id", [linked.patient_id])
    const addNote = (session: unknown, body: string) => rows(db, dentist,
      'insert into public.clinical_messages (patient_id,session_id,body) values ($1,$2,$3)', [linked.patient_id, session, body])
    await addNote(manual.id, 'Nota de otra sesión.')
    await rows(db, dentist, 'delete from public.treatment_plan_items where encounter_id = $1', [encounter])
    await expect(finish(dentist, encounter)).rejects.toThrow('EVALUATION_NOTE_REQUIRED')
    await addNote(linked.id, 'Evaluación de esta consulta.')
    const result = await finish(dentist, encounter)
    expect(result.invoiceId).toBeNull()
    expect(await finish(dentist, encounter)).toEqual(result)
    expect(await query('select status, closed_at is not null as closed from public.clinical_sessions where id = $1', [linked.id]))
      .toEqual([{ status: 'closed', closed: true }])
    expect(await query('select status from public.clinical_sessions where id = $1', [manual.id])).toEqual([{ status: 'open' }])
    expect(await query('select body from public.clinical_messages where session_id = $1', [linked.id])).toEqual([{ body: 'Evaluación de esta consulta.' }])
    await expect(addNote(linked.id, 'Tardía')).rejects.toThrow('SESSION_CLOSED')
  })

  it('rolls back the invoice, stock, events and clinical state on a late failure; retry succeeds', async () => {
    await configureCleaning()
    await receiveGloves(1, '2099-01-01')
    const encounter = await start(dentist)
    await db.exec("alter table public.care_finish_receipts add constraint fail_write check (idempotency_key <> 'same-click-key')")
    await expect(finish(dentist, encounter)).rejects.toThrow(/fail_write/)
    expect(await query('select status from public.clinical_sessions where encounter_id = $1', [encounter])).toEqual([{ status: 'open' }])
    expect(await query('select 1 from public.invoices union all select 1 from public.invoice_counters union all select 1 from public.stock_consumption_deficits')).toEqual([])
    expect(await query('select qty_on_hand::float as qty from public.supply_lots')).toEqual([{ qty: 1 }])
    expect(await query(`select a.status as appt, e.status as encounter, p.status as item from public.encounters e
      join public.appointments a on a.id = e.appointment_id join public.treatment_plan_items p on p.encounter_id = e.id where e.id = $1`, [encounter]))
      .toEqual([{ appt: 'in_progress', encounter: 'in_progress', item: 'in_progress' }])
    expect(await query("select 1 from public.appointment_events where appointment_id = $1 and to_status = 'completed'", [appointment])).toEqual([])
    await db.exec('alter table public.care_finish_receipts drop constraint fail_write')
    expect(await finish(dentist, encounter)).toMatchObject({ pendingSupplyCount: 2 })
  })
})
