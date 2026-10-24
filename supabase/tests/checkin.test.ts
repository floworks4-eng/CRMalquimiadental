// Sprint 3 · Tokens de check-in, anamnesis y consentimiento (Gate G3, parte de base de datos).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ID, as, createDb, rows, type Actor, type Db } from './harness'

let db: Db
const P = (n: number) => `00000000-0000-4000-8000-000000000${100 + n}`
const B2 = '00000000-0000-4000-8000-0000000000b2'
const reception = { uid: ID.reception }
const dentistA = { uid: ID.dentistA }
const admin = { uid: ID.admin }

const HASH = `sha256(convert_to($1, 'UTF8'))`
const created: string[] = []
// Cada prueba libera sus citas para que no choquen entre si (odontologo, gabinete y paciente son los mismos).
afterEach(async () => {
  if (created.length) await db.query(`update public.appointments set status = 'no_show' where id = any($1::uuid[])`, [created.splice(0)])
})
/** Cita directa (sin reglas de horario) que empieza dentro de `min` minutos. */
async function appt(patient: string, min: number, status = 'scheduled'): Promise<string> {
  const id = await insertAppt(patient, min, status)
  created.push(id)
  return id
}
async function insertAppt(patient: string, min: number, status: string): Promise<string> {
  return (
    await db.query<{ id: string }>(
      `insert into public.appointments (clinic_id, patient_id, dentist_id, cabinet_id, starts_at, ends_at, status, created_by)
       values ($1, $2, $3, $4, now() + $5::int * interval '1 minute', now() + ($5::int + 30) * interval '1 minute', $6, $7) returning id`,
      [ID.clinic, patient, ID.admin, B2, min, status, ID.reception],
    )
  ).rows[0].id
}
const issue = (actor: Actor, id: string, token: string) =>
  as(db, actor, async (tx) => (await tx.query<{ t: string }>(`select public.issue_checkin_token($1, ${HASH.replace('$1', '$2')})::text as t`, [id, token])).rows[0].t)
const svc = <T = unknown>(sql: string, params: unknown[] = []) => as(db, 'service', async (tx) => (await tx.query<T>(sql, params)).rows)
const context = (token: string) => svc<{ c: Record<string, unknown> }>(`select public.checkin_context(${HASH}) as c`, [token]).then((r) => r[0].c)
const payload = (o: Record<string, unknown> = {}) => ({
  allergies: ['Penicilina'], conditions: ['Ninguno'], reason: 'Dolor al masticar', emergency_contact_name: 'Rosa Laura',
  emergency_contact_phone: '+59170009999', consent_clinical: true, consent_data: true, signature_name: 'Mariela Quispe', ...o,
})
const submit = (token: string, p: Record<string, unknown> = payload(), ip = 'iphash1') =>
  svc<{ r: { appointment_id: string } }>(`select public.submit_checkin(${HASH}, $2::jsonb, $3, 'test-agent') as r`, [token, JSON.stringify(p), ip]).then((r) => r[0].r)
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]

beforeAll(async () => {
  db = await createDb()
  // Las citas "de hoy" del seed caen a distintas horas: segun cuando corra la prueba chocarian con las citas cercanas a now().
  await db.exec(`update public.appointments set status = 'cancelled' where status in ('scheduled', 'confirmed', 'checked_in', 'in_progress')`)
})

describe('issue_checkin_token', () => {
  it('recepcion emite; vence 2 h despues de la cita', async () => {
    const id = await appt(P(1), 30)
    const exp = await issue(reception, id, 't-issue-1')
    const { ok } = await one<{ ok: boolean }>(`select $1::timestamptz = (select starts_at + interval '2 hours' from public.appointments where id = $2) as ok`, [exp, id])
    expect(ok).toBe(true)
  })
  it('el odontologo no emite; anon tampoco', async () => {
    const id = await appt(P(2), 30)
    await expect(issue(dentistA, id, 't-d')).rejects.toThrow('NOT_FOUND')
    await expect(issue('anon', id, 't-a')).rejects.toThrow(/permission denied/)
    await expect(issue({ uid: ID.reception, aal: 'aal1' }, id, 't-m')).rejects.toThrow('NOT_FOUND')
  })
  it('solo citas programadas o confirmadas, ni muy temprano ni vencidas', async () => {
    await expect(issue(reception, await appt(P(3), 30, 'completed'), 't-c')).rejects.toThrow('INVALID_STATE')
    await expect(issue(reception, await appt(P(4), 60 * 24 * 3), 't-e')).rejects.toThrow('TOO_EARLY')
    await expect(issue(reception, await appt(P(5), -60 * 5), 't-x')).rejects.toThrow('EXPIRED_APPT')
  })
  it('un enlace nuevo invalida el anterior', async () => {
    const id = await appt(P(6), 30)
    await issue(reception, id, 't-old')
    await issue(reception, id, 't-new')
    await expect(context('t-old')).rejects.toThrow('NOT_AVAILABLE')
    expect((await context('t-new')).first_name).toBeDefined()
  })
})

