// Sprint 4: consulta -> factura -> pago -> stock -> caja. Reglas de dinero y stock en la base de datos.
import { beforeAll, describe, expect, it } from 'vitest'
import { ID, as, createDb, rows, type Actor, type Db } from './harness'

let db: Db
const admin = { uid: ID.admin }
const dentistA = { uid: ID.dentistA }
const dentistB = { uid: ID.dentistB }
const reception = { uid: ID.reception }
const APPT = '00000000-0000-4000-8000-000000000201' // hoy 09:00, paciente 101, Dra. A, consulta
const PATIENT = '00000000-0000-4000-8000-000000000101'

const one = async (actor: Actor, sql: string, params: unknown[] = []) => (await rows(db, actor, sql, params))[0] as Record<string, unknown>
const start = (actor: Actor, appt = APPT) => one(actor, 'select public.start_encounter($1) as id', [appt]).then((r) => r.id as string)
const finish = (actor: Actor, enc: string, key: string, o: { method?: string; amount?: number; discount?: number; reason?: string } = {}) =>
  one(actor, 'select public.finish_encounter($1, $2, $3::public.payment_method, $4::int, $5::int, $6) as r',
    [enc, key, o.method ?? null, o.amount ?? 0, o.discount ?? 0, o.reason ?? null]).then((r) => r.r as Record<string, number | string>)
const treatment = async (code: string) => (await one('service', 'select id, price_cents from public.treatments where code = $1', [code])) as { id: string; price_cents: number }
const addItem = async (actor: Actor, enc: string, code: string, tooth: number | null = null, status = 'in_progress', price = 1) =>
  rows(db, actor, `insert into public.treatment_plan_items (patient_id, encounter_id, treatment_id, tooth_fdi, status, price_cents, created_by)
    values ($1, $2, $3, $4, $5::public.plan_status, $6, $7) returning id, price_cents`, [PATIENT, enc, (await treatment(code)).id, tooth, status, price, (actor as { uid: string }).uid])
const receive = async (actor: Actor, item: string, qty: number, expires: string | null = null, cost = 100) =>
  one(actor, `select public.receive_stock((select id from public.supply_items where name = $1), $2, null, $3::date, $4) as id`, [item, qty, expires, cost]).then((r) => r.id as string)
const onHand = async (item: string) => Number((await one('service', 'select on_hand from public.v_stock where name = $1', [item])).on_hand)

beforeAll(async () => {
  db = await createDb()
})

let enc = ''
describe('Iniciar atención', () => {
  it('recepción y otro odontólogo no pueden iniciar', async () => {
    await expect(start(reception)).rejects.toThrow('FORBIDDEN')
    await expect(start(dentistB)).rejects.toThrow('NOT_FOUND') // ni siquiera ve la cita
  })
  it('el odontólogo de la cita la inicia; repetir devuelve la misma atención', async () => {
    enc = await start(dentistA)
    expect(await start(dentistA)).toBe(enc)
    const a = await one('service', 'select status, started_at, checked_in_at from public.appointments where id = $1', [APPT])
    expect(a.status).toBe('in_progress')
    expect(a.started_at).not.toBeNull()
    expect(a.checked_in_at).not.toBeNull()
    // El tratamiento de la cita (consulta) entra al plan de hoy con su tarifa.
    const items = await rows(db, 'service', 'select status, price_cents from public.treatment_plan_items where encounter_id = $1', [enc])
    expect(items).toEqual([{ status: 'in_progress', price_cents: (await treatment('consulta')).price_cents }])
  })
  it('el precio lo pone la base de datos, no el navegador', async () => {
    const [r] = await addItem(dentistA, enc, 'resina2', 36, 'in_progress', 1)
    expect(r.price_cents).toBe((await treatment('resina2')).price_cents)
  })
  it('un ítem para la próxima sesión no se cobra hoy', async () => {
    await addItem(dentistA, enc, 'limpieza', null, 'planned')
  })
})

