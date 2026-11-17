import { beforeEach, it, expect, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), patient: vi.fn(), client: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('./supabase/server', () => ({ createClient: mocks.client }))
vi.mock('./auth/session', () => ({ getSession: mocks.session }))
import { journalAccess } from './journal'
const id = '11111111-1111-4111-8111-111111111111',
  clinic = '22222222-2222-4222-8222-222222222222'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockResolvedValue({ userId: id, member: { role: 'clinic_admin', clinicId: clinic } })
  mocks.patient.mockResolvedValue({ data: { id, clinic_id: clinic } })
  mocks.client.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.patient }) }) }) })
})
it('rechaza recepción antes de consultar salud o archivos', async () => {
  mocks.session.mockResolvedValue({ member: { role: 'reception', clinicId: clinic } })
  expect((await journalAccess(new Request('https://example.test/api'), id)).response?.status).toBe(403)
  expect(mocks.client).not.toHaveBeenCalled()
})
it('no acepta una solicitud de escritura desde otro sitio', async () => {
  expect(
    (await journalAccess(new Request('https://example.test/api', { headers: { Origin: 'https://evil.test' } }), id)).response?.status,
  ).toBe(403)
  expect(mocks.session).not.toHaveBeenCalled()
})
it('oculta los pacientes de otra clínica aunque exista el identificador', async () => {
  mocks.patient.mockResolvedValue({ data: { id, clinic_id: 'otra' } })
  expect((await journalAccess(new Request('https://example.test/api'), id)).response?.status).toBe(404)
})
it('permite acceso con membresía clínica y paciente autorizado por RLS', async () => {
  expect((await journalAccess(new Request('https://example.test/api'), id)).clinicId).toBe(clinic)
})
