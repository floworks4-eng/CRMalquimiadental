import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ claims: vi.fn(), from: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../supabase/server', () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims }, from: mocks.from }) }))
import { getSession } from './session'

let membership: { clinic_id: string; role: string; title: string | null; clinic: { name: string } | null } | null
const selections: string[] = []
const filters: [string, unknown][] = []
beforeEach(() => {
  vi.clearAllMocks()
  selections.length = 0
  filters.length = 0
  membership = { clinic_id: 'clinic', role: 'dentist', title: null, clinic: { name: 'Clínica de prueba' } }
  mocks.claims.mockResolvedValue({
    data: { claims: { sub: 'verified-user', email: 'test@example.invalid', user_metadata: { role: 'clinic_admin' } } },
  })
  mocks.from.mockImplementation((table) => ({
    select(columns: string) {
      selections.push(columns)
      const query = {
        eq(key: string, value: unknown) {
          filters.push([key, value])
          return query
        },
        maybeSingle: async () => ({ data: table === 'profiles' ? { full_name: 'Persona de prueba' } : membership }),
      }
      return query
    },
  }))
})

describe('Sesión verificada con membresía y clínica en una consulta', () => {
  it('mantiene la identidad y el rol de la membresía, sin una tercera consulta de clínica', async () => {
    const session = await getSession()
    expect(session?.userId).toBe('verified-user')
    expect(session?.member).toEqual({ clinicId: 'clinic', clinicName: 'Clínica de prueba', role: 'dentist', title: null })
    expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(['profiles', 'clinic_members'])
    expect(selections).toContain('clinic_id, role, title, clinic:clinics(name)')
    expect(filters).toContainEqual(['user_id', 'verified-user'])
    expect(filters).toContainEqual(['active', true])
  })

  it('no lee membresías sin claims verificados ni inventa acceso cuando no hay membresía', async () => {
    mocks.claims.mockResolvedValueOnce({ data: { claims: null } })
    expect(await getSession()).toBeNull()
    expect(mocks.from).not.toHaveBeenCalled()
    membership = null
    expect((await getSession())?.member).toBeNull()
  })
})