describe('Finalizar atención', () => {
  it('sin insumos no se cierra nada y se devuelve la lista de faltantes', async () => {
    const err = await finish(dentistA, enc, 'key-shortage-1').catch((e: { message: string; detail?: string }) => e)
    expect((err as Error).message).toBe('STOCK_SHORTAGE')
    const short = JSON.parse((err as { detail: string }).detail) as { item: string }[]
    expect(short.map((s) => s.item)).toContain('Resina compuesta A2')
    expect((await one('service', 'select status from public.encounters where id = $1', [enc])).status).toBe('in_progress')
    expect(await rows(db, 'service', 'select 1 from public.invoices')).toHaveLength(0)
  })
  it('solo el admin repone stock', async () => {
    await expect(receive(dentistA, 'Guantes de nitrilo', 10)).rejects.toThrow('NOT_FOUND')
    await expect(receive(reception, 'Guantes de nitrilo', 10)).rejects.toThrow('NOT_FOUND')
    for (const item of ['Guantes de nitrilo', 'Mascarillas descartables', 'Anestesico lidocaina 2 %', 'Agujas dentales cortas', 'Acido grabador 37 %', 'Adhesivo universal']) {
      await receive(admin, item, 50)
    }
    // Dos lotes de resina: el que vence antes sale primero.
    await receive(admin, 'Resina compuesta A2', 5, '2027-12-31')
    await receive(admin, 'Resina compuesta A2', 1, '2027-01-31')
    expect(await onHand('Resina compuesta A2')).toBe(6)
  })
  it('recepción no puede cerrar la atención y el odontólogo no puede dar descuento', async () => {
    await expect(finish(reception, enc, 'key-reception-1')).rejects.toThrow('NOT_FOUND')
    await expect(finish(dentistA, enc, 'key-discount-1', { discount: 1000, reason: 'amigo' })).rejects.toThrow('FORBIDDEN')
    await expect(finish(dentistA, enc, 'key-amount-1', { method: 'cash', amount: 999_999_999 })).rejects.toThrow('INVALID_PAYLOAD')
  })
  let invoice = ''
  it('cierra todo junto: factura, pago parcial, stock FEFO, cita y plan', async () => {
    const total = (await treatment('consulta')).price_cents + (await treatment('resina2')).price_cents
    const r = await finish(dentistA, enc, 'key-finish-0001', { method: 'cash', amount: 10_000 })
    invoice = r.invoice_id as string
    expect(r.number).toMatch(/^ALQ-\d{4}-000001$/)
    expect(r.total_cents).toBe(total)
    expect(r.paid_cents).toBe(10_000)
    expect(r.balance_cents).toBe(total - 10_000)
    expect((await one('service', 'select status from public.invoices where id = $1', [invoice])).status).toBe('partially_paid')
    expect(await rows(db, 'service', 'select 1 from public.invoice_items where invoice_id = $1', [invoice])).toHaveLength(2)
    // Resina: se usan 2; el lote que vence en enero (1 u.) queda en 0 y del otro sale 1.
    const lots = await rows(db, 'service', `select expires_on::text as e, qty_on_hand::float as q from public.supply_lots l
      join public.supply_items i on i.id = l.supply_item_id where i.name = 'Resina compuesta A2' order by expires_on`)
    expect(lots).toEqual([{ e: '2027-01-31', q: 0 }, { e: '2027-12-31', q: 4 }])
    expect(await onHand('Guantes de nitrilo')).toBe(48)
    expect((await one('service', 'select status from public.appointments where id = $1', [APPT])).status).toBe('completed')
    expect((await one('service', 'select status from public.encounters where id = $1', [enc])).status).toBe('finished')
    const plan = await rows(db, 'service', 'select status::text as s from public.treatment_plan_items where patient_id = $1 order by s', [PATIENT])
    expect(plan.map((p) => p.s)).toEqual(['done', 'done', 'planned'])
  })
  it('reintento con la misma clave devuelve lo mismo y no duplica', async () => {
    const r = await finish(dentistA, enc, 'key-finish-0001', { method: 'cash', amount: 10_000 })
    expect(r.invoice_id).toBe(invoice)
    expect(await rows(db, 'service', 'select 1 from public.payments')).toHaveLength(1)
  })
  it('un segundo cierre con otra clave se bloquea', async () => {
    await expect(finish(dentistA, enc, 'key-finish-0002')).rejects.toThrow('ALREADY_FINISHED')
  })
  it('el efectivo sin caja abierta la abre sola (fondo 0) y avisa al admin', async () => {
    const s = await rows(db, 'service', "select opening_float_cents from public.cash_sessions where status = 'open'")
    expect(s).toEqual([{ opening_float_cents: 0 }])
    expect(await rows(db, admin, "select 1 from public.notifications where title like 'Se abrió la caja%'")).toHaveLength(1)
  })
  it('una addenda solo se agrega a una atención cerrada', async () => {
    await rows(db, dentistA, 'insert into public.encounter_addenda (patient_id, encounter_id, reason, notes, created_by) values ($1, $2, $3, $4, $5)',
      [PATIENT, enc, 'Corrección', 'Era la pieza 37, no la 36.', ID.dentistA])
    await expect(rows(db, dentistA, 'update public.encounters set notes = $2 where id = $1', [enc, 'cambio'])).rejects.toThrow(/IMMUTABLE|permission/)
  })

  it('cobrar el saldo: recepción cobra, no se puede cobrar de más y la factura queda pagada', async () => {
    const balance = Number((await one('service', 'select total_cents - paid_cents as b from public.invoices where id = $1', [invoice])).b)
    const pay = (actor: Actor, amount: number, key: string) =>
      one(actor, "select public.record_payment($1, $2, 'qr', $3) as r", [invoice, amount, key]).then((r) => r.r as Record<string, number>)
    await expect(pay(reception, balance + 1, 'pay-over-001')).rejects.toThrow('INVALID_PAYLOAD')
    await expect(pay(dentistB, balance, 'pay-other-01')).rejects.toThrow('NOT_FOUND')
    const r = await pay(reception, balance, 'pay-balance-1')
    expect(r.balance_cents).toBe(0)
    expect((await pay(reception, balance, 'pay-balance-1')).balance_cents).toBe(0) // reintento
    expect((await one('service', 'select status from public.invoices where id = $1', [invoice])).status).toBe('paid')
  })
  it('anular un pago: solo admin, con motivo; queda el rastro y la factura vuelve a tener saldo', async () => {
    const p = (await one('service', "select id, amount_cents from public.payments where method = 'qr'")) as { id: string; amount_cents: number }
    await expect(rows(db, reception, 'select public.void_payment($1, $2)', [p.id, 'error'])).rejects.toThrow('NOT_FOUND')
    await expect(rows(db, admin, 'select public.void_payment($1, $2)', [p.id, ''])).rejects.toThrow('REASON_REQUIRED')
    await rows(db, admin, 'select public.void_payment($1, $2)', [p.id, 'Se cobró dos veces'])
    expect((await one('service', 'select status from public.invoices where id = $1', [invoice])).status).toBe('partially_paid')
    expect(await rows(db, 'service', "select amount_cents from public.transactions where kind = 'adjustment'")).toEqual([{ amount_cents: -p.amount_cents }])
    await expect(rows(db, admin, 'select public.void_payment($1, $2)', [p.id, 'otra vez'])).rejects.toThrow('INVALID_STATE')
  })
})

