// Sprint 2 · Disponibilidad, creacion, reprogramacion y maquina de estados de citas (Gate G2, parte de base de datos).
import { beforeAll, describe, expect, it } from 'vitest'
import { ID, as, createDb, rows, type Actor, type Db } from './harness'

let db: Db
const P = (n: number) => `00000000-0000-4000-8000-000000000${100 + n}`
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const admin = { uid: ID.admin }
const dentistA = { uid: ID.dentistA }
const dentistB = { uid: ID.dentistB }
const reception = { uid: ID.reception }
const TZ = 'America/La_Paz'

let T: Record<string, string> // tratamiento por codigo
let M: string // proximo lunes (siempre futuro)
const day = async (n: number) => (await db.query<{ d: string }>(`select ($1::date + $2::int)::text as d`, [M, n])).rows[0].d
const at = (d: string, hm: string) => `${d}T${hm}:00-04:00` // hora de La Paz (UTC-4 todo el año)
const hhmm = (r: Record<string, unknown>) =>
  db.query<{ t: string }>(`select to_char($1::timestamptz at time zone '${TZ}', 'HH24:MI') as t`, [r.slot_start]).then((x) => x.rows[0].t)

const slots = async (actor: Actor, treatment: string, from: string, to = from, dentist: string | null = null, step = 30) =>
  rows(db, actor, 'select * from public.available_slots($1, $2, $3, $4, $5, $6)', [ID.clinic, T[treatment], from, to, dentist, step])
const times = async (r: Record<string, unknown>[]) => Promise.all(r.map(hhmm))

type Create = { patient?: string; dentist?: string; cabinet?: string; treatment?: string; start: string; duration?: number | null; source?: string; notes?: string | null }
const create = (actor: Actor, c: Create) =>
  as(db, actor, async (tx) =>
    (
      await tx.query<{ id: string }>(`select public.create_appointment($1, $2, $3, $4, $5, $6, $7, null, $8) as id`, [
        c.patient ?? P(9), c.dentist ?? ID.dentistA, c.cabinet ?? B1, T[c.treatment ?? 'consulta'], c.start, c.duration ?? null, c.source ?? 'phone', c.notes ?? null,
      ])
    ).rows[0].id,
  )
const status = (actor: Actor, id: string, to: string, reason: string | null = null, expected: string | null = null) =>
  as(db, actor, (tx) => tx.query('select public.change_appointment_status($1, $2, $3, $4)', [id, to, reason, expected]))
const reschedule = (actor: Actor, id: string, start: string, opts: { cabinet?: string; dentist?: string; expected?: string } = {}) =>
  as(db, actor, (tx) => tx.query('select public.reschedule_appointment($1, $2, $3, $4, $5)', [id, start, opts.cabinet ?? null, opts.dentist ?? null, opts.expected ?? null]))
// now() de PGlite tiene resolucion de milisegundos: sin esta pausa dos escrituras seguidas pueden dejar el mismo updated_at.
const tick = () => db.query('select pg_sleep(0.02)')
const one = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows[0]

beforeAll(async () => {
  db = await createDb()
  const t = await db.query<{ code: string; id: string }>('select code, id from public.treatments')
  T = Object.fromEntries(t.rows.map((r) => [r.code, r.id]))
  M = (await one(`select (current_date + (8 - extract(isodow from current_date)::int))::text as d`)).d as string
})

