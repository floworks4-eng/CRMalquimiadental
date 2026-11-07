import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ client: vi.fn(), guard: vi.fn(), appointments: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../supabase/server', () => ({ createClient: mocks.client }))
vi.mock('../auth/guards', () => ({ requireCapability: mocks.guard, requireMember: mocks.guard }))
vi.mock('./agenda', () => ({ appointmentCards: mocks.appointments }))
import { getCashDay, getCashMonth } from './billing'
import { getDashboard } from './dashboard'

type Result = { data: unknown; error: { message: string } | null }
const rows: Record<string, unknown[]> = {}
const calls: { table: string; range: [number, number] | null; orders: string[] }[] = []
let failure: { table: string; offset: number } | null
let cashSession: unknown
let expectedError = false

class Query implements PromiseLike<Result> {
  bounds: [number, number] | null = null
  orders: string[] = []
  single = false
  constructor(public table: string) {}
  select() { return this }
  eq() { return this }
  in() { return this }
  gte() { return this }
  lt() { return this }
  limit() { return this }
  order(key: string) { this.orders.push(key); return this }
  range(a: number, b: number) { this.bounds = [a, b]; return this }
  maybeSingle() { this.single = true; return this }
  then<T = Result, E = never>(yes?: ((value: Result) => T | PromiseLike<T>) | null, no?: ((error: unknown) => E | PromiseLike<E>) | null): Promise<T | E> {
    calls.push({ table: this.table, range: this.bounds, orders: this.orders })
    const failed = failure?.table === this.table && failure.offset === (this.bounds?.[0] ?? 0)
    const data = this.single ? cashSession : this.bounds ? (rows[this.table] ?? []).slice(this.bounds[0], this.bounds[1] + 1) : rows[this.table] ?? []
    return Promise.resolve({ data: failed ? null : data, error: failed ? { message: 'database failure' } : null }).then(yes, no)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(rows)) delete rows[key]
  calls.length = 0
  failure = null
  cashSession = null
  expectedError = false
  mocks.guard.mockResolvedValue({ member: { role: 'reception' } })
  mocks.appointments.mockResolvedValue([])
  mocks.client.mockResolvedValue({
    from: (table: string) => new Query(table),
    rpc: async () => ({ data: expectedError ? null : 15000, error: expectedError ? { message: 'RPC failure' } : null }),
  })
})

function populate(count: number) {
  rows.transactions = Array.from({ length: count }, (_, i) => ({
    id: `tx-${i}`, kind: 'income', category: 'tratamiento', concept: 'Cobro', amount_cents: 100, method: 'cash',
    created_at: '2026-11-03T15:00:00Z', payment_id: null, patient: null, payment: null, by: null, invoice: null,
  }))
  rows.invoices = Array.from({ length: count }, (_, i) => ({
    id: `invoice-${i}`, number: `F-${i}`, status: 'partially_paid', total_cents: 1000, paid_cents: 200,
    discount_cents: 0, issued_at: '2026-11-03T15:00:00Z', patient: null,
  }))
}

describe('caja y dashboard: totales completos y fallos explícitos', () => {
  it('caja diaria conserva más de 100 pendientes y más de 1000 movimientos con orden estable', async () => {
    populate(1003)
    const day = await getCashDay('2026-11-03')
    expect(day.pending).toHaveLength(1003)
    expect(day.movements).toHaveLength(1003)
    expect(day.incomeCents).toBe(100300)
    expect(day.byMethod.cash).toBe(100300)
    for (const table of ['transactions', 'invoices']) {
      expect(calls.filter((c) => c.table === table).map((c) => c.range)).toEqual([[0, 499], [500, 999], [1000, 1499]])
      expect(calls.filter((c) => c.table === table).every((c) => c.orders.includes('id'))).toBe(true)
    }
  })

  it('dashboard agrega todas las páginas sin truncar ingresos ni cuentas pendientes', async () => {
    populate(1003)
    expect((await getDashboard()).money).toEqual({ incomeTodayCents: 100300, pendingCount: 1003, pendingCents: 802400, cashOpen: false })
  })

  it('reporte mensual mantiene los totales y movimientos al compartir el paginador', async () => {
    populate(1003)
    const month = await getCashMonth('2026-01')
    expect(month.movements).toHaveLength(1003)
    expect(month.netCents).toBe(100300)
    expect(month.billedCents).toBe(1003000)
    expect(month.pendingCents).toBe(802400)
  })

  it.each(['transactions', 'invoices', 'cash_sessions'])('dashboard rechaza errores de %s en vez de mostrar ceros', async (table) => {
    failure = { table, offset: 0 }
    await expect(getDashboard()).rejects.toThrow('No pudimos cargar el resumen de caja')
  })

  it.each(['transactions', 'invoices', 'cash_sessions'])('caja diaria rechaza errores de %s', async (table) => {
    failure = { table, offset: 0 }
    await expect(getCashDay('2026-11-03')).rejects.toThrow('No pudimos cargar la caja del día')
  })

  it('un error en la segunda página no devuelve agregados parciales', async () => {
    populate(1003)
    failure = { table: 'transactions', offset: 500 }
    await expect(getDashboard()).rejects.toThrow('No pudimos cargar el resumen de caja')
    await expect(getCashDay('2026-11-03')).rejects.toThrow('No pudimos cargar la caja del día')
    await expect(getCashMonth('2026-01')).rejects.toThrow('No pudimos cargar el reporte de caja')
  })

  it('un error al calcular efectivo esperado no permite presentar una caja incompleta', async () => {
    cashSession = { id: 'session', status: 'open', opened_at: '2026-11-03T15:00:00Z', opening_float_cents: 0 }
    expectedError = true
    await expect(getCashDay('2026-11-03')).rejects.toThrow('No pudimos cargar la caja del día')
  })
})