describe('Caja', () => {
  it('no se abren dos cajas', async () => {
    await expect(rows(db, reception, 'select public.open_cash_session(5000)')).rejects.toThrow('CASH_ALREADY_OPEN')
  })
  it('gasto en efectivo y cierre: el esperado es fondo + entradas − salidas', async () => {
    await rows(db, reception, "select public.add_cash_movement('expense', 2000, 'cash', 'Compra de agua')")
    await expect(rows(db, dentistA, "select public.add_cash_movement('expense', 2000, 'cash', 'Compra')")).rejects.toThrow('FORBIDDEN')
    const expected = Number((await one(reception, "select public.cash_expected(id) as e from public.cash_sessions where status = 'open'")).e)
    expect(expected).toBe(0 + 10_000 - 2_000)
    await expect(rows(db, reception, 'select public.close_cash_session($1)', [expected - 500])).rejects.toThrow('REASON_REQUIRED')
    const r = (await one(reception, 'select public.close_cash_session($1, $2) as r', [expected - 500, 'Faltó cambio'])).r as Record<string, number>
    expect(r.difference_cents).toBe(-500)
    expect(await rows(db, admin, "select 1 from public.notifications where title = 'Cierre de caja con diferencia'")).toHaveLength(1)
    await expect(rows(db, reception, 'select public.close_cash_session(0)')).rejects.toThrow('NO_OPEN_CASH')
    await rows(db, reception, 'select public.open_cash_session(5000)')
  })
})

describe('Inventario', () => {
  it('un ajuste no puede dejar un lote en negativo y exige motivo', async () => {
    const lot = (await one('service', "select l.id from public.supply_lots l join public.supply_items i on i.id = l.supply_item_id where i.name = 'Guantes de nitrilo'")).id
    await expect(rows(db, admin, "select public.adjust_stock($1, -1000, 'waste', 'Se mojaron')", [lot])).rejects.toThrow('STOCK_SHORTAGE')
    await expect(rows(db, admin, "select public.adjust_stock($1, -2, 'waste', '')", [lot])).rejects.toThrow('REASON_REQUIRED')
    await expect(rows(db, dentistA, "select public.adjust_stock($1, -2, 'waste', 'Se mojaron')", [lot])).rejects.toThrow('NOT_FOUND')
    await rows(db, admin, "select public.adjust_stock($1, -2, 'waste', 'Se mojaron')", [lot])
    expect(await onHand('Guantes de nitrilo')).toBe(46)
    await expect(db.exec(`update public.supply_lots set qty_on_hand = -1 where id = '${lot}'`)).rejects.toThrow(/check/)
  })
  it('el personal ve el stock; nadie escribe lotes ni movimientos directo', async () => {
    expect((await rows(db, reception, 'select 1 from public.v_stock')).length).toBeGreaterThan(0)
    await expect(rows(db, admin, "update public.supply_lots set qty_on_hand = 999")).rejects.toThrow(/permission denied/)
    await expect(rows(db, admin, 'delete from public.stock_movements')).rejects.toThrow(/permission denied/)
  })
})