describe('available_slots', () => {
  it('lunes, 30 min, Dra. A: 08:30 a 19:00 cada 30 min (22 horarios)', async () => {
    const t = await times(await slots(reception, 'consulta', M, M, ID.dentistA))
    expect(t).toHaveLength(22)
    expect(t[0]).toBe('08:30')
    expect(t.at(-1)).toBe('19:00')
  })
  it('un tratamiento de 60 min termina de empezar a las 18:30', async () => {
    const t = await times(await slots(reception, 'blanqueamiento', M, M, ID.dentistA))
    expect(t.at(-1)).toBe('18:30')
    expect(t).toHaveLength(21)
  })
  it('domingo: sin horarios', async () => {
    expect(await slots(reception, 'consulta', await day(6))).toHaveLength(0)
  })
  it('sabado: solo la Dra. A (09:00-13:00); el Dr. B no tiene turno', async () => {
    const sat = await day(5)
    const a = await times(await slots(reception, 'consulta', sat, sat, ID.dentistA))
    expect([a[0], a.at(-1), a.length]).toEqual(['09:00', '12:30', 8])
    expect(await slots(reception, 'consulta', sat, sat, ID.dentistB)).toHaveLength(0)
  })
  it('sin turnos definidos se usa el horario de la clinica (Doc)', async () => {
    const t = await times(await slots(reception, 'consulta', M, M, ID.admin))
    expect([t[0], t.at(-1), t.length]).toEqual(['08:30', '19:00', 22])
  })
  it('feriado: nadie atiende', async () => {
    const tue = await day(1)
    await db.exec(`insert into public.clinic_holidays (clinic_id, date, name) values ('${ID.clinic}', '${tue}', 'Feriado de prueba')`)
    expect(await slots(reception, 'consulta', tue)).toHaveLength(0)
    await db.exec(`delete from public.clinic_holidays where date = '${tue}'`)
    expect((await slots(reception, 'consulta', tue)).length).toBeGreaterThan(0)
  })
  it('ausencia del odontologo bloquea las horas que se solapan', async () => {
    const wed = await day(2)
    await db.exec(`insert into public.dentist_time_off (clinic_id, dentist_id, starts_at, ends_at) values ('${ID.clinic}', '${ID.dentistA}', '${at(wed, '12:00')}', '${at(wed, '14:00')}')`)
    const t = await times(await slots(reception, 'consulta', wed, wed, ID.dentistA))
    expect(t).toContain('11:30')
    for (const h of ['12:00', '12:30', '13:00', '13:30']) expect(t).not.toContain(h)
    expect(t).toContain('14:00')
    expect(await times(await slots(reception, 'blanqueamiento', wed, wed, ID.dentistA))).not.toContain('11:30') // 11:30-12:30 se cruza
  })
  it('una cita ocupa al odontologo pero no a los demas', async () => {
    const thu = await day(3)
    await create(reception, { patient: P(10), dentist: ID.dentistA, cabinet: B1, start: at(thu, '10:00'), duration: 60 })
    const a = await times(await slots(reception, 'consulta', thu, thu, ID.dentistA))
    expect(a).toContain('09:30')
    expect(a).not.toContain('10:00')
    expect(a).not.toContain('10:30')
    expect(a).toContain('11:00')
    expect(await times(await slots(reception, 'consulta', thu, thu, ID.dentistB))).toContain('10:00') // otro gabinete libre
  })
  it('sin gabinete libre no hay horario aunque el odontologo este libre', async () => {
    const fri = await day(4)
    await db.exec(`update public.cabinets set active = false where id in ('${B2}', '${B3}')`)
    await create(reception, { patient: P(11), dentist: ID.dentistA, cabinet: B1, start: at(fri, '16:00') })
    const b = await times(await slots(reception, 'consulta', fri, fri, ID.dentistB))
    expect(b).not.toContain('16:00')
    expect(b).toContain('16:30')
    await db.exec(`update public.cabinets set active = true where id in ('${B2}', '${B3}')`)
    expect(await times(await slots(reception, 'consulta', fri, fri, ID.dentistB))).toContain('16:00')
  })
  it('una cita cancelada devuelve el horario', async () => {
    const tue = await day(1)
    const id = await create(reception, { patient: P(12), dentist: ID.dentistA, cabinet: B1, start: at(tue, '12:00') })
    expect(await times(await slots(reception, 'consulta', tue, tue, ID.dentistA))).not.toContain('12:00')
    await status(reception, id, 'cancelled', 'Paciente avisó que no viene')
    expect(await times(await slots(reception, 'consulta', tue, tue, ID.dentistA))).toContain('12:00')
  })
  it('devuelve odontologo y gabinete de cada horario', async () => {
    const r = await slots(reception, 'consulta', M, M)
    expect(new Set(r.map((x) => x.slot_dentist))).toEqual(new Set([ID.admin, ID.dentistA, ID.dentistB]))
    expect(r.every((x) => [B1, B2, B3].includes(x.slot_cabinet as string))).toBe(true)
  })
  it('hoy no ofrece horas pasadas', async () => {
    const today = (await one(`select (now() at time zone '${TZ}')::date::text as d`)).d as string
    const r = await slots(reception, 'consulta', today)
    const past = await Promise.all(r.map(async (x) => (await db.query(`select $1::timestamptz <= now() as p`, [x.slot_start])).rows[0] as { p: boolean }))
    expect(past.every((x) => !x.p)).toBe(true)
  })
  it('validaciones de entrada y de permiso', async () => {
    await expect(slots(reception, 'consulta', M, await day(40))).rejects.toThrow('BAD_RANGE')
    await expect(slots(reception, 'consulta', M, M, null, 20)).rejects.toThrow('BAD_STEP')
    await expect(rows(db, reception, 'select * from public.available_slots($1, $2, $3, $3)', [ID.clinic, ID.clinic, M])).rejects.toThrow('NOT_FOUND')
    await expect(slots('anon', 'consulta', M)).rejects.toThrow(/permission denied/)
    expect((await slots(dentistA, 'consulta', M)).length).toBeGreaterThan(0)
  })
  it('coherencia: cada horario ofrecido se puede reservar y deja de ofrecerse', async () => {
    const mon = await day(0)
    const all = await slots(reception, 'consulta', mon, mon, ID.dentistB)
    const sample = all.filter((_, i) => i % 5 === 0)
    expect(sample.length).toBeGreaterThan(3)
    for (const s of sample) {
      const iso = (await db.query<{ t: string }>(`select to_char($1::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as t`, [s.slot_start])).rows[0].t
      await create(reception, { patient: P(7), dentist: s.slot_dentist as string, cabinet: s.slot_cabinet as string, start: iso })
    }
    const after = await times(await slots(reception, 'consulta', mon, mon, ID.dentistB))
    for (const s of sample) expect(after).not.toContain(await hhmm(s))
  })
})

