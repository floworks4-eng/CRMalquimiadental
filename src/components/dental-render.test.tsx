// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DentalRender } from './dental-render'

const runtime = vi.hoisted(() => ({
  create: vi.fn(),
  api: { update: vi.fn(), dispose: vi.fn(), view: vi.fn(), zoom: vi.fn() },
}))
vi.mock('@/lib/dental-scene', () => ({ createDentalScene: runtime.create }))
beforeEach(() => {
  vi.clearAllMocks()
  runtime.create.mockImplementation((_host, _state, events) => {
    events.onReady()
    return runtime.api
  })
})
afterEach(cleanup)

const marks = { 16: { condition: 'caries' as const, today: true } }
const ready = () => waitFor(() => expect((screen.getByRole('button', { name: 'Girar' }) as HTMLButtonElement).disabled).toBe(false))

describe('Vista dental para explicar al paciente', () => {
  it('prepara raíces o nervios y vasos con un toque, y restablece la selección al empezar de nuevo', async () => {
    const onSelect = vi.fn()
    render(<DentalRender marks={marks} selected={16} onSelect={onSelect} />)
    await ready()
    expect(screen.getByRole('button', { name: 'Dentadura' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByText('Más opciones de anatomía').closest('details') as HTMLDetailsElement).open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Ver raíces' }))
    expect(runtime.api.update.mock.lastCall?.[0].layers).toEqual({ roots: true, bone: false, gums: true, nerves: false, vessels: false })
    fireEvent.click(screen.getByRole('button', { name: 'Nervios y vasos' }))
    expect(runtime.api.update.mock.lastCall?.[0].layers).toMatchObject({ nerves: true, vessels: true, roots: true, bone: false, gums: false })
    expect(screen.getByText(/Amarillo: nervios/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Empezar de nuevo' }))
    expect(onSelect).toHaveBeenCalledWith(undefined)
    expect(screen.getByRole('button', { name: 'Dentadura' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('sincroniza nuevos registros y callbacks sin recrear la escena y libera los recursos al salir', async () => {
    const oldSelect = vi.fn()
    const latestSelect = vi.fn()
    const { rerender, unmount } = render(<DentalRender marks={marks} selected={16} onSelect={oldSelect} />)
    await ready()
    const events = runtime.create.mock.calls[0][2]
    rerender(<DentalRender marks={{ 47: { condition: 'ausente', today: false } }} selected={47} onSelect={latestSelect} />)
    expect(runtime.create).toHaveBeenCalledTimes(1)
    expect(runtime.api.update.mock.lastCall?.[0]).toMatchObject({ selected: 47, marks: { 47: { condition: 'ausente' } } })
    expect(screen.getByText(/Esta pieza está registrada como ausente/)).toBeTruthy()
    act(() => events.onSelect(21))
    expect(latestSelect).toHaveBeenCalledExactlyOnceWith(21)
    expect(oldSelect).not.toHaveBeenCalled()
    unmount()
    expect(runtime.api.dispose).toHaveBeenCalledTimes(1)
  })

  it('mantiene el mapa disponible ante un fallo y permite reintentar la carga', async () => {
    runtime.create.mockImplementationOnce((_host, _state, events) => { events.onError(); return runtime.api })
    const onChooseTooth = vi.fn()
    render(<DentalRender marks={marks} onChooseTooth={onChooseTooth} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Usar mapa dental' }))
    expect(onChooseTooth).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar 3D' }))
    await ready()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(runtime.api.dispose).toHaveBeenCalledTimes(1)
  })

  it('explica qué piezas deben consultarse en el mapa sin inventar anatomía 3D', () => {
    const { rerender } = render(<DentalRender marks={{}} selected={18} />)
    expect(screen.getByText(/Esta muela del juicio se consulta en el mapa/)).toBeTruthy()
    rerender(<DentalRender marks={{}} selected={51} dentition="temporal" />)
    expect(screen.getByText(/Los dientes infantiles se consultan en el mapa/)).toBeTruthy()
  })
})
