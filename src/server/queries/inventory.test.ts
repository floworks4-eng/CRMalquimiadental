import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPendingStockDeficits } from './inventory'

const mocks = vi.hoisted(() => ({ client: vi.fn(), guard: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../supabase/server', () => ({ createClient: mocks.client }))
vi.mock('../auth/guards', () => ({ requireCapability: mocks.guard }))

const query = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn(),
}
const from = vi.fn(() => query)
const deficit = {
  encounter_id: 'encounter',
  supply_item_id: 'supply',
  qty_missing: '1.250',
  created_at: '2026-11-18T15:00:00Z',
  item: { name: 'Resina', unit: 'ml' },
  encounter: { appointment_id: 'appointment', patient: { full_name: 'Paciente de prueba' } },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guard.mockResolvedValue({ member: { clinicId: 'clinic' } })
  mocks.client.mockResolvedValue({ from })
})

describe('lectura de faltantes de inventario', () => {
  it('lee solo los pendientes de la clínica y conserva la cantidad, el paciente y la fecha', async () => {
    query.range.mockResolvedValueOnce({ data: [deficit], error: null })
    expect(await getPendingStockDeficits()).toEqual([{
      encounterId: 'encounter',
      appointmentId: 'appointment',
      patientName: 'Paciente de prueba',
      itemId: 'supply',
      itemName: 'Resina',
      unit: 'ml',
      quantity: 1.25,
      createdAt: deficit.created_at,
    }])
    expect(mocks.guard).toHaveBeenCalledWith('inventory.adjust')
    expect(from).toHaveBeenCalledWith('stock_consumption_deficits')
    expect(query.eq).toHaveBeenCalledWith('clinic_id', 'clinic')
    expect(query.is).toHaveBeenCalledWith('resolved_at', null)
    expect(query.order.mock.calls).toEqual([['created_at', { ascending: false }], ['encounter_id'], ['supply_item_id']])
  })

  it('la autorización se comprueba antes de consultar', async () => {
    mocks.guard.mockRejectedValueOnce(new Error('forbidden'))
    await expect(getPendingStockDeficits()).rejects.toThrow('forbidden')
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it('un fallo en una página posterior no se presenta como una lista parcial ni vacía', async () => {
    query.range.mockResolvedValueOnce({ data: Array(500).fill(deficit), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'connection lost' } })
    await expect(getPendingStockDeficits()).resolves.toBeNull()
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]])
  })
})