describe('create_appointment', () => {
  it('crea la cita y deja evento, notificacion al odontologo y auditoria', async () => {
    const d = await day(0)
    const id = await create(reception, { patient: P(1), dentist: ID.dentistA, cabinet: B2, start: at(d, '17:00'), treatment: 'limpieza', source: 'whatsapp', notes: ' primera vez ' })
    const a = await one(`select status, source, notes, to_char(ends_at at time zone '${TZ}', 'HH24:MI') as fin, created_by from public.appointments where id = $1`, [id])
    expect(a).toMatchObject({ status: 'scheduled', source: 'whatsapp', notes: 'primera vez', fin: '17:45', created_by: ID.reception })
    expect((await db.query(`select to_status, actor_id from public.appointment_events where appointment_id = $1`, [id])).rows).toEqual([{ to_status: 'scheduled', actor_id: ID.reception }])
    expect((await db.query(`select title from public.notifications where user_id = $1 and title = 'Nueva cita'`, [ID.dentistA])).rows.length).toBeGreaterThan(0)
    expect((await db.query(`select actor_role from public.audit_log where action = 'appointments.create' and entity_id = $1`, [id])).rows).toEqual([{ actor_role: 'reception' }])
  })
  it.each([
    ['domingo', 6, '10:00', 'CLOSED'],
    ['antes de abrir', 0, '07:00', 'OUTSIDE_HOURS'],
    ['termina despues de cerrar', 0, '19:15', 'OUTSIDE_HOURS'],
  ])('rechaza %s', async (_, n, hm, code) => {
    await expect(create(reception, { start: at(await day(n), hm), duration: 30 })).rejects.toThrow(code)
  })
  it('feriado, ausencia y turno', async () => {
    const tue = await day(1)
    await db.exec(`insert into public.clinic_holidays (clinic_id, date, name) values ('${ID.clinic}', '${tue}', 'Feriado')`)
    await expect(create(reception, { start: at(tue, '10:00') })).rejects.toThrow('HOLIDAY')
    await db.exec(`delete from public.clinic_holidays where date = '${tue}'`)
    const wed = await day(2) // la Dra. A esta ausente 12:00-14:00 (test anterior)
    await expect(create(reception, { start: at(wed, '12:30') })).rejects.toThrow('TIME_OFF')
    await expect(create(reception, { dentist: ID.dentistB, start: at(await day(5), '10:00') })).rejects.toThrow('NO_SCHEDULE')
  })
  it('granularidad y duracion', async () => {
    const d = await day(0)
    await expect(create(reception, { start: at(d, '10:40') })).rejects.toThrow('BAD_GRANULARITY')
    await expect(create(reception, { start: at(d, '10:00'), duration: 20 })).rejects.toThrow('BAD_DURATION')
    await expect(create(reception, { start: at(d, '10:00'), duration: 300 })).rejects.toThrow('BAD_DURATION')
  })
  it('no se agenda en el pasado, salvo el admin', async () => {
    const past = (await one(`select (current_date - ((extract(isodow from current_date)::int - 1) + 7))::text as d`)).d as string
    await expect(create(reception, { start: at(past, '10:00') })).rejects.toThrow('PAST')
    await expect(create(dentistA, { patient: P(1), start: at(past, '10:00') })).rejects.toThrow('PAST')
    await create(admin, { patient: P(2), start: at(past, '10:00') })
  })
  it('doble reserva: odontologo, gabinete y paciente', async () => {
    const d = await day(1)
    await create(reception, { patient: P(2), dentist: ID.dentistB, cabinet: B3, start: at(d, '09:00'), duration: 60 })
    await expect(create(reception, { patient: P(3), dentist: ID.dentistB, cabinet: B1, start: at(d, '09:30') })).rejects.toThrow('SLOT_TAKEN') // odontologo
    await expect(create(reception, { patient: P(3), dentist: ID.dentistA, cabinet: B3, start: at(d, '09:30') })).rejects.toThrow('SLOT_TAKEN') // gabinete
    await expect(create(reception, { patient: P(2), dentist: ID.dentistA, cabinet: B1, start: at(d, '09:30') })).rejects.toThrow('SLOT_TAKEN') // paciente
    await create(reception, { patient: P(3), dentist: ID.dentistA, cabinet: B1, start: at(d, '10:00') }) // contigua: si
  })
  it('20 reservas simultaneas del mismo horario: 1 gana', async () => {
    const d = await day(1)
    const r = await Promise.allSettled(Array.from({ length: 20 }, () => create(reception, { patient: P(4), dentist: ID.dentistA, cabinet: B2, start: at(d, '17:00') })))
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(r.filter((x) => x.status === 'rejected').every((x) => /SLOT_TAKEN/.test(String((x as PromiseRejectedResult).reason)))).toBe(true)
  })
  it('permisos: el odontologo agenda solo para si y solo a sus pacientes', async () => {
    const d = await day(3)
    await expect(create(dentistA, { patient: P(1), dentist: ID.dentistB, start: at(d, '15:00') })).rejects.toThrow('FORBIDDEN') // para otro
    await expect(create(dentistA, { patient: P(5), dentist: ID.dentistA, start: at(d, '15:00') })).rejects.toThrow('FORBIDDEN') // paciente ajeno
    await expect(create(dentistA, { patient: P(99 - 90), dentist: ID.dentistA, start: at(d, '15:00') })).rejects.toThrow('FORBIDDEN') // sin odontologo asignado
    await create(dentistA, { patient: P(1), dentist: ID.dentistA, cabinet: B1, start: at(d, '15:00') })
  })
  it('referencias invalidas', async () => {
    const d = await day(3)
    await db.exec(`update public.cabinets set active = false where id = '${B3}'`)
    await expect(create(reception, { cabinet: B3, start: at(d, '14:00') })).rejects.toThrow('INVALID_REFERENCE')
    await db.exec(`update public.cabinets set active = true where id = '${B3}'`)
    await expect(create(reception, { patient: '00000000-0000-4000-8000-0000000009ff', start: at(d, '14:00') })).rejects.toThrow('FORBIDDEN')
  })
  it('el cliente ya no escribe citas directamente', async () => {
    await expect(as(db, reception, (tx) => tx.query(`insert into public.appointments (patient_id, dentist_id, cabinet_id, starts_at, ends_at) values ($1, $2, $3, now(), now() + interval '1 hour')`, [P(1), ID.dentistA, B1]))).rejects.toThrow(/permission denied/)
    await expect(as(db, admin, (tx) => tx.query(`update public.appointments set status = 'completed'`))).rejects.toThrow(/permission denied/)
  })
})

