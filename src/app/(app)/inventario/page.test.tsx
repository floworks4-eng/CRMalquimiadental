// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import InventarioPage from './page'

const mocks = vi.hoisted(() => ({ guard: vi.fn(), inventory: vi.fn(), deficits: vi.fn() }))
vi.mock('@/server/auth/guards', () => ({ requireCapability: mocks.guard }))
vi.mock('@/server/queries/inventory', () => ({ getInventory: mocks.inventory, getPendingStockDeficits: mocks.deficits }))
vi.mock('@/components/inventario/inventory-view', () => ({
  InventoryView: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.guard.mockResolvedValue({ member: { role: 'clinic_admin' } })
  mocks.inventory.mockResolvedValue({ items: [], moves: [], suppliers: [] })
})
afterEach(cleanup)

describe('faltantes en Inventario', () => {
  it('muestra el faltante, su fecha local y el enlace a la atención, sin acciones de stock', async () => {
    mocks.deficits.mockResolvedValue([{
      encounterId: 'encounter',
      appointmentId: 'appointment',
      patientName: 'Paciente de prueba',
      itemId: 'supply',
      itemName: 'Resina',
      unit: 'ml',
      quantity: 1.25,
      createdAt: '2026-11-19T01:00:00Z',
    }])
    render(await InventarioPage())
    const section = within(screen.getByRole('region', { name: 'Insumos pendientes de descontar' }))
    expect(section.getByText('Resina')).toBeTruthy()
    expect(section.getByText('1,25 ml')).toBeTruthy()
    expect(section.getByText('18/11/2026 21:00')).toBeTruthy()
    expect(section.getByRole('link', { name: 'Paciente de prueba' }).getAttribute('href')).toBe('/consulta/appointment')
    expect(section.queryByRole('button')).toBeNull()
  })

  it.each(['dentist', 'reception'])('no consulta faltantes para el rol %s', async (role) => {
    mocks.guard.mockResolvedValue({ member: { role } })
    render(await InventarioPage())
    expect(mocks.deficits).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Insumos pendientes de descontar' })).toBeNull()
  })

  it('conserva Inventario visible y muestra un error si no se pudo cargar la lista', async () => {
    mocks.deficits.mockResolvedValue(null)
    render(await InventarioPage())
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('No pudimos cargar los insumos pendientes.')
    expect(screen.queryByText('No hay faltantes pendientes.')).toBeNull()
  })
})