describe('checkin_context (publico, sin datos clinicos)', () => {
  it('expone solo lo necesario: nombre de pila, cita y textos legales', async () => {
    const id = await appt(P(7), 30)
    await issue(reception, id, 't-ctx')
    const c = await context('t-ctx')
    expect(Object.keys(c).sort()).toEqual(['clinic_name', 'consents', 'dentist', 'first_name', 'in_window', 'legal_ready', 'needs_birth_date', 'starts_at', 'treatment'])
    expect(c.first_name).toBe('Luis')
    expect(c.in_window).toBe(true)
    expect(c.legal_ready).toBe(true)
    expect((c.consents as { type: string }[]).map((x) => x.type).sort()).toEqual(['clinical_treatment', 'data_processing', 'whatsapp_reminders'])
    expect(JSON.stringify(c)).not.toMatch(/Ticona|phone|alerg/i) // ni apellido, ni telefono, ni salud
  })
  it('enlaces inexistentes, usados, revocados, vencidos o de citas canceladas: NOT_AVAILABLE', async () => {
    await expect(context('nunca-emitido')).rejects.toThrow('NOT_AVAILABLE')
    const id = await appt(P(8), 30)
    await issue(reception, id, 't-exp')
    await db.exec(`update public.checkin_tokens set expires_at = now() - interval '1 minute' where appointment_id = '${id}'`)
    await expect(context('t-exp')).rejects.toThrow('NOT_AVAILABLE')
    const id2 = await appt(P(9), 90)
    await issue(reception, id2, 't-cancel')
    await db.exec(`update public.appointments set status = 'cancelled' where id = '${id2}'`)
    await expect(context('t-cancel')).rejects.toThrow('NOT_AVAILABLE')
  })
  it('anon y authenticated no pueden ejecutar las RPC publicas', async () => {
    for (const fn of ['checkin_context(bytea)', 'checkin_target(bytea)', 'submit_checkin(bytea,jsonb,text,text)', 'rate_limit_hit(text,integer,interval)']) {
      for (const role of ['anon', 'authenticated']) {
        const { ok } = await one<{ ok: boolean }>(`select has_function_privilege($1, 'public.${fn}', 'execute') as ok`, [role])
        expect(ok, `${role} ${fn}`).toBe(false)
      }
      expect((await one<{ ok: boolean }>(`select has_function_privilege('service_role', 'public.${fn}', 'execute') as ok`)).ok).toBe(true)
    }
  })
})