describe('reschedule_appointment', () => {
  it('mueve la cita y deja evento; un token de version viejo es CONFLICT', async () => {
    const d = await day(2)
    const id = await create(reception, { patient: P(5), dentist: ID.dentistB, cabinet: B3, start: at(d, '09:00') })
    const v1 = (await one(`select updated_at::text as u from public.appointments where id = $1`, [id])).u as string
    await tick()
    await reschedule(reception, id, at(d, '09:30'), { expected: v1 })
    expect((await one(`select to_char(starts_at at time zone '${TZ}', 'HH24:MI') as h from public.appointments where id = $1`, [id])).h).toBe('09:30')
    expect((await db.query<{ reason: string | null }>(`select reason from public.appointment_events where appointment_id = $1 order by at`, [id])).rows.map((r) => r.reason)).toContain('rescheduled')
    await expect(reschedule(reception, id, at(d, '10:00'), { expected: v1 })).rejects.toThrow('CONFLICT')
  })
  it('a un horario ocupado: SLOT_TAKEN; a uno fuera de horario: error de reglas', async () => {
    const d = await day(2)
    const id = await create(reception, { patient: P(6), dentist: ID.dentistB, cabinet: B3, start: at(d, '15:00') })
    await create(reception, { patient: P(8), dentist: ID.dentistB, cabinet: B2, start: at(d, '16:00') })
    await expect(reschedule(reception, id, at(d, '16:00'))).rejects.toThrow('SLOT_TAKEN')
    await expect(reschedule(reception, id, at(await day(6), '10:00'))).rejects.toThrow('CLOSED')
  })
  it('solo citas programadas o confirmadas; el odontologo ve solo las suyas', async () => {
    const d = await day(3)
    const id = await create(reception, { patient: P(7), dentist: ID.dentistB, cabinet: B3, start: at(d, '12:00') })
    await expect(reschedule(dentistA, id, at(d, '12:30'))).rejects.toThrow('NOT_FOUND') // no es su cita
    await status(reception, id, 'checked_in')
    await expect(reschedule(reception, id, at(d, '12:30'))).rejects.toThrow('NOT_RESCHEDULABLE')
  })
  it('reasignar a otro odontologo la mueve (y lo notifica)', async () => {
    const d = await day(4)
    const id = await create(reception, { patient: P(10), dentist: ID.dentistA, cabinet: B1, start: at(d, '11:00') })
    await reschedule(reception, id, at(d, '11:00'), { dentist: ID.dentistB, cabinet: B3 })
    expect((await one(`select dentist_id from public.appointments where id = $1`, [id])).dentist_id).toBe(ID.dentistB)
    expect((await db.query(`select 1 from public.notifications where user_id = $1 and title = 'Cita reprogramada'`, [ID.dentistB])).rows.length).toBeGreaterThan(0)
  })
})

