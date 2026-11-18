import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { finishCare, startCare } from './workflow'

const mock = vi.hoisted(() => ({
  guard: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../auth/guards', () => ({ requireCapability: mock.guard }))
vi.mock('../supabase/server', () => ({ createClient: async () => mock }))

const appointmentId = '00000000-0000-4000-8000-000000000201'
const input = { appointmentId, idempotencyKey: 'care-finish-key' }
beforeEach(() => {
  vi.resetAllMocks()
  mock.guard.mockResolvedValue({ member: { clinicId: 'clinic' } })
  mock.from.mockReturnValue(mock)
  mock.select.mockReturnValue(mock)
  mock.eq.mockReturnValue(mock)
  mock.maybeSingle.mockResolvedValue({ data: { id: 'encounter', patient_id: 'patient' } })
})

it('validates input before doing database work', async () => {
  expect((await startCare({ appointmentId: 'invalid' })).ok).toBe(false)
  expect((await finishCare({ ...input, idempotencyKey: '' })).ok).toBe(false)
  expect(mock.rpc).not.toHaveBeenCalled()
  expect(mock.from).not.toHaveBeenCalled()
})

it('starts through the existing protected transaction', async () => {
  mock.rpc.mockResolvedValue({ data: { encounterId: 'encounter', patientId: 'patient' } })
  expect(await startCare({ appointmentId })).toEqual({ ok: true, data: { encounterId: 'encounter' } })
  expect(mock.guard).toHaveBeenCalledWith('encounters.write')
  expect(mock.rpc).toHaveBeenCalledWith('start_care', { p_appointment: appointmentId })
})

it('finishes the visible encounter for the active clinic and refreshes the workflow pages', async () => {
  const data = { encounterId: 'encounter', invoiceId: 'invoice', totalCents: 100, pendingSupplyCount: 1 }
  mock.rpc.mockResolvedValue({ data })
  expect(await finishCare(input)).toEqual({ ok: true, data })
  expect(mock.guard).toHaveBeenCalledWith('encounters.finish')
  expect(mock.from).toHaveBeenCalledWith('encounters')
  expect(mock.eq).toHaveBeenCalledWith('clinic_id', 'clinic')
  expect(mock.eq).toHaveBeenCalledWith('appointment_id', appointmentId)
  expect(mock.rpc).toHaveBeenCalledWith('finish_care', { p_encounter: 'encounter', p_idempotency_key: input.idempotencyKey })
  for (const path of ['/inicio', '/consulta', '/agenda', '/recepcion', '/pacientes/patient', `/consulta/${appointmentId}`, '/caja', '/inventario']) {
    expect(revalidatePath).toHaveBeenCalledWith(path)
  }
})

it('returns NOT_FOUND when the session cannot see an encounter, and a validation error for an empty evaluation', async () => {
  mock.maybeSingle.mockResolvedValueOnce({ data: null })
  expect(await finishCare(input)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  expect(mock.rpc).not.toHaveBeenCalled()
  mock.rpc.mockResolvedValue({ error: { message: 'EVALUATION_NOTE_REQUIRED' } })
  expect(await finishCare(input)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  expect(revalidatePath).not.toHaveBeenCalled()
})
