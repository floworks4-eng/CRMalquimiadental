import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ guard: vi.fn(), client: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../auth/guards', () => ({ requireMember: mocks.guard }))
vi.mock('../supabase/server', () => ({ createClient: mocks.client }))
import { getCalendarBoard } from './agenda'

type Result = { data: unknown; error: null }
type Call = { table: string; from?: string; to?: string; range?: [number, number] }
const calls: Call[] = []
const rows = Array.from({ length: 503 }, (_, i) => ({
  id: `appointment-${i}`,
  starts_at: '2026-11-02T13:00:00Z',
  ends_at: '2026-11-02T13:30:00Z',
  status: 'confirmed',
  source: 'phone',
  notes: null,
  cancellation_reason: null,
  checked_in_at: null,
  updated_at: '2026-11-01T00:00:00Z',
  patient: { id: `patient-${i}`, full_name: 'Persona sintética' },
  dentist: { id: 'doctor', full_name: 'Profesional' },
  cabinet: { id: 'c1', name: 'Consultorio' },
  treatment: { id: 't1', name: 'Consulta' },
  campaign: null,
}))
class Query {
  call: Call
  single = false
  equal: Record<string, unknown> = {}
  constructor(table: string) {
    this.call = { table }
  }
  select() {
    return this
  }
  order() {
    return this
  }
  in() {
    return this
  }
  eq(key: string, value: unknown) {
    this.equal[key] = value
    return this
  }
  gte(_key: string, value: string) {
    this.call.from = value
    return this
  }
  lt(_key: string, value: string) {
    this.call.to = value
    return this
  }
  range(from: number, to: number) {
    this.call.range = [from, to]
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }
  then<T>(resolve: (result: Result) => T | PromiseLike<T>): Promise<T> {
    calls.push({ ...this.call })
    const table = this.call.table
    let data: unknown = []
    if (table === 'appointments') data = this.call.range ? rows.slice(this.call.range[0], this.call.range[1] + 1) : rows.slice(0, 1)
    if (table === 'cabinets') data = [{ id: 'c1', name: 'Consultorio' }]
    if (table === 'clinic_members') data = [{ user_id: 'doctor', profiles: { full_name: 'Profesional' } }]
    if (table === 'clinic_hours')
      data = this.single
        ? { opens_at: '08:30:00', closes_at: '18:00:00', is_closed: false }
        : Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens_at: '08:30:00', closes_at: '18:00:00', is_closed: weekday === 0 }))
    if (table === 'clinic_holidays') data = this.single ? null : [{ date: '2026-11-04', name: 'Feriado de prueba' }]
    return Promise.resolve({ data, error: null } as Result).then(resolve)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  mocks.guard.mockResolvedValue({ userId: 'doctor', member: { role: 'clinic_admin' } })
  mocks.client.mockResolvedValue({ from: (table: string) => new Query(table) })
})

describe('lectura mensual con el cliente autenticado', () => {
  it('carga todas las paginas, utiliza los limites UTC de La Paz y conserva feriados y domingos cerrados', async () => {
    const board = await getCalendarBoard('2026-11-02', 'month')
    expect(board.appointments).toHaveLength(503)
    const pages = calls.filter((c) => c.table === 'appointments' && c.range)
    expect(pages.map((p) => p.range)).toEqual([
      [0, 499],
      [500, 999],
    ])
    for (const page of pages) {
      expect(page.from).toBe('2026-10-26T04:00:00.000Z')
      expect(page.to).toBe('2026-12-07T04:00:00.000Z')
    }
    expect(board.days.find((d) => d.date === '2026-11-04')).toMatchObject({ hours: null, closedReason: 'Feriado: Feriado de prueba' })
    expect(board.days.find((d) => d.date === '2026-11-08')?.hours).toBeNull()
    expect(board.days.find((d) => d.date === '2026-11-02')?.hours).toEqual({ opens: '08:30', closes: '18:00' })
  })
  it('rechaza la lectura antes de abrir el cliente cuando no hay membresia', async () => {
    mocks.guard.mockRejectedValue(new Error('UNAUTHENTICATED'))
    await expect(getCalendarBoard('2026-11-02', 'month')).rejects.toThrow('UNAUTHENTICATED')
    expect(mocks.client).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })
})
