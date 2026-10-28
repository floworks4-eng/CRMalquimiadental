import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ guard: vi.fn(), createUser: vi.fn(), insert: vi.fn(), log: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../auth/guards', () => ({ requireCapability: mocks.guard }))
vi.mock('../supabase/server', () => ({ createClient: async () => ({ rpc: mocks.log }) }))
vi.mock('../supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { createUser: mocks.createUser } }, from: () => ({ insert: mocks.insert }) }) }))
import { createMember } from './members'

describe('el Doc crea cuentas de equipo sin correo de invitación', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.guard.mockResolvedValue({ member: { clinicId: 'mi-clinica' } })
    mocks.createUser.mockResolvedValue({ data: { user: { id: 'nuevo-usuario' } }, error: null })
    mocks.insert.mockResolvedValue({ error: null })
  })
  it.each(['dentist', 'reception'])('crea y vincula el rol %s a la clínica del administrador', async (role) => {
    const result = await createMember({ fullName: 'Persona Prueba', email: 'prueba@example.com', role, password: 'solo-prueba-123456' })
    expect(result.ok).toBe(true)
    expect(mocks.guard).toHaveBeenCalledWith('members.manage')
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: true }))
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ clinic_id: 'mi-clinica', user_id: 'nuevo-usuario', role }))
  })
  it('informa un correo duplicado sin crear otra membresía', async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } })
    const result = await createMember({ fullName: 'Persona Prueba', email: 'prueba@example.com', role: 'reception', password: 'solo-prueba-123456' })
    expect(result.ok).toBe(false)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
