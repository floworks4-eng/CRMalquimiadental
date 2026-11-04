import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '@/lib/settings-tabs'
import type { Session } from '../auth/session'
import type { SettingsData } from './settings'

const mocks = vi.hoisted(() => ({ session: vi.fn(), client: vi.fn(), admin: vi.fn(), users: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../auth/session', () => ({ getSession: mocks.session }))
vi.mock('../supabase/server', () => ({ createClient: mocks.client }))
vi.mock('../supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
import { getSettings } from './settings'

type Result = { data: unknown; error: { message: string } | null }
const session: Session = {
  userId: 'admin', email: null, fullName: null,
  member: { clinicId: 'clinic', clinicName: 'Nombre de membresía', role: 'clinic_admin', title: null },
}
const empty: SettingsData = {
  clinic: { name: 'Nombre de membresía', legalName: '', nit: '', phone: '', whatsappNumber: '', address: '' },
  hours: [], holidays: [], cabinets: [], categories: [], treatments: [], supplies: [], members: [],
}
const full: SettingsData = {
  clinic: { name: 'Clínica sintética', legalName: 'Razón social', nit: '123', phone: '2222222', whatsappNumber: '70000000', address: 'Dirección' },
  hours: Array.from({ length: 7 }, (_, weekday) => ({
    weekday, closed: weekday !== 1, opens: '08:30', closes: weekday === 1 ? '18:00' : '19:30',
  })),
  holidays: [{ id: 'holiday', date: '2026-12-25', name: 'Feriado' }],
  cabinets: [{ id: 'cabinet', name: 'Consultorio', active: false }],
  categories: [{ id: 'category', name: 'General' }],
  treatments: [{
    id: 'treatment', code: 'T1', name: 'Consulta', categoryId: 'category', durationMin: 45,
    priceCents: 12500, requiresTooth: true, active: false, recipe: [{ supplyItemId: 'supply', qty: 1.5 }],
  }],
  supplies: [{ id: 'supply', name: 'Insumo', unit: 'ml' }],
  members: [{
    id: 'member', userId: 'dentist', fullName: 'Profesional sintético', email: 'synthetic@example.com',
    role: 'dentist', title: 'Especialista', active: false, schedule: [{ weekday: 1, starts: '09:00', ends: '13:00' }],
  }, {
    id: 'member-without-profile', userId: 'other', fullName: '—', email: null,
    role: 'reception', title: null, active: true, schedule: [],
  }],
}
const cases: { tab: Tab | undefined; tables: string[]; fields: (keyof SettingsData)[] }[] = [
  { tab: 'clinica', tables: ['clinics'], fields: ['clinic'] },
  { tab: 'horarios', tables: ['clinic_hours', 'clinic_holidays', 'cabinets'], fields: ['hours', 'holidays', 'cabinets'] },
  { tab: 'tratamientos', tables: ['treatment_categories', 'treatments', 'treatment_supplies', 'supply_items'], fields: ['categories', 'treatments', 'supplies'] },
  { tab: 'equipo', tables: ['clinic_hours', 'clinic_members', 'dentist_schedules'], fields: ['hours', 'members'] },
  { tab: 'importar', tables: [], fields: [] },
  {
    tab: undefined,
    tables: ['clinics', 'clinic_hours', 'clinic_holidays', 'cabinets', 'treatment_categories', 'treatments', 'treatment_supplies', 'supply_items', 'clinic_members', 'dentist_schedules'],
    fields: Object.keys(full) as (keyof SettingsData)[],
  },
]
let results: Record<string, Result>
let started: string[]
let queries: { table: string; filters: [string, unknown][] }[]

beforeEach(() => {
  vi.clearAllMocks()
  started = []
  queries = []
  const rows: Record<string, unknown> = {
    clinics: { name: 'Clínica sintética', legal_name: 'Razón social', nit: '123', phone: '2222222', whatsapp_number: '70000000', address: 'Dirección' },
    clinic_hours: [{ weekday: 1, is_closed: false, opens_at: '08:30:00', closes_at: '18:00:00' }],
    clinic_holidays: full.holidays,
    cabinets: full.cabinets,
    treatment_categories: full.categories,
    treatments: [{ id: 'treatment', code: 'T1', name: 'Consulta', category_id: 'category', duration_min: 45, price_cents: 12500, requires_tooth: true, active: false }],
    treatment_supplies: [{ treatment_id: 'unrelated', supply_item_id: 'outside', qty: '99' }, { treatment_id: 'treatment', supply_item_id: 'supply', qty: '1.5' }],
    supply_items: full.supplies,
    clinic_members: [{ id: 'member', user_id: 'dentist', role: 'dentist', title: 'Especialista', active: false, profile: { full_name: 'Profesional sintético' } }, { id: 'member-without-profile', user_id: 'other', role: 'reception', title: null, active: true, profile: null }],
    dentist_schedules: [{ dentist_id: 'dentist', weekday: 1, starts_at: '09:00:00', ends_at: '13:00:00' }],
  }
  results = Object.fromEntries(Object.entries(rows).map(([table, data]) => [table, { data, error: null }]))
  mocks.session.mockResolvedValue(session)
  mocks.users.mockResolvedValue({ data: { users: [{ id: 'dentist', email: 'synthetic@example.com' }] }, error: null })
  mocks.admin.mockReturnValue({ auth: { admin: { listUsers: mocks.users } } })
  mocks.client.mockResolvedValue({
    from(table: string) {
      const filters: [string, unknown][] = []
      queries.push({ table, filters })
      return {
        select() { return this },
        eq(key: string, value: unknown) { filters.push([key, value]); return this },
        order() { return this },
        gte() { return this },
        single() { return this },
        then(resolve: (result: Result) => unknown) {
          started.push(table)
          return Promise.resolve(results[table]).then(resolve)
        },
      }
    },
  })
})

describe('configuración por sección con contrato completo', () => {
  it.each(cases)('$tab lee solo su sección y conserva los campos activos y los valores inactivos', async ({ tab, tables, fields }) => {
    const result = tab === undefined ? await getSettings() : await getSettings(tab)
    const expected = { ...empty, ...Object.fromEntries(fields.map((key) => [key, full[key]])) }
    expect(result).toEqual(expected)
    expect(started.sort()).toEqual([...tables].sort())
    expect(queries.map((query) => query.table).sort()).toEqual([...tables].sort())
    const needsUsers = tab === undefined || tab === 'equipo'
    expect(mocks.admin).toHaveBeenCalledTimes(needsUsers ? 1 : 0)
    expect(mocks.users).toHaveBeenCalledTimes(needsUsers ? 1 : 0)
    if (needsUsers) expect(mocks.users).toHaveBeenCalledWith({ perPage: 1000 })
    if (tab === 'importar') expect(mocks.client).not.toHaveBeenCalled()
    for (const query of queries) {
      if (query.table === 'clinics') expect(query.filters).toContainEqual(['id', 'clinic'])
      if (query.table === 'clinic_members') expect(query.filters).toContainEqual(['clinic_id', 'clinic'])
    }
  })

  it('sin argumento conserva los defaults de campos nulos y los siete días cerrados', async () => {
    for (const table of Object.keys(results)) results[table] = { data: null, error: null }
    results.clinics.data = { name: 'Clínica sintética', legal_name: null, nit: null, phone: null, whatsapp_number: null, address: null }
    mocks.users.mockResolvedValue({ data: null, error: null })
    expect(await getSettings()).toEqual({
      ...empty,
      clinic: { ...empty.clinic, name: 'Clínica sintética' },
      hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, closed: true, opens: '08:30', closes: '19:30' })),
    })
  })

  it.each([undefined, 'clinica'] as const)('no entrega un formulario de clínica vacío si falla la consulta (%s)', async (tab) => {
    results.clinics = { data: null, error: { message: 'Lectura fallida' } }
    await expect(getSettings(tab)).rejects.toThrow('No se pudo cargar la configuración de la clínica.')
  })

  it('también rechaza una clínica ausente aunque no haya error de PostgREST', async () => {
    results.clinics = { data: null, error: null }
    await expect(getSettings('clinica')).rejects.toThrow('No se pudo cargar la configuración de la clínica.')
  })

  it('rechaza respuestas con error incluso si traen datos de clínica', async () => {
    results.clinics.error = { message: 'Lectura incompleta' }
    await expect(getSettings('clinica')).rejects.toThrow('No se pudo cargar la configuración de la clínica.')
  })

  it('no comparte datos ni defaults mutables entre llamadas', async () => {
    const first = await getSettings('importar')
    first.clinic.name = 'Borrador'
    first.members.push(full.members[0])
    expect(await getSettings('importar')).toEqual(empty)
    expect((await getSettings('clinica')).clinic.name).toBe('Clínica sintética')
    results.clinics.data = { name: 'Nombre actualizado' }
    expect((await getSettings('clinica')).clinic.name).toBe('Nombre actualizado')
    expect(started).toEqual(['clinics', 'clinics'])
  })
})

describe('permiso de administrador antes de toda lectura', () => {
  it.each(cases)('rechaza roles sin permiso antes de abrir clientes, incluso en $tab', async ({ tab }) => {
    for (const role of ['dentist', 'reception'] as const) {
      mocks.session.mockResolvedValue({ ...session, member: { ...session.member!, role } })
      await expect(getSettings(tab)).rejects.toThrow('REDIRECT:/forbidden')
    }
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.admin).not.toHaveBeenCalled()
    expect(mocks.users).not.toHaveBeenCalled()
    expect(queries).toEqual([])
    expect(started).toEqual([])
  })

  it('rechaza sesión y membresía ausentes antes de leer', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(getSettings('equipo')).rejects.toThrow('REDIRECT:/login')
    mocks.session.mockResolvedValue({ ...session, member: null })
    await expect(getSettings()).rejects.toThrow('REDIRECT:/forbidden')
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.admin).not.toHaveBeenCalled()
    expect(mocks.users).not.toHaveBeenCalled()
  })

  it('espera al guard antes de iniciar las lecturas y Auth Admin', async () => {
    let authorize!: (value: Session) => void
    mocks.session.mockReturnValue(new Promise<Session>((resolve) => { authorize = resolve }))
    const pending = getSettings('equipo')
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.admin).not.toHaveBeenCalled()
    expect(mocks.users).not.toHaveBeenCalled()
    authorize(session)
    expect((await pending).members).toEqual(full.members)
    expect(started).toHaveLength(3)
    expect(mocks.users).toHaveBeenCalledTimes(1)
  })
})