describe('change_appointment_status', () => {
  const fresh = async (n: number, hm: string, patient = P(11)) => create(reception, { patient, dentist: ID.dentistA, cabinet: B2, start: at(await day(n), hm) })
  const st = async (id: string) => (await one(`select status from public.appointments where id = $1`, [id])).status

  it('confirmar y hacer check-in: marca la hora, deja eventos y avisa al odontologo', async () => {
    const id = await fresh(3, '08:30')
    await status(reception, id, 'confirmed')
    await status(reception, id, 'checked_in')
    expect(await st(id)).toBe('checked_in')
    expect((await one(`select checked_in_at is not null as ok from public.appointments where id = $1`, [id])).ok).toBe(true)
    expect((await db.query<{ to_status: string }>(`select to_status from public.appointment_events where appointment_id = $1 order by at, to_status`, [id])).rows.map((r) => r.to_status).sort()).toEqual(['checked_in', 'confirmed', 'scheduled'])
    expect((await db.query(`select title from public.notifications where user_id = $1 and kind = 'checkin'`, [ID.dentistA])).rows.length).toBeGreaterThan(0)
  })
  it('el odontologo no cambia estados; recepcion tampoco reabre', async () => {
    const id = await fresh(3, '09:00', P(12))
    await expect(status(dentistA, id, 'confirmed')).rejects.toThrow('FORBIDDEN')
    await status(reception, id, 'cancelled', 'Se reprogramó con otro paciente')
    await expect(status(reception, id, 'scheduled', 'Reabrir por error')).rejects.toThrow('FORBIDDEN')
  })
  it('cancelar exige motivo, guarda el motivo y libera el horario', async () => {
    const id = await fresh(4, '12:00')
    await expect(status(reception, id, 'cancelled')).rejects.toThrow('REASON_REQUIRED')
    await expect(status(reception, id, 'cancelled', 'no')).rejects.toThrow('REASON_REQUIRED')
    await status(reception, id, 'cancelled', 'El paciente viaja')
    expect((await one(`select cancellation_reason as r from public.appointments where id = $1`, [id])).r).toBe('El paciente viaja')
    await fresh(4, '12:00') // el hueco quedo libre
  })
  it('no-show solo pasados 15 minutos de la hora', async () => {
    const future = await fresh(4, '13:00')
    await expect(status(reception, future, 'no_show')).rejects.toThrow('TOO_EARLY')
    const past = (await one(`select (current_date - ((extract(isodow from current_date)::int - 1) + 7))::text as d`)).d as string
    const id = await create(admin, { patient: P(3), dentist: ID.dentistA, cabinet: B1, start: at(past, '15:00') })
    await status(reception, id, 'no_show')
    expect(await st(id)).toBe('no_show')
  })
  it('reabrir: solo admin, con motivo; si el horario ya se ocupo, SLOT_TAKEN', async () => {
    const id = await fresh(4, '14:30', P(5))
    await status(reception, id, 'cancelled', 'Cancelada por prueba')
    await status(admin, id, 'scheduled', 'Se equivocaron al cancelar')
    expect(await st(id)).toBe('scheduled')
    await status(reception, id, 'cancelled', 'Cancelada otra vez')
    await create(reception, { patient: P(6), dentist: ID.dentistA, cabinet: B2, start: at(await day(4), '14:30') })
    await expect(status(admin, id, 'scheduled', 'Intento de reabrir')).rejects.toThrow('SLOT_TAKEN')
  })
  it('transiciones invalidas', async () => {
    const id = await fresh(0, '12:00', P(8))
    await expect(status(reception, id, 'completed')).rejects.toThrow('INVALID_TRANSITION')
    await expect(status(reception, id, 'in_progress')).rejects.toThrow('INVALID_TRANSITION')
    await status(reception, id, 'cancelled', 'Cancelada para probar')
    await expect(status(reception, id, 'checked_in')).rejects.toThrow('INVALID_TRANSITION')
    await expect(status(reception, id, 'cancelled', 'Doble cancelacion')).rejects.toThrow('INVALID_TRANSITION')
    await db.exec(`update public.appointments set status = 'completed' where id = '00000000-0000-4000-8000-000000000205'`) // seed: ya cerrada
    await expect(status(admin, '00000000-0000-4000-8000-000000000205', 'cancelled', 'Intento tardio')).rejects.toThrow('INVALID_TRANSITION')
  })
  it('version vieja: CONFLICT', async () => {
    const id = await fresh(4, '16:30', P(9))
    const v1 = (await one(`select updated_at::text as u from public.appointments where id = $1`, [id])).u as string
    await tick()
    await status(reception, id, 'confirmed')
    await expect(status(reception, id, 'checked_in', null, v1)).rejects.toThrow('CONFLICT')
  })
})

