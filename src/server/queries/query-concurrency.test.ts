import { AsyncLocalStorage } from 'node:async_hooks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../auth/session'

/*
 * Roundtrips lógicos teóricos (sin auth/createClient, retries HTTP ni memoización
 * automática de fetch; no son mediciones de tiempo ni de un snapshot transaccional):
 * - Dashboard admin: 10 -> 10 (1 cita + 3 caja + 1 stock + 5 setup),
 *   barreras secuenciales 4 -> 1. Recepción: 5 -> 5, 3 -> 1; dentista: 2 -> 2, 2 -> 1.
 * - Consulta visible: base 7 -> 8 (incluye estado dental); + receta y, si hay insumos, stock (1/2);
 *   o + factura y addenda (2) para encuentro terminado/voided. Profundidad máxima
 *   2/3/4 sin cambios, pero encuentro y catálogo arrancan junto a cita. Paciente,
 *   anamnesis, hallazgos y plan siguen dependiendo del patientId de la cita visible.
 *   Cita ausente o sin paciente: 1 -> 3 lecturas; UUID inválido: 0 -> 0.
 * - Historia original: 7 + F firmas. Tras paralelizar: mismo total, sin esperar
 *   otras lecturas para firmar. Ahora: 8 + ceil(F/100), + 1 auditoría dental solo para admin, incluyendo el estado dental,
 *   con lotes en paralelo y
 *   TTL 3600; F=0 no llama a Storage, F=101 pasa de 101 firmas HTTP a 2.
 *   Error por archivo -> url null; error completo devuelto -> todas las URLs de
 *   ese lote null, sin fallback individual. Rechazos de transporte se propagan.
 *   Asociación por path, conservando todas las filas y su orden de lectura.
 * - Detalle visible: 2 -> 2, barreras 2 -> 1. Ausente/RLS: 1 -> 2, siempre null.
 * - React.cache: M llamadas con mismo ID al mismo lector memoizado durante un
 *   render pasan de M ejecuciones a 1; IDs y requests distintos no se comparten.
 *   Consulta + historia para el mismo paciente comparten la lectura de anamnesis
 *   (2 -> 1); no se promete deduplicación entre lectores distintos para otras tablas.
 *
 * Harness: cache real de React Server con dispatcher de request respaldado por ALS.
 * No sustituye al renderer de Next ni demuestra políticas RLS en una DB; verifica
 * guards reales, cliente autenticado, filtros, DTOs y límites de la memoización.
 */