describe('submit_checkin', () => {
  it('guarda anamnesis versionada, consentimientos con evidencia, pasa a sala de espera y avisa', async () => {
    const id = await appt(P(1), 20) // Juan Carlos: ya tiene la anamnesis v1 del seed
    await issue(reception, id, 't-ok')
    const target = (await svc<{ t: { patient_id: string; clinic_id: string } }>(`select public.checkin_target(${HASH}) as t`, ['t-ok']))[0].t
    expect(target).toEqual({ patient_id: P(1), clinic_id: ID.clinic })
    const sig = `${ID.clinic}/${P(1)}/00000000-0000-4000-8000-00000000abcd.png`
    await submit('t-ok', payload({ allergies: ['Penicilina', 'Látex'], consent_whatsapp: true, signature_path: sig }))

    expect((await one(`select status, checked_in_at is not null as hora from public.appointments where id = $1`, [id]))).toEqual({ status: 'checked_in', hora: true })
    expect((await db.query(`select version, source, allergies, submitted_by from public.anamnesis_versions where patient_id = $1 order by version`, [P(1)])).rows).toEqual([
      expect.objectContaining({ version: 1 }),
      { version: 2, source: 'patient_checkin', allergies: ['Penicilina', 'Látex'], submitted_by: null },
    ])
    const consents = (await db.query<{ type: string; hash_ok: boolean; sig: string | null; ev: { signature_name?: string } }>(
      `select v.type, v.body_hash = c.evidence ->> 'body_hash' as hash_ok, c.signature_path as sig, c.evidence as ev
         from public.patient_consents c join public.consent_versions v on v.id = c.consent_version_id where c.patient_id = $1 order by v.type`, [P(1)])).rows
    expect(consents.map((c) => c.type)).toEqual(['data_processing', 'clinical_treatment', 'whatsapp_reminders']) // orden del enum
    expect(consents.every((c) => c.hash_ok)).toBe(true)
    expect(consents.find((c) => c.type === 'clinical_treatment')).toMatchObject({ sig, ev: { signature_name: 'Mariela Quispe' } })
    expect((await one(`select used_at is not null as u from public.checkin_tokens where appointment_id = $1`, [id])).u).toBe(true)
    expect((await one(`select count(*)::int as n from public.checkin_submissions where appointment_id = $1`, [id])).n).toBe(1)
    expect((await one(`select ip_hash, user_agent from public.audit_log where action = 'checkin.submit' and entity_id = $1`, [id]))).toEqual({ ip_hash: 'iphash1', user_agent: 'test-agent' })
    expect((await db.query(`select 1 from public.appointment_events where appointment_id = $1 and reason = 'checkin_qr'`, [id])).rows).toHaveLength(1)

    // El odontologo ve las alergias; recepcion solo que llego.
    const forDentist = await rows(db, admin, `select body from public.notifications where user_id = $1 and kind = 'checkin' order by created_at desc limit 1`, [ID.admin])
    expect(String(forDentist[0].body)).toContain('Alergias: Penicilina, Látex')
    const forReception = await rows(db, reception, `select title, body from public.notifications where kind = 'checkin' order by created_at desc limit 1`)
    expect(JSON.stringify(forReception)).not.toMatch(/alerg|Penicilina/i)
    expect(forReception[0].title).toMatch(/hizo check-in/)
  })
  it('completa la fecha de nacimiento solo si faltaba', async () => {
    const pid = (await one<{ id: string }>(`insert into public.patients (clinic_id, full_name, phone_e164) values ($1, 'Sin Fecha Prueba', '+59170003333') returning id`, [ID.clinic])).id
    const id = await appt(pid, 20)
    await issue(reception, id, 't-birth')
    expect((await context('t-birth')).needs_birth_date).toBe(true)
    await submit('t-birth', payload({ birth_date: '1991-02-03' }))
    expect((await one(`select birth_date::text as b from public.patients where id = $1`, [pid])).b).toBe('1991-02-03')
  })
  it('el enlace se usa una sola vez; 5 envios simultaneos: 1 gana', async () => {
    const id = await appt(P(10), 20)
    await issue(reception, id, 't-once')
    const r = await Promise.allSettled(Array.from({ length: 5 }, () => submit('t-once')))
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(r.filter((x) => x.status === 'rejected').every((x) => /NOT_AVAILABLE/.test(String((x as PromiseRejectedResult).reason)))).toBe(true)
    await expect(submit('t-once')).rejects.toThrow('NOT_AVAILABLE')
    expect((await one(`select count(*)::int as n from public.anamnesis_versions where patient_id = $1`, [P(10)])).n).toBe(1)
  })
  it('fuera de la ventana de ±2 h de la cita', async () => {
    const id = await appt(P(11), 60 * 5)
    await issue(reception, id, 't-win')
    expect((await context('t-win')).in_window).toBe(false)
    await expect(submit('t-win')).rejects.toThrow('OUT_OF_WINDOW')
  })
  it.each([
    ['allergies', { allergies: [], allergy_other: '' }],
    ['conditions', { conditions: [] }],
    ['reason', { reason: 'x' }],
    ['emergency_contact', { emergency_contact_name: '' }],
    ['consent', { consent_clinical: false }],
    ['consent', { consent_data: false }],
    ['signature', { signature_name: 'Ana' }],
    ['signature_path', { signature_path: `${ID.clinic}/${P(2)}/00000000-0000-4000-8000-00000000abcd.png` }], // firma de otro paciente
    ['birth_date', { birth_date: '2999-01-01' }],
  ])('rechaza datos invalidos (%s)', async (field, patch) => {
    const id = await appt(P(12), 20)
    await issue(reception, id, `t-bad-${field}-${JSON.stringify(patch).length}`)
    await expect(submit(`t-bad-${field}-${JSON.stringify(patch).length}`, payload(patch))).rejects.toThrow(/INVALID_PAYLOAD/)
    await db.exec(`update public.appointments set status = 'cancelled' where id = '${id}'`) // libera al paciente para la siguiente
  })
  it('sin texto legal aprobado no se acepta (fail closed), salvo en desarrollo', async () => {
    const id = await appt(P(3), 20)
    await issue(reception, id, 't-legal')
    await db.exec(`update public.clinics set allow_draft_legal = false`)
    expect((await context('t-legal')).legal_ready).toBe(false)
    await expect(submit('t-legal')).rejects.toThrow('CONSENT_NOT_READY')
    // Se publica una version aprobada y se retira el borrador: ahora si se acepta.
    await db.exec(`insert into public.consent_versions (clinic_id, type, version, body_md, draft, effective_from) values
      ('${ID.clinic}', 'data_processing', 'v1', 'Texto aprobado', false, now() - interval '1 minute'),
      ('${ID.clinic}', 'clinical_treatment', 'v1', 'Texto aprobado', false, now() - interval '1 minute')`)
    await db.exec(`update public.consent_versions set retired_at = now() where version = 'dev-0' and type in ('data_processing', 'clinical_treatment')`)
    expect((await context('t-legal')).legal_ready).toBe(true)
    await submit('t-legal')
    await db.exec(`update public.clinics set allow_draft_legal = true`)
  })
})