describe('eventos y notificaciones: acceso', () => {
  it('eventos: recepcion y admin ven; el odontologo solo los de sus citas; anon nada', async () => {
    const all = (await db.query(`select count(*)::int as n from public.appointment_events`)).rows[0] as { n: number }
    expect((await rows(db, reception, 'select 1 from public.appointment_events')).length).toBe(all.n)
    expect((await rows(db, admin, 'select 1 from public.appointment_events')).length).toBe(all.n)
    const a = await rows(db, dentistA, 'select appointment_id from public.appointment_events')
    const ownAppts = new Set((await db.query(`select id from public.appointments where dentist_id = '${ID.dentistA}'`)).rows.map((r) => (r as { id: string }).id))
    expect(a.length).toBeGreaterThan(0)
    expect(a.every((r) => ownAppts.has(r.appointment_id as string))).toBe(true)
    await expect(rows(db, 'anon', 'select 1 from public.appointment_events')).rejects.toThrow(/permission denied/)
  })
  it('cada usuario lee solo sus notificaciones y puede marcarlas leidas', async () => {
    const mine = await rows(db, dentistB, 'select id, user_id from public.notifications')
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((r) => r.user_id === ID.dentistB)).toBe(true)
    expect(await rows(db, reception, 'select 1 from public.notifications')).toHaveLength(0)
    const upd = await as(db, dentistB, (tx) => tx.query(`update public.notifications set read_at = now() where user_id = $1`, [ID.dentistB]))
    expect(upd.affectedRows).toBe(mine.length)
    const other = await as(db, reception, (tx) => tx.query(`update public.notifications set read_at = now()`))
    expect(other.affectedRows).toBe(0)
    await expect(as(db, dentistB, (tx) => tx.query(`insert into public.notifications (clinic_id, user_id, kind, title) values ($1, $2, 'system', 'x')`, [ID.clinic, ID.dentistB]))).rejects.toThrow(/permission denied/)
    await expect(as(db, dentistB, (tx) => tx.query(`update public.notifications set title = 'x'`))).rejects.toThrow(/permission denied/)
  })
})