type Result = { data: unknown; error: { message: string } | null; count?: number | null }
type SignedResult = {
  data: { path: string | null; signedUrl: string | null; signedURL: string | null; error: string | null }[] | null
  error: { message: string } | null
}
type RequestContext = { cache: Map<unknown, unknown>; session: Session | null; client: ReturnType<typeof makeClient> }
const requests = new AsyncLocalStorage<RequestContext>()
const mocks = vi.hoisted(() => ({ session: vi.fn(), client: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../auth/session', () => ({ getSession: () => mocks.session() }))
vi.mock('../supabase/server', () => ({ createClient: () => mocks.client() }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
vi.mock('react', async () => {
  const { createRequire } = await import('node:module')
  const { dirname, join } = await import('node:path')
  const require = createRequire(import.meta.url)
  const react = require(join(dirname(require.resolve('react/package.json')), 'react.react-server.js'))
  react.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.A = {
    getCacheForType: (factory: () => unknown) => {
      const cache = requests.getStore()?.cache
      if (!cache) return factory()
      if (!cache.has(factory)) cache.set(factory, factory())
      return cache.get(factory)
    },
  }
  return { cache: react.cache }
})

import { getDashboard } from './dashboard'
import { findingsOf, getConsulta, getPatientClinical, getPatientInvoices } from './clinical'
import { latestDentalFindings } from '@/lib/domain/dental'
import { getCurrentAnamnesis, getPatientDetail } from './patients'

const patientId = '11111111-1111-4111-8111-111111111111'
const otherPatient = '22222222-2222-4222-8222-222222222222'
const appointmentId = '33333333-3333-4333-8333-333333333333'
const stamp = '2026-11-03T14:00:00Z'
const session = (role: 'clinic_admin' | 'dentist' | 'reception' = 'clinic_admin'): Session => ({
  userId: 'doctor', email: null, fullName: null,
  member: { clinicId: 'clinic', clinicName: 'Clínica', role, title: null },
})
const patient = {
  id: patientId, full_name: 'Paciente sintético', phone_e164: '+59170000000', birth_date: null, zone: null,
  status: 'active', first_source: 'phone', primary_dentist: { full_name: 'Profesional' }, email: null,
  sex: null, address: null, primary_dentist_id: 'doctor', updated_at: stamp, campaign: { name: 'Campaña' },
}
const appointment = {
  id: appointmentId, starts_at: stamp, ends_at: '2026-11-03T14:30:00Z', status: 'confirmed', source: 'phone',
  notes: 'Cita', cancellation_reason: null, checked_in_at: null, updated_at: stamp,
  patient: { id: patientId, full_name: patient.full_name }, dentist: { id: 'doctor', full_name: 'Profesional' },
  cabinet: { id: 'cabinet', name: 'Consultorio' }, treatment: { id: 'treatment', name: 'Consulta' }, campaign: null,
}
const anamnesis = {
  id: 'anamnesis', version: 2, allergies: null, allergy_other: null, conditions: null, medications: 'Medicación',
  reason: 'Control', emergency_contact_name: null, emergency_contact_phone: null, pregnancy: false,
  anticoagulants: false, source: 'staff', submitted_at: stamp, reviewed_at: null,
}
const encounter = {
  id: 'encounter', appointment_id: appointmentId, status: 'in_progress', chief_complaint: 'Control',
  notes: 'Nota', started_at: stamp, finished_at: null,
}
const planItem = {
  id: 'plan', treatment_id: 'treatment', tooth_fdi: 11, surfaces: ['M'], status: 'in_progress', price_cents: 12500,
  encounter_id: 'encounter', completed_encounter_id: null, created_at: stamp, treatment: { name: 'Restauración' },
}
const finding = { tooth_fdi: 11, condition: 'caries', surfaces: ['M'], encounter_id: 'encounter', recorded_at: stamp, notes: 'Hallazgo' }
const invoice = {
  id: 'invoice', number: 'F-001', status: 'issued', total_cents: 12500, paid_cents: 2500, discount_cents: 500,
  issued_at: stamp, patient: { id: patientId, full_name: patient.full_name },
}
const ok = (data: unknown, count?: number): Result => ({ data, error: null, count })
const signedOk = (paths: string[]): SignedResult => ({
  data: [...paths].sort().map((path) => ({ path, signedUrl: `https://storage.test/${path}`, signedURL: `/object/sign/${path}`, error: null })),
  error: null,
})
const fileRow = (index: number) => ({
  id: `file-${index}`, kind: index % 2 ? 'photo' : 'document', mime: index % 2 ? 'image/jpeg' : 'application/pdf',
  size_bytes: `${index + 1}`, storage_path: `clinic/${patientId}/${String(index).padStart(3, '0')}`, created_at: stamp,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Thenable perezoso como PostgREST: construir una query NO cuenta como ejecutarla.
class Query implements PromiseLike<Result> {
  operations: [string, ...unknown[]][] = []
  constructor(public table: string, private execute: (q: Query) => Promise<Result>) {}
  select(...args: unknown[]) { this.operations.push(['select', ...args]); return this }
  eq(...args: unknown[]) { this.operations.push(['eq', ...args]); return this }
  neq(...args: unknown[]) { this.operations.push(['neq', ...args]); return this }
  in(...args: unknown[]) { this.operations.push(['in', ...args]); return this }
  gte(...args: unknown[]) { this.operations.push(['gte', ...args]); return this }
  lt(...args: unknown[]) { this.operations.push(['lt', ...args]); return this }
  order(...args: unknown[]) { this.operations.push(['order', ...args]); return this }
  limit(...args: unknown[]) { this.operations.push(['limit', ...args]); return this }
  range(...args: unknown[]) { this.operations.push(['range', ...args]); return this }
  maybeSingle() { this.operations.push(['maybeSingle']); return this }
  then<T = Result, E = never>(yes?: ((r: Result) => T | PromiseLike<T>) | null, no?: ((e: unknown) => E | PromiseLike<E>) | null): Promise<T | E> {
    return this.execute(this).then(yes, no)
  }
}
function makeClient() {
  const started: Query[] = []
  const handlers = new Map<string, (q: Query) => Result | Promise<Result>>()
  const defaults: Record<string, unknown> = {
    appointments: [appointment], patients: patient, v_current_anamnesis: anamnesis, encounters: encounter,
    tooth_findings: [finding], treatment_plan_items: [planItem],
    treatments: [{ id: 'treatment', name: 'Restauración', price_cents: 12500, requires_tooth: true, category: { name: 'General' } }],
  }
  const signed = vi.fn(async (paths: string[], ttl: number): Promise<SignedResult> => {
    if (ttl !== 3600) throw new Error('TTL inesperado')
    return signedOk(paths)
  })
  const individual = vi.fn(() => { throw new Error('No se esperan firmas individuales') })
  const bucket = vi.fn(() => ({ createSignedUrls: signed, createSignedUrl: individual }))
  const from = vi.fn((table: string) => new Query(table, async (q) => {
    started.push(q)
    const handler = handlers.get(table)
    return handler ? handler(q) : ok(table in defaults ? defaults[table] : [], 1)
  }))
  return { from, storage: { from: bucket }, started, handlers, signed, individual, defaults }
}
let db: ReturnType<typeof makeClient>
function render<T>(fn: () => T, s: Session | null = session(), client = db) {
  return requests.run({ cache: new Map(), session: s, client }, fn)
}
const tables = (client = db) => client.started.map((q) => q.table)
// Sin sleeps ni umbrales de duración: avanzar hasta la condición del grafo.
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await Promise.resolve()
  }
  expect(predicate(), 'la lectura esperada no arrancó con las dependencias liberadas').toBe(true)
}
const query = (table: string) => db.started.find((q) => q.table === table)!

beforeEach(() => {
  vi.clearAllMocks()
  db = makeClient()
  mocks.session.mockImplementation(async () => requests.getStore()?.session ?? null)
  mocks.client.mockImplementation(async () => requests.getStore()?.client ?? db)
})

describe('dashboard: concurrencia y contratos por rol', () => {
  it('inicia las diez lecturas del admin antes de resolver cualquiera y conserva agregados y filtros', async () => {
    const gate = deferred<Result>()
    for (const table of ['appointments', 'transactions', 'invoices', 'cash_sessions', 'v_stock', 'treatments', 'clinic_members', 'supply_items', 'patients', 'audit_log']) {
      db.handlers.set(table, () => gate.promise)
    }
    const result = render(() => getDashboard())
    await until(() => db.started.length === 10)
    expect(query('audit_log').operations).toContainEqual(['eq', 'action', 'clinic_hours.update'])
    expect(query('patients').operations).toContainEqual(['select', 'id', { count: 'exact', head: true }])
    expect(query('invoices').operations).toContainEqual(['in', 'status', ['issued', 'partially_paid']])
    gate.resolve(ok([], 0))
    expect(await result).toMatchObject({ appointments: [], money: { incomeTodayCents: 0, pendingCount: 0, pendingCents: 0, cashOpen: true }, lowStock: [], setup: { members: 0, hoursReviewed: false } })

    db = makeClient()
    db.defaults.transactions = [{ amount_cents: 500 }, { amount_cents: -100 }]
    db.defaults.invoices = [invoice, { total_cents: 1000, paid_cents: 500 }]
    db.defaults.cash_sessions = null
    db.defaults.v_stock = [
      { name: 'Guantes', on_hand: '2.5', min_stock: '3', unit: 'par' },
      { name: 'Sin mínimo', on_hand: 0, min_stock: 0, unit: 'u' },
      { name: 'Suficiente', on_hand: 5, min_stock: 2, unit: 'u' },
    ]
    const dashboard = await render(() => getDashboard())
    expect(dashboard.money).toEqual({ incomeTodayCents: 400, pendingCount: 2, pendingCents: 10500, cashOpen: false })
    expect(dashboard.lowStock).toEqual([{ name: 'Guantes', onHand: 2.5, minStock: 3, unit: 'par' }])
    expect(query('appointments').operations).toContainEqual(['gte', 'starts_at', `${dashboard.date}T04:00:00.000Z`])
    expect(query('transactions').operations.filter(([op]) => ['gte', 'lt'].includes(op)))
      .toEqual(query('appointments').operations.filter(([op]) => ['gte', 'lt'].includes(op)).map(([op, , bound]) => [op, 'created_at', bound]))
  })

  it.each(['dentist', 'reception'] as const)('%s no ejecuta consultas de setup ni caja sin capacidad', async (role) => {
    const value = await render(() => getDashboard(), session(role))
    expect(value.setup).toBeNull()
    expect(tables()).not.toEqual(expect.arrayContaining(['audit_log']))
    expect(tables()).toHaveLength(role === 'dentist' ? 2 : 5)
    if (role === 'dentist') {
      expect(value.money).toBeNull()
      expect(tables()).toEqual(['appointments', 'v_stock'])
    }
  })

  it('oculta setup al estar completos los cinco pasos y conserva errores de citas', async () => {
    for (const t of ['treatments', 'clinic_members', 'supply_items', 'patients', 'audit_log']) db.handlers.set(t, () => ok(null, 2))
    expect((await render(() => getDashboard())).setup).toBeNull()
    db.handlers.set('appointments', () => ({ data: null, error: { message: 'denied' } }))
    await expect(render(() => getDashboard())).rejects.toThrow('No pudimos cargar las citas')
  })
})

describe('detalle: lecturas paralelas sin revelar existencia', () => {
  it('carga paciente y citas antes de resolver cualquiera; conserva campos, límite y orden', async () => {
    const p = deferred<Result>(), a = deferred<Result>()
    db.handlers.set('patients', () => p.promise)
    db.handlers.set('appointments', () => a.promise)
    const result = render(() => getPatientDetail(patientId))
    await until(() => db.started.length === 2)
    expect(query('patients').operations).toContainEqual(['eq', 'id', patientId])
    expect(query('appointments').operations).toEqual(expect.arrayContaining([
      ['eq', 'patient_id', patientId], ['order', 'starts_at', { ascending: false }], ['limit', 50],
    ]))
    a.resolve(ok([appointment]))
    p.resolve(ok(patient))
    expect(await result).toMatchObject({ id: patientId, fullName: patient.full_name, phone: patient.phone_e164, primaryDentistName: 'Profesional', primaryDentistId: 'doctor', campaignName: 'Campaña', updatedAt: stamp, email: null, sex: null, address: null, appointments: [{ id: appointmentId, patient: { id: patientId }, notes: 'Cita' }] })
  })

  it.each([false, true])('paciente no visible devuelve null aun con citas visibles y error=%s', async (failure) => {
    db.defaults.patients = null
    if (failure) db.handlers.set('appointments', () => Promise.reject(new Error('network')))
    expect(await render(() => getPatientDetail(patientId))).toBeNull()
  })

  it('propaga fallos de citas si el paciente es visible y fallos de transporte del paciente', async () => {
    db.handlers.set('appointments', () => ({ data: null, error: { message: 'denied' } }))
    await expect(render(() => getPatientDetail(patientId))).rejects.toThrow('No pudimos cargar las citas')
    db.handlers.set('patients', () => Promise.reject(new Error('patient network')))
    await expect(render(() => getPatientDetail(patientId))).rejects.toThrow('patient network')
  })
})

describe('consulta: dependencias por identificador y contratos clínicos', () => {
  it('adelanta encuentro y catálogo; paciente y clínica arrancan al resolver cita aunque catálogo siga pendiente', async () => {
    const a = deferred<Result>(), t = deferred<Result>()
    db.handlers.set('appointments', () => a.promise)
    db.handlers.set('treatments', () => t.promise)
    const result = render(() => getConsulta(appointmentId), session('dentist'))
    await until(() => db.started.length === 3)
    expect(tables()).toEqual(expect.arrayContaining(['appointments', 'encounters', 'treatments']))
    expect(query('encounters').operations).toContainEqual(['eq', 'appointment_id', appointmentId])
    a.resolve(ok([appointment]))
    await until(() => tables().includes('v_current_anamnesis'))
    expect(query('patients').operations).toContainEqual(['eq', 'id', patientId])
    for (const table of ['v_current_anamnesis', 'tooth_findings', 'patient_tooth_states', 'treatment_plan_items']) {
      expect(query(table).operations).toContainEqual(['eq', 'patient_id', patientId])
    }
    expect(query('treatment_plan_items').operations).toEqual(expect.arrayContaining([['neq', 'status', 'cancelled'], ['order', 'sequence'], ['order', 'created_at']]))
    t.resolve(ok(db.defaults.treatments))
    const value = await result
    expect(db.started).toHaveLength(9) // 8 base + receta vacía; no stock sin necesidades.
    expect(value).toMatchObject({ appointment: { id: appointmentId }, patient: { id: patientId, fullName: patient.full_name, phone: patient.phone_e164 }, anamnesis: { version: 2, allergies: [], conditions: [] }, encounter: { id: 'encounter', status: 'in_progress' }, findings: [{ tooth: 11, condition: 'caries', notes: 'Hallazgo' }], treatments: [{ priceCents: 12500, requiresTooth: true, category: 'General' }], supplies: [], invoice: null, addenda: [], canFinish: true, canDiscount: false })
    expect(tables()).not.toContain('v_stock')
  })

  it('mantiene receta -> stock, cantidades acumuladas y plan terminado solo de esta atención', async () => {
    db.defaults.treatment_plan_items = [planItem, { ...planItem, id: 'second' }, { ...planItem, id: 'done-here', status: 'done', completed_encounter_id: 'encounter' }, { ...planItem, id: 'done-elsewhere', status: 'done', completed_encounter_id: 'other' }]
    const recipe = deferred<Result>()
    db.handlers.set('treatment_supplies', () => recipe.promise)
    db.defaults.v_stock = [{ supply_item_id: 'supply', on_hand: '8.5' }]
    const result = render(() => getConsulta(appointmentId))
    await until(() => tables().includes('treatment_supplies'))
    expect(tables()).not.toContain('v_stock')
    expect(query('treatment_supplies').operations).toContainEqual(['in', 'treatment_id', ['treatment']])
    recipe.resolve(ok([{ treatment_id: 'treatment', qty: '1.5', supply_item_id: 'supply', item: { name: 'Resina', unit: 'g' } }]))
    const value = await result
    expect(value?.supplies).toEqual([{ item: 'Resina', unit: 'g', need: 3, available: 8.5 }])
    expect(value?.plan.map((p) => p.id)).toEqual(['plan', 'second', 'done-here'])
    expect(query('v_stock').operations).toContainEqual(['in', 'supply_item_id', ['supply']])
    expect(value).toMatchObject({ canFinish: true, canDiscount: true })
    expect(db.started).toHaveLength(10)
  })

  it('cuenta cada tratamiento por separado y acumula recetas que comparten insumo sin incluir items terminados', async () => {
    db.defaults.treatment_plan_items = [planItem, { ...planItem, id: 'second' }, { ...planItem, id: 'other', treatment_id: 'other' }, { ...planItem, id: 'done', status: 'done' }]
    db.defaults.treatment_supplies = [
      { treatment_id: 'treatment', qty: '1.5', supply_item_id: 'shared', item: { name: 'Resina', unit: 'g' } },
      { treatment_id: 'other', qty: '2', supply_item_id: 'shared', item: { name: 'Resina', unit: 'g' } },
      { treatment_id: 'other', qty: '0.5', supply_item_id: 'second', item: { name: 'Gel', unit: 'ml' } },
    ]
    db.defaults.v_stock = [{ supply_item_id: 'shared', on_hand: '7.5' }, { supply_item_id: 'second', on_hand: '0' }]
    const value = await render(() => getConsulta(appointmentId))
    expect(query('treatment_supplies').operations).toContainEqual(['in', 'treatment_id', ['treatment', 'other']])
    expect(value?.supplies).toEqual([
      { item: 'Resina', unit: 'g', need: 5, available: 7.5 },
      { item: 'Gel', unit: 'ml', need: 0.5, available: 0 },
    ])
  })

  it.each(['finished', 'voided'])('preserva factura y addenda en paralelo en encuentro %s', async (status) => {
    db.defaults.encounters = { ...encounter, status, finished_at: stamp }
    const gate = deferred<Result>()
    db.handlers.set('invoices', () => gate.promise)
    db.defaults.encounter_addenda = [{ id: 'add', reason: 'Corrección', notes: 'Detalle', created_at: stamp, author: null }]
    const result = render(() => getConsulta(appointmentId), { ...session('dentist'), userId: 'another-doctor' })
    await until(() => tables().includes('encounter_addenda'))
    expect(tables()).toContain('invoices')
    expect(tables()).not.toContain('treatment_supplies')
    gate.resolve(ok(invoice))
    expect(await result).toMatchObject({ invoice: { number: 'F-001', totalCents: 12500, paidCents: 2500, discountCents: 500, patient: { id: patientId } }, addenda: [{ id: 'add', reason: 'Corrección', notes: 'Detalle', createdAt: stamp, author: '—' }], canFinish: false, canDiscount: false })
    expect(db.started).toHaveLength(10)
    for (const table of ['invoices', 'encounter_addenda']) expect(query(table).operations).toContainEqual(['eq', 'encounter_id', 'encounter'])
  })

  it.each([{ rows: [] }, { rows: [{ ...appointment, patient: null }] }])('cita ausente/sin paciente no inicia lecturas por patientId', async ({ rows }) => {
    db.defaults.appointments = rows
    db.handlers.set('treatments', () => Promise.reject(new Error('catalog network')))
    db.handlers.set('encounters', () => Promise.reject(new Error('encounter network')))
    expect(await render(() => getConsulta(appointmentId))).toBeNull()
    expect(tables()).toHaveLength(3)
    expect(tables()).not.toContain('patients')
    expect(tables()).not.toContain('v_current_anamnesis')
  })

  it('paciente no visible conserva null; encuentro ausente conserva el DTO sin lecturas posteriores', async () => {
    db.defaults.patients = null
    expect(await render(() => getConsulta(appointmentId))).toBeNull()
    db.defaults.patients = patient
    db.defaults.encounters = null
    expect(await render(() => getConsulta(appointmentId))).toMatchObject({ encounter: null, supplies: [], invoice: null, addenda: [] })
    expect(tables()).not.toContain('treatment_supplies')
    expect(tables()).not.toContain('invoices')
  })
})

describe('historia: firmas dependientes solo de archivos autorizados', () => {
  it('firma antes de que terminen otras lecturas; conserva orden, fallos individuales y todos los DTOs', async () => {
    const slow = deferred<Result>(), files = deferred<Result>(), signed = deferred<SignedResult>()
    db.handlers.set('clinical_notes', () => slow.promise)
    db.handlers.set('patient_files', () => files.promise)
    db.defaults.encounters = [{ ...encounter, status: 'finished', dentist: null, invoice: [invoice], addenda: [{ reason: 'Aclaración', notes: 'Nota', created_at: stamp, author: null }] }]
    db.defaults.treatment_plan_items = [planItem, { ...planItem, id: 'done', status: 'done', completed_encounter_id: 'encounter' }]
    db.defaults.anamnesis_versions = [{ ...anamnesis, allergies: ['Ninguna', 'Penicilina'], allergy_other: 'Látex', conditions: ['Ninguno', 'Diabetes'], author: null }]
    db.signed.mockReturnValue(signed.promise)
    const result = render(() => getPatientClinical(patientId))
    await until(() => db.started.length === 9)
    expect(db.signed).not.toHaveBeenCalled()
    files.resolve(ok([
      { id: 'f1', kind: 'photo', mime: 'image/jpeg', size_bytes: '42', storage_path: 'clinic/patient/first', created_at: stamp },
      { id: 'f2', kind: 'document', mime: 'application/pdf', size_bytes: 24, storage_path: 'clinic/patient/second', created_at: stamp },
    ]))
    await until(() => db.signed.mock.calls.length === 1)
    expect(db.storage.from).toHaveBeenCalledWith('clinical')
    expect(db.signed.mock.calls).toEqual([[['clinic/patient/first', 'clinic/patient/second'], 3600]])
    signed.resolve({ data: [
      { path: 'clinic/patient/second', signedUrl: 'https://storage.test/denied', signedURL: '/denied', error: 'denied' },
      { path: 'clinic/patient/first', signedUrl: 'https://storage.test/first', signedURL: '/first', error: null },
    ], error: null })
    slow.resolve(ok([{ id: 'note', noted_on: '2026-11-03', body: 'Importado', source: 'import', created_at: stamp, author: null }]))
    const value = await result
    expect(value?.files).toEqual([
      { id: 'f1', kind: 'photo', mime: 'image/jpeg', sizeBytes: 42, createdAt: stamp, url: 'https://storage.test/first' },
      { id: 'f2', kind: 'document', mime: 'application/pdf', sizeBytes: 24, createdAt: stamp, url: null },
    ])
    expect(value).toMatchObject({ anamnesis: { reason: 'Control' }, pending: [{ id: 'plan' }], history: [{ id: 'encounter', appointmentId, dentist: '—', items: ['Restauración · 11'], findings: ['11 caries (M)'], invoice: { number: 'F-001', totalCents: 12500, paidCents: 2500 }, addenda: [{ author: '—' }] }], notes: [{ body: 'Importado', source: 'import', author: '—' }], anamnesisVersions: [{ version: 2, author: '—', summary: 'Alergias: Penicilina, Látex · Antecedentes: Diabetes · Medicamentos: Medicación' }] })
    expect(query('clinical_notes').operations).toContainEqual(['limit', 500])
    expect(query('encounters').operations).toContainEqual(['limit', 200])
    for (const q of db.started) expect(q.operations).toContainEqual(['eq', 'patient_id', patientId])
  })

  it('no firma cuando RLS no devuelve archivos y conserva errores de transporte de Storage', async () => {
    db.handlers.set('encounters', (q) => ok(q.operations.some(([op]) => op === 'maybeSingle') ? null : []))
    db.handlers.set('patient_files', () => ({ data: null, error: { message: 'denied' } }))
    expect((await render(() => getPatientClinical(patientId)))?.files).toEqual([])
    expect(db.signed).not.toHaveBeenCalled()
    expect(db.storage.from).not.toHaveBeenCalled()
    expect(db.individual).not.toHaveBeenCalled()
    db.handlers.set('patient_files', () => ok([{ id: 'file', storage_path: 'visible' }]))
    db.signed.mockRejectedValue(new Error('storage network'))
    await expect(render(() => getPatientClinical(patientId))).rejects.toThrow('storage network')
  })

  it.each([0, 1, 100])('%i archivos conservan límite de 100, TTL y metadatos; cero filas no abre Storage', async (count) => {
    db.defaults.encounters = []
    const rows = Array.from({ length: count }, (_, i) => fileRow(i))
    db.defaults.patient_files = rows
    const value = await render(() => getPatientClinical(patientId))
    expect(value?.files).toEqual(rows.map((row) => ({
      id: row.id, kind: row.kind, mime: row.mime, sizeBytes: Number(row.size_bytes), createdAt: row.created_at,
      url: `https://storage.test/${row.storage_path}`,
    })))
    expect(db.signed).toHaveBeenCalledTimes(count ? 1 : 0)
    expect(db.storage.from).toHaveBeenCalledTimes(count ? 1 : 0)
    if (count) expect(db.signed).toHaveBeenCalledWith(rows.map((row) => row.storage_path), 3600)
    expect(db.individual).not.toHaveBeenCalled()
  })

  it('101 archivos firman en dos lotes concurrentes y vuelven al orden original con respuestas ordenadas por path', async () => {
    db.defaults.encounters = []
    const rows = Array.from({ length: 101 }, (_, i) => fileRow(100 - i))
    db.defaults.patient_files = rows
    const first = deferred<SignedResult>(), second = deferred<SignedResult>()
    db.signed.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const result = render(() => getPatientClinical(patientId))
    await until(() => db.signed.mock.calls.length === 2)
    const paths = rows.map((row) => row.storage_path)
    expect(db.signed.mock.calls).toEqual([[paths.slice(0, 100), 3600], [paths.slice(100), 3600]])
    second.resolve(signedOk(paths.slice(100)))
    first.resolve(signedOk(paths.slice(0, 100)))
    const value = await result
    expect(value?.files).toEqual(rows.map((row) => ({
      id: row.id, kind: row.kind, mime: row.mime, sizeBytes: Number(row.size_bytes), createdAt: stamp,
      url: `https://storage.test/${row.storage_path}`,
    })))
    expect(tables()).toEqual(expect.arrayContaining([
      'v_current_anamnesis', 'tooth_findings', 'patient_tooth_states', 'treatment_plan_items',
      'encounters', 'clinical_notes', 'anamnesis_versions', 'patient_files', 'audit_log',
    ]))
    expect(db.started).toHaveLength(9)
    expect(db.individual).not.toHaveBeenCalled()
    expect(query('patient_files').operations).toContainEqual(['eq', 'patient_id', patientId])
  })

  it('errores parciales y entradas faltantes quedan null; preserva duplicados y descarta paths ajenos de la respuesta', async () => {
    db.defaults.encounters = []
    const rows = [fileRow(6), fileRow(2), fileRow(7), { ...fileRow(6), id: 'duplicate-path' }, fileRow(3)]
    db.defaults.patient_files = rows
    db.signed.mockResolvedValue({ data: [
      { path: fileRow(2).storage_path, signedUrl: 'https://storage.test/denied', signedURL: '/denied', error: 'denied' },
      { path: null, signedUrl: 'https://storage.test/invalid', signedURL: '/invalid', error: null },
      { path: 'another-clinic/private', signedUrl: 'https://storage.test/foreign', signedURL: '/foreign', error: null },
      ...signedOk([fileRow(6).storage_path]).data!,
      { path: fileRow(3).storage_path, signedUrl: null, signedURL: null, error: null },
    ], error: null })
    const value = await render(() => getPatientClinical(patientId))
    expect(value?.files.map((file) => [file.id, file.url])).toEqual([
      ['file-6', `https://storage.test/${fileRow(6).storage_path}`], ['file-2', null], ['file-7', null],
      ['duplicate-path', `https://storage.test/${fileRow(6).storage_path}`], ['file-3', null],
    ])
    expect(db.signed).toHaveBeenCalledWith(rows.map((row) => row.storage_path), 3600)
    expect(db.individual).not.toHaveBeenCalled()
  })

  it('un error completo en un lote deja sus 100 URLs null sin afectar el segundo ni usar fallback individual', async () => {
    db.defaults.encounters = []
    const rows = Array.from({ length: 101 }, (_, i) => fileRow(i))
    db.defaults.patient_files = rows
    db.signed.mockResolvedValueOnce({ data: null, error: { message: 'batch denied' } })
    const value = await render(() => getPatientClinical(patientId))
    expect(value?.files).toHaveLength(101)
    expect(value?.files.slice(0, 100).every((file) => file.url === null)).toBe(true)
    expect(value?.files[100]).toMatchObject({ id: 'file-100', url: `https://storage.test/${rows[100].storage_path}` })
    expect(db.signed).toHaveBeenCalledTimes(2)
    expect(db.individual).not.toHaveBeenCalled()
  })

  it('agrupa por encuentro conservando el orden, duplicados, campos y todos los hallazgos y pendientes', async () => {
    db.defaults.encounters = [
      { ...encounter, id: 'b', status: 'finished', dentist: { full_name: 'Dentista B' }, invoice, addenda: [] },
      { ...encounter, id: 'a', status: 'finished', dentist: null, invoice: [], addenda: null },
      { ...encounter, id: 'empty', status: 'voided', dentist: null, invoice: null, addenda: [] },
    ]
    db.defaults.treatment_plan_items = [
      { ...planItem, id: 'b1', status: 'done', completed_encounter_id: 'b', tooth_fdi: null, treatment: { name: 'Limpieza' } },
      { ...planItem, id: 'a1', status: 'done', completed_encounter_id: 'a' },
      { ...planItem, id: 'pending', completed_encounter_id: null },
      { ...planItem, id: 'b2', status: 'done', completed_encounter_id: 'b', tooth_fdi: null, treatment: { name: 'Limpieza' } },
      { ...planItem, id: 'a2', status: 'accepted', completed_encounter_id: 'a', tooth_fdi: null, treatment: null },
      { ...planItem, id: 'outside', status: 'done', completed_encounter_id: 'outside-history' },
    ]
    db.defaults.tooth_findings = [
      { ...finding, encounter_id: 'a', tooth_fdi: 12, surfaces: [] },
      { ...finding, encounter_id: 'b', tooth_fdi: 21, surfaces: ['M', 'O'] },
      { ...finding, encounter_id: 'outside-history' },
      { ...finding, encounter_id: 'b', tooth_fdi: 21, surfaces: ['M', 'O'] },
    ]
    const value = await render(() => getPatientClinical(patientId))
    expect(value?.history.map((h) => ({ id: h.id, items: h.items, findings: h.findings }))).toEqual([
      { id: 'b', items: ['Limpieza', 'Limpieza'], findings: ['21 caries (MO)', '21 caries (MO)'] },
      { id: 'a', items: ['Restauración · 11', '—'], findings: ['12 caries'] },
      { id: 'empty', items: [], findings: [] },
    ])
    expect(value?.history[0]).toMatchObject({ dentist: 'Dentista B', chiefComplaint: 'Control', notes: 'Nota', startedAt: stamp, invoice: { number: 'F-001', totalCents: 12500, paidCents: 2500 } })
    expect(value?.history[1].invoice).toBeNull()
    expect(value?.history[2].invoice).toBeNull()
    expect(value?.pending.map((item) => item.id)).toEqual(['pending', 'a2'])
    expect(value?.findings.map((f) => [f.encounterId, f.tooth, f.surfaces])).toEqual([
      ['a', 12, []], ['b', 21, ['M', 'O']], ['outside-history', 11, ['M']], ['b', 21, ['M', 'O']],
    ])
  })
})

describe('seguridad y memoización de request con React Server real', () => {
  const readers: (() => Promise<unknown>)[] = [() => getPatientDetail(patientId), () => getCurrentAnamnesis(patientId), () => getConsulta(appointmentId), () => getPatientClinical(patientId)]

  it.each(readers)('rechaza sesión ausente antes de crear cliente o ejecutar lecturas', async (read) => {
    await expect(render(read, null)).rejects.toThrow('REDIRECT:/login')
    expect(mocks.client).not.toHaveBeenCalled()
    expect(db.started).toHaveLength(0)
  })

  it.each<() => Promise<unknown>>([() => getConsulta(appointmentId), () => getPatientClinical(patientId), () => getCurrentAnamnesis(patientId)])('recepción no abre cliente clínico', async (read) => {
    await expect(render(read, session('reception'))).rejects.toThrow('REDIRECT:/forbidden')
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it('UUID inválido no abre sesión, cliente ni Storage en ninguno de los lectores', async () => {
    expect(await Promise.all([getPatientDetail('invalid'), getCurrentAnamnesis('invalid'), getConsulta('invalid'), getPatientClinical('invalid'), getPatientInvoices('invalid')])).toEqual([null, null, null, null, []])
    expect(mocks.session).not.toHaveBeenCalled()
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it.each(readers)('deduplica llamadas simultáneas y repetidas del mismo lector dentro del render', async (read) => {
    db.defaults.encounters = []
    await render(async () => {
      const a = read(), b = read()
      expect(a).toBe(b)
      expect(await a).toBe(await b)
      expect(read()).toBe(a)
    })
    expect(mocks.client).toHaveBeenCalledTimes(1 + Number(readers.indexOf(read) >= 2)) // anamnesis usa su propio cliente de sesión.
    expect(tables().filter((t) => t === 'v_current_anamnesis')).toHaveLength(readers.indexOf(read) === 0 ? 0 : 1)
  })

  it('consulta e historia comparten anamnesis pero IDs diferentes ejecutan lecturas separadas', async () => {
    db.handlers.set('encounters', (q) => ok(q.operations.some(([op]) => op === 'maybeSingle') ? null : []))
    await render(async () => {
      await Promise.all([getConsulta(appointmentId), getPatientClinical(patientId), getCurrentAnamnesis(patientId)])
      await getCurrentAnamnesis(otherPatient)
    })
    const calls = db.started.filter((q) => q.table === 'v_current_anamnesis')
    expect(calls).toHaveLength(2)
    expect(calls[0].operations).toContainEqual(['eq', 'patient_id', patientId])
    expect(calls[1].operations).toContainEqual(['eq', 'patient_id', otherPatient])
  })

  it('requests concurrentes no comparten datos, cliente ni permisos para el mismo patientId', async () => {
    const second = makeClient(), gate = deferred<Result>()
    db.handlers.set('v_current_anamnesis', () => gate.promise)
    second.defaults.v_current_anamnesis = { ...anamnesis, reason: 'Otra sesión' }
    const first = render(() => getCurrentAnamnesis(patientId))
    const other = render(() => getCurrentAnamnesis(patientId), session('dentist'), second)
    expect((await other)?.reason).toBe('Otra sesión')
    await expect(render(() => getCurrentAnamnesis(patientId), session('reception'))).rejects.toThrow('REDIRECT:/forbidden')
    gate.resolve(ok(anamnesis))
    expect((await first)?.reason).toBe('Control')
    expect(db.started).toHaveLength(1)
    expect(second.started).toHaveLength(1)
  })

  it('un nuevo render vuelve a leer cambios y null; no cachea pacientes globalmente', async () => {
    expect((await render(() => getPatientDetail(patientId)))?.fullName).toBe(patient.full_name)
    db.defaults.patients = { ...patient, full_name: 'Nombre actualizado' }
    expect((await render(() => getPatientDetail(patientId)))?.fullName).toBe('Nombre actualizado')
    db.defaults.patients = null
    expect(await render(() => getPatientDetail(patientId))).toBeNull()
    expect(tables().filter((t) => t === 'patients')).toHaveLength(3)
  })
})


describe('dental persistence regressions', () => {
  it('loads findings beyond the 1000-row API cap with stable ordering and no omissions', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ ...finding, id: `f-${i}`, tooth_fdi: i === 1000 ? 16 : 11, condition: i === 1000 ? 'sano' : 'caries' }))
    db.handlers.set('tooth_findings', (q) => {
      const range = q.operations.find(([op]) => op === 'range')!
      return ok(rows.slice(Number(range[1]), Number(range[2]) + 1))
    })
    const result = await render(() => findingsOf(db as never, patientId))
    expect(result).toHaveLength(1001)
    expect(result.at(-1)).toMatchObject({ tooth: 16, condition: 'sano' })
    const pages = db.started.filter((q) => q.table === 'tooth_findings')
    expect(pages.map((q) => q.operations.find(([op]) => op === 'range'))).toEqual([
      ['range', 0, 499], ['range', 500, 999], ['range', 1000, 1499],
    ])
    for (const q of pages) expect(q.operations).toEqual(expect.arrayContaining([
      ['eq', 'patient_id', patientId], ['order', 'recorded_at'], ['order', 'id'],
    ]))
  })

  it('fails rather than returning partial findings when a later page fails', async () => {
    db.handlers.set('tooth_findings', (q) => q.operations.some(([op, start]) => op === 'range' && start === 0)
      ? ok(Array.from({ length: 500 }, () => finding)) : { data: null, error: { message: 'network' } })
    await expect(render(() => findingsOf(db as never, patientId))).rejects.toThrow('No pudimos cargar los hallazgos dentales.')
  })

  it('patient and consultation readers share current state by timestamp, preserving encounter history', async () => {
    db.defaults.patient_tooth_states = [{ tooth_fdi: 11, condition: 'sano', surfaces: ['O'], updated_at: '2026-11-04T14:00:00Z' }]
    const consulta = await render(() => getConsulta(appointmentId))
    db.defaults.encounters = []
    const clinical = await render(() => getPatientClinical(patientId))
    expect(latestDentalFindings(consulta!.findings, consulta!.toothStates)).toEqual(latestDentalFindings(clinical!.findings, clinical!.toothStates))
    expect(latestDentalFindings(consulta!.findings, consulta!.toothStates)[0]).toMatchObject({ condition: 'sano', surfaces: ['O'], encounterId: '' })
    expect(consulta?.findings[0].condition).toBe('caries')
    db.defaults.tooth_findings = [{ ...finding, condition: 'obturacion', recorded_at: '2026-11-05T14:00:00Z' }]
    db.defaults.encounters = encounter
    const newer = await render(() => getConsulta(appointmentId))
    expect(latestDentalFindings(newer!.findings, newer!.toothStates)[0].condition).toBe('obturacion')
  })

  it('returns projected create/update/delete history to admins and never queries audit for dentists', async () => {
    db.defaults.encounters = []
    const before = { tooth_fdi: 16, condition: 'caries', surfaces: ['M'], private_field: 'must not escape' }
    const after = { ...before, condition: 'sano' }
    db.defaults.audit_log = [
      { id: 1, at: stamp, before: null, after: before },
      { id: 2, at: stamp, before, after },
      { id: 3, at: stamp, before: after, after: null },
    ]
    const admin = await render(() => getPatientClinical(patientId))
    expect(admin?.toothStateHistoryAvailable).toBe(true)
    expect(admin?.toothStateHistory).toHaveLength(3)
    expect(admin?.toothStateHistory[1]).toEqual({ id: 'audit:2', recordedAt: stamp,
      before: { tooth: 16, condition: 'caries', surfaces: ['M'] }, after: { tooth: 16, condition: 'sano', surfaces: ['M'] } })
    expect(admin?.toothStateHistory[2].after).toBeNull()
    expect(query('audit_log').operations).toEqual(expect.arrayContaining([
      ['eq', 'patient_id', patientId], ['eq', 'entity_type', 'patient_tooth_states'], ['order', 'at'], ['order', 'id'],
    ]))
    db.started.length = 0
    const dentist = await render(() => getPatientClinical(patientId), session('dentist'))
    expect(dentist?.toothStateHistory).toEqual([])
    expect(dentist?.toothStateHistoryAvailable).toBe(false)
    expect(tables()).not.toContain('audit_log')
  })
})