describe('acceso a consentimientos y tokens', () => {
  it('recepcion no ve consentimientos; el odontologo solo los de sus pacientes', async () => {
    expect(await rows(db, reception, 'select 1 from public.patient_consents')).toHaveLength(0)
    expect((await rows(db, admin, 'select 1 from public.patient_consents')).length).toBeGreaterThan(0)
    const own = new Set([P(1), P(2), P(3), P(4)]) // pacientes primarios de la Dra. A
    const seen = (await rows(db, dentistA, 'select distinct patient_id from public.patient_consents')).map((r) => r.patient_id as string)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((p) => own.has(p))).toBe(true)
    expect((await db.query(`select 1 from public.patient_consents where patient_id not in ($1, $2, $3, $4)`, [P(1), P(2), P(3), P(4)])).rows.length).toBeGreaterThan(0) // existen de otros: no los ve
    await expect(rows(db, 'anon', 'select 1 from public.patient_consents')).rejects.toThrow(/permission denied/)
  })
  it('el hash del token no es legible y las entregas no son accesibles', async () => {
    const col = async (c: string) => (await one<{ ok: boolean }>(`select has_column_privilege('authenticated', 'public.checkin_tokens', $1, 'select') as ok`, [c])).ok
    expect(await col('token_hash')).toBe(false)
    expect(await col('expires_at')).toBe(true)
    expect((await one<{ ok: boolean }>(`select has_table_privilege('authenticated', 'public.checkin_submissions', 'select') as ok`)).ok).toBe(false)
    expect(await rows(db, dentistA, 'select 1 from public.checkin_tokens')).toHaveLength(0)
    expect((await rows(db, reception, 'select id, used_at from public.checkin_tokens')).length).toBeGreaterThan(0)
  })
  it('el texto de una version publicada no se edita y su huella queda guardada', async () => {
    await expect(db.exec(`update public.consent_versions set body_md = 'cambio' where version = 'v1'`)).rejects.toThrow(/IMMUTABLE/)
    expect((await one<{ ok: boolean }>(`select body_hash = encode(sha256(convert_to(body_md, 'UTF8')), 'hex') as ok from public.consent_versions where version = 'v1' and type = 'data_processing'`)).ok).toBe(true)
    const retire = await as(db, admin, (tx) => tx.query(`update public.consent_versions set retired_at = now() where version = 'dev-0' and type = 'whatsapp_reminders'`))
    expect(retire.affectedRows).toBe(1)
  })
})

describe('rate_limit_hit', () => {
  const hit = (key: string, limit = 3) => svc(`select public.rate_limit_hit($1, $2, interval '10 minutes')`, [key, limit])
  it('permite hasta el limite y luego bloquea, por clave', async () => {
    for (let i = 0; i < 3; i++) await hit('ip:aaa')
    await expect(hit('ip:aaa')).rejects.toThrow('RATE_LIMITED')
    await hit('ip:bbb') // otra clave no se ve afectada
  })
})