describe('Quién ve el dinero', () => {
  it('recepción ve facturas y caja; el odontólogo solo facturas de sus pacientes y nada de caja', async () => {
    expect(await rows(db, reception, 'select 1 from public.invoices')).toHaveLength(1)
    expect((await rows(db, reception, 'select 1 from public.transactions')).length).toBeGreaterThan(0)
    expect(await rows(db, dentistA, 'select 1 from public.invoices')).toHaveLength(1)
    expect(await rows(db, dentistB, 'select 1 from public.invoices')).toHaveLength(0)
    expect(await rows(db, dentistA, 'select 1 from public.transactions')).toHaveLength(0)
    expect(await rows(db, dentistA, 'select 1 from public.cash_sessions')).toHaveLength(0)
    expect(await rows(db, 'anon', 'select 1 from public.invoices').catch(() => [])).toHaveLength(0)
  })
  it('nadie escribe facturas ni pagos directo', async () => {
    await expect(rows(db, admin, 'update public.invoices set paid_cents = 0')).rejects.toThrow(/permission denied/)
    await expect(rows(db, admin, 'delete from public.payments')).rejects.toThrow(/permission denied/)
  })
})

describe('Configuración inicial', () => {
  it('solo el servidor la llama y solo si no hay clínica', async () => {
    await expect(rows(db, admin, "select public.setup_clinic($1, 'Otra', 'Alguien')", [ID.admin])).rejects.toThrow(/permission denied/)
    await expect(rows(db, 'service', "select public.setup_clinic($1, 'Otra clínica', 'Alguien')", [ID.admin])).rejects.toThrow('ALREADY_SETUP')
  })
  it('en una base vacía crea clínica, administrador, horario y gabinete', async () => {
    const fresh = await createDb({ seed: false })
    const uid = '00000000-0000-4000-8000-0000000000f1'
    await fresh.exec(`insert into auth.users (id, email) values ('${uid}', 'doc@example.com')`)
    await as(fresh, 'service', (tx) => tx.query("select public.setup_clinic($1, 'Clínica Alquimia Dental', 'Dr. Prueba')", [uid]))
    const c = (await fresh.query<{ slug: string }>('select slug from public.clinics')).rows
    expect(c).toEqual([{ slug: 'clinica-alquimia-dental' }])
    expect((await fresh.query("select role from public.clinic_members")).rows).toEqual([{ role: 'clinic_admin' }])
    expect((await fresh.query('select 1 from public.clinic_hours')).rows).toHaveLength(7)
    expect((await fresh.query('select full_name from public.profiles')).rows).toEqual([{ full_name: 'Dr. Prueba' }])
  })
})

describe('Historial clínico (notas)', () => {
  const note = (actor: Actor, patient: string, body = 'Extracción de 48 en 2019. Ficha en papel.') =>
    rows(db, actor, "insert into public.clinical_notes (patient_id, body, source, created_by, noted_on) values ($1, $2, 'import', $3, '2019-05-10') returning id",
      [patient, body, (actor as { uid: string }).uid])
  it('el admin y el odontólogo del paciente agregan y leen; recepción y otro odontólogo no', async () => {
    await note(admin, PATIENT)
    await note(dentistA, PATIENT, 'Control: sin dolor.')
    await expect(note(reception, PATIENT)).rejects.toThrow(/row-level security/)
    await expect(note(dentistB, PATIENT)).rejects.toThrow(/row-level security/)
    expect(await rows(db, dentistA, 'select 1 from public.clinical_notes')).toHaveLength(2)
    expect(await rows(db, reception, 'select 1 from public.clinical_notes')).toHaveLength(0)
    expect(await rows(db, dentistB, 'select 1 from public.clinical_notes')).toHaveLength(0)
  })
  it('no se edita ni se borra, y queda auditada', async () => {
    await expect(rows(db, admin, "update public.clinical_notes set body = 'x'")).rejects.toThrow(/permission denied/)
    await expect(rows(db, admin, 'delete from public.clinical_notes')).rejects.toThrow(/permission denied/)
    expect((await rows(db, admin, "select 1 from public.audit_log where action = 'clinical_notes.create'")).length).toBe(2)
  })
})
