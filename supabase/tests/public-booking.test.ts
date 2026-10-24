// Sprint 3 · Reserva publica: disponibilidad sin datos, reserva atomica, atribucion, limites.
import { beforeAll, describe, expect, it } from 'vitest'
import { ID, as, createDb, type Db } from './harness'

let db: Db
const TZ = 'America/La_Paz'
let T: Record<string, string>
let M: string
const HASH = `sha256(convert_to($1, 'UTF8'))`
const svc = <R = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, 'service', async (tx) => (await tx.query<R>(sql, params)).rows)
const one = async <R = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows[0]
const day = async (k: number) => (await one<{ d: string }>(`select ($1::date + $2::int)::text as d`, [M, k])).d
const at = (d: string, hm: string) => `${d}T${hm}:00-04:00`
const slots = (treatment: string, from: string, to = from) =>
  svc<{ slot_start: string }>(`select * from public.public_slots($1, $2, $3, $4)`, [ID.clinic, T[treatment], from, to])
const hhmm = async (iso: unknown) => (await one<{ t: string }>(`select to_char($1::timestamptz at time zone '${TZ}', 'HH24:MI') as t`, [iso])).t

type Book = { treatment?: string; start: string; name?: string; phone?: string; data?: boolean; wa?: boolean; utm?: Record<string, string>; token?: string; ip?: string }
let seq = 0
const book = (b: Book) =>
  svc<{ r: { appointment_id: string; code: string; expires_at: string } }>(
    `select public.public_book($1, $2, $3, $4, $5, $6, $7, $8::jsonb, sha256(convert_to($9, 'UTF8')), $10) as r`,
    [ID.clinic, T[b.treatment ?? 'consulta'], b.start, b.name ?? 'Mariela Quispe Laura', b.phone ?? `+5917000${String(5000 + seq++)}`, b.data ?? true, b.wa ?? false,
      JSON.stringify(b.utm ?? {}), b.token ?? `tok-${seq}-${Math.random()}`, b.ip ?? 'iphash-web'],
  ).then((r) => r[0].r)

beforeAll(async () => {
  db = await createDb()
  T = Object.fromEntries((await db.query<{ code: string; id: string }>('select code, id from public.treatments')).rows.map((r) => [r.code, r.id]))
  M = (await one<{ d: string }>(`select (current_date + 7 + (8 - extract(isodow from current_date + 7)::int) % 7)::text as d`)).d // un lunes dentro de ~2 semanas
})

describe('public_slots', () => {
  it('solo devuelve horarios (sin odontologo, gabinete ni nombres)', async () => {
    const r = await slots('consulta', M)
    expect(r.length).toBeGreaterThan(10)
    expect(Object.keys(r[0])).toEqual(['slot_start'])
    expect(await hhmm(r[0].slot_start)).toBe('08:30')
  })
  it('solo tratamientos reservables en linea', async () => {
    await expect(slots('extraccion', M)).rejects.toThrow('NOT_FOUND')
    await expect(svc(`select * from public.public_slots($1, $2, $3, $3)`, [ID.clinic, ID.clinic, M])).rejects.toThrow('NOT_FOUND')
  })
  it('respeta anticipacion minima (2 h) y horizonte (60 dias)', async () => {
    const all = [...(await slots('consulta', M, await day(30))), ...(await slots('consulta', await day(50), await day(80)))]
    const ok = await Promise.all(all.map(async (s) => (await one<{ ok: boolean }>(`select $1::timestamptz >= now() + interval '2 hours' and $1::timestamptz <= now() + interval '61 days' as ok`, [s.slot_start])).ok))
    expect(ok.every(Boolean)).toBe(true)
    const today = (await one<{ d: string }>(`select (now() at time zone '${TZ}')::date::text as d`)).d
    const near = await slots('consulta', today)
    const lead = await Promise.all(near.map(async (s) => (await one<{ ok: boolean }>(`select $1::timestamptz >= now() + interval '2 hours' as ok`, [s.slot_start])).ok))
    expect(lead.every(Boolean)).toBe(true)
  })
  it('un domingo no ofrece nada', async () => {
    expect(await slots('consulta', await day(6))).toHaveLength(0)
  })
})

describe('public_book', () => {
  it('crea paciente, cita web, consentimiento, atribucion, enlace de check-in y avisos', async () => {
    const d = await day(1)
    const r = await book({ start: at(d, '10:00'), name: 'Mariela  Quispe Laura', phone: '+59170001111', wa: true, ip: 'ip-hash-xyz', token: 'tok-public-1',
      utm: { utm_source: 'tiktok', utm_campaign: 'limpieza-san-miguel', utm_medium: 'video', referrer: 'https://tiktok.com', landing_path: '/reservar' } })
    expect(r.code).toMatch(/^[0-9A-F]{8}$/)
    const a = await one(`select a.source, a.status, a.campaign_id, p.full_name, p.first_source, p.first_campaign_id, p.normalized_name, p.status as pstatus, a.created_by
                           from public.appointments a join public.patients p on p.id = a.patient_id where a.id = $1`, [r.appointment_id])
    expect(a).toMatchObject({ source: 'campaign', status: 'scheduled', full_name: 'Mariela Quispe Laura', first_source: 'campaign', normalized_name: 'mariela quispe laura', pstatus: 'new', created_by: null })
    expect(a.campaign_id).toBe('00000000-0000-4000-8000-0000000000e1')
    expect((await db.query(`select utm_source, utm_campaign, referrer from public.attribution_touches where appointment_id = $1`, [r.appointment_id])).rows).toEqual([{ utm_source: 'tiktok', utm_campaign: 'limpieza-san-miguel', referrer: 'https://tiktok.com' }])
    expect((await db.query<{ type: string; channel: string }>(`select v.type, c.channel from public.patient_consents c join public.consent_versions v on v.id = c.consent_version_id where c.patient_id = (select patient_id from public.appointments where id = $1) order by v.type`, [r.appointment_id])).rows).toEqual([
      { type: 'data_processing', channel: 'web' }, { type: 'whatsapp_reminders', channel: 'web' },
    ])
    expect((await one(`select ip_hash from public.audit_log where action = 'public.book' and entity_id = $1`, [r.appointment_id])).ip_hash).toBe('ip-hash-xyz')
    expect((await svc<{ c: { first_name: string } }>(`select public.checkin_context(${HASH}) as c`, ['tok-public-1']))[0].c.first_name).toBe('Mariela') // el enlace de check-in ya sirve
    expect((await db.query(`select 1 from public.notifications where title = 'Nueva cita desde la web' and user_id in ($1, $2)`, [ID.reception, ID.dentistA])).rows.length).toBeGreaterThan(0)
  })
  it('sin campana conocida el canal es web; utm desconocida no inventa campana', async () => {
    const r = await book({ start: at(await day(1), '11:00'), utm: { utm_campaign: 'no-existe' } })
    expect((await one(`select source, campaign_id from public.appointments where id = $1`, [r.appointment_id]))).toEqual({ source: 'web', campaign_id: null })
  })
  it('el mismo celular reutiliza al paciente (sin duplicados) y limita a 3 citas vigentes', async () => {
    const phone = '+59170002222'
    for (const h of ['09:00', '10:30', '12:00']) await book({ start: at(await day(2), h), phone })
    expect((await one<{ n: number }>(`select count(*)::int as n from public.patients where phone_e164 = $1`, [phone])).n).toBe(1)
    await expect(book({ start: at(await day(2), '14:00'), phone })).rejects.toThrow('TOO_MANY')
  })
  it.each([
    ['name', { name: 'Solo' }], ['name', { name: '  ' }], ['phone', { phone: '71234567' }], ['phone', { phone: '+59181234567' }], ['consent', { data: false }],
  ])('rechaza datos invalidos (%s)', async (field, patch) => {
    await expect(book({ start: at(await day(3), '09:00'), ...patch })).rejects.toThrow(/INVALID_PAYLOAD/)
  })
  it('tratamiento no reservable, fuera de rango y horarios que no existen', async () => {
    await expect(book({ treatment: 'extraccion', start: at(await day(3), '09:00') })).rejects.toThrow('NOT_FOUND')
    await expect(book({ start: new Date(Date.now() + 3600_000).toISOString() })).rejects.toThrow('OUT_OF_RANGE')
    await expect(book({ start: new Date(Date.now() + 90 * 86400_000).toISOString() })).rejects.toThrow('OUT_OF_RANGE')
    await expect(book({ start: at(await day(6), '10:00') })).rejects.toThrow('SLOT_TAKEN') // domingo: no hay disponibilidad
    await expect(book({ start: at(await day(3), '09:10') })).rejects.toThrow('SLOT_TAKEN') // no alinea con la rejilla
  })
  it('la capacidad es el minimo entre odontologos y gabinetes: 20 reservas simultaneas → 3', async () => {
    const start = at(await day(4), '15:00')
    const r = await Promise.allSettled(Array.from({ length: 20 }, () => book({ start })))
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(3)
    expect(r.filter((x) => x.status === 'rejected').every((x) => /SLOT_TAKEN/.test(String((x as PromiseRejectedResult).reason)))).toBe(true)
    const used = await db.query(`select distinct dentist_id, cabinet_id from public.appointments where starts_at = $1 and status = 'scheduled'`, [start])
    expect(used.rows).toHaveLength(3) // tres odontologos y tres gabinetes distintos
    expect(new Set(used.rows.map((x) => (x as { cabinet_id: string }).cabinet_id)).size).toBe(3)
  })
  it('sin texto legal aprobado no se reserva', async () => {
    await db.exec(`update public.clinics set allow_draft_legal = false`)
    await expect(book({ start: at(await day(5), '10:00') })).rejects.toThrow('CONSENT_NOT_READY')
    await db.exec(`update public.clinics set allow_draft_legal = true`)
  })
  it('solo el servidor puede ejecutarlas', async () => {
    for (const fn of ['public_slots(uuid,uuid,date,date)', 'public_book(uuid,uuid,timestamptz,text,text,boolean,boolean,jsonb,bytea,text)', 'public_consent_texts(uuid)', 'slots_core(uuid,uuid,date,date,uuid,integer)']) {
      for (const role of ['anon', 'authenticated']) expect((await one<{ ok: boolean }>(`select has_function_privilege($1, 'public.${fn}', 'execute') as ok`, [role])).ok, `${role} ${fn}`).toBe(false)
    }
    await expect(as(db, 'anon', (tx) => tx.query(`select * from public.public_slots($1, $2, $3, $3)`, [ID.clinic, T.consulta, M]))).rejects.toThrow(/permission denied/)
  })
  it('las reservas web quedan visibles en la agenda con su origen', async () => {
    const r = await as(db, { uid: ID.reception }, (tx) => tx.query(`select source from public.appointments where source in ('web', 'campaign')`))
    expect(r.rows.length).toBeGreaterThan(5)
  })
})

describe('textos legales publicos', () => {
  it('devuelve la version vigente con su huella', async () => {
    const [{ t }] = await svc<{ t: { type: string; hash: string; draft: boolean }[] }>(`select public.public_consent_texts($1) as t`, [ID.clinic])
    expect(t.map((x) => x.type).sort()).toEqual(['clinical_treatment', 'data_processing', 'whatsapp_reminders'])
    expect(t.every((x) => x.hash.length === 64 && x.draft)).toBe(true)
  })
})
