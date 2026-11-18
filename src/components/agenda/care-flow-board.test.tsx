// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppointmentCard } from '@/server/queries/types'
import { ActiveCareQueue, CareFlowBoard } from './care-flow-board'

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn() },
  arrival: vi.fn(),
  start: vi.fn(),
  finish: vi.fn(),
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  useRouter: () => mocks.router,
}))
vi.mock('@/server/actions/agenda', () => ({ changeAppointmentStatus: mocks.arrival }))
vi.mock('@/server/actions/workflow', () => ({ startCare: mocks.start, finishCare: mocks.finish }))

const appointment: AppointmentCard = {
  id: 'appointment',
  status: 'scheduled',
  startsAt: '2026-11-18T14:00:00Z',
  endsAt: '2026-11-18T14:30:00Z',
  updatedAt: '2026-11-18T13:20:00Z',
  checkedInAt: null,
  source: 'phone',
  notes: null,
  cancellationReason: null,
  campaignName: null,
  patient: { id: 'patient', fullName: 'María Flores' },
  dentist: { id: 'dentist', fullName: 'Dra. Arce' },
  cabinet: { id: 'cabinet', name: 'Consultorio 1' },
  treatment: null,
}
const journalChanged = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  window.addEventListener('alquimia:journal-changed', journalChanged)
})
afterEach(() => {
  cleanup()
  window.removeEventListener('alquimia:journal-changed', journalChanged)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('flujo de atención', () => {
  it('envía el check-in con la versión de la cita y conserva Por llegar si el servidor rechaza el cambio', async () => {
    mocks.arrival.mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: 'La cita cambió.' } })
    render(<CareFlowBoard role="reception" appointments={[appointment]} />)

    const coming = within(screen.getByRole('region', { name: 'Por llegar' }))
    const receive = coming.getByRole<HTMLButtonElement>('button', { name: /Registrar llegada/ })
    fireEvent.click(receive)

    expect(mocks.arrival).toHaveBeenCalledWith({ id: appointment.id, to: 'checked_in', expectedUpdatedAt: appointment.updatedAt })
    expect((await coming.findByRole('alert')).textContent).toBe('La cita cambió.')
    await waitFor(() => expect(receive.disabled).toBe(false))
    expect(coming.getByRole('article', { name: 'María Flores' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'En espera' })).queryByRole('article')).toBeNull()
    expect(mocks.router.refresh).not.toHaveBeenCalled()
  })

  it('registra la llegada sin volver a consultar el historial clínico', async () => {
    mocks.arrival.mockResolvedValue({ ok: true })
    render(<CareFlowBoard role="reception" appointments={[appointment]} />)
    fireEvent.click(screen.getByRole('button', { name: /Registrar llegada/ }))
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalledOnce())
    expect(journalChanged).not.toHaveBeenCalled()
  })

  it('muestra las citas del odontólogo por orden de llegada y solo avanza al recibir datos del servidor', async () => {
    mocks.start.mockResolvedValue({ ok: true, data: { encounterId: 'encounter' } })
    const waiting: AppointmentCard = { ...appointment, status: 'checked_in', checkedInAt: '2026-11-18T14:00:00Z' }
    const earlier = {
      ...waiting,
      id: 'earlier',
      startsAt: '2026-11-18T14:30:00Z',
      checkedInAt: '2026-11-18T13:50:00Z',
      patient: { id: 'other-patient', fullName: 'Sofía Pérez' },
    }
    const otherDentist = { ...waiting, id: 'another', dentist: { id: 'another-doctor', fullName: 'Dr. Vargas' } }
    const { rerender } = render(
      <CareFlowBoard role="dentist" userId="dentist" appointments={[waiting, earlier, otherDentist, appointment]} />,
    )

    const queue = within(screen.getByRole('region', { name: 'En espera' }))
    expect(queue.getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Sofía Pérez', 'María Flores'])
    expect(screen.queryByText(/Dr. Vargas/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Registrar llegada/ })).toBeNull()
    fireEvent.click(queue.getByRole('button', { name: /Iniciar atención · María/ }))
    expect(mocks.start).toHaveBeenCalledWith({ appointmentId: waiting.id })
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalledOnce())
    expect(journalChanged).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ detail: { patientId: 'patient' } }))
    expect(queue.getByRole('article', { name: 'María Flores' })).toBeTruthy()

    rerender(<CareFlowBoard role="dentist" userId="dentist" appointments={[{ ...waiting, status: 'in_progress' }, earlier]} />)
    const inConsultation = within(screen.getByRole('region', { name: 'En consulta' }))
    expect(inConsultation.getByRole('link', { name: 'Abrir consulta' }).getAttribute('href')).toBe('/consulta/appointment')
    expect(inConsultation.getByRole('button', { name: /Finalizar atención/ })).toBeTruthy()
  })

  it('deja a recepción ver la espera y la consulta sin acciones clínicas', () => {
    render(
      <CareFlowBoard role="reception" appointments={[
        { ...appointment, status: 'checked_in' },
        { ...appointment, id: 'current', status: 'in_progress' },
      ]} />,
    )
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Abrir consulta' })).toBeNull()
  })

  it('pide confirmación, permite volver y reutiliza la clave si falla la red al cerrar', async () => {
    mocks.finish.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      ok: true,
      data: { encounterId: 'encounter', invoiceId: 'invoice', totalCents: 15000, pendingSupplyCount: 1 },
    })
    const current: AppointmentCard = { ...appointment, status: 'in_progress' }
    const { rerender } = render(<ActiveCareQueue role="clinic_admin" appointments={[current]} onPatientPage />)

    const finish = screen.getByRole('button', { name: /Finalizar atención/ })
    fireEvent.click(finish)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Volver' }))
    expect(mocks.finish).not.toHaveBeenCalled()

    fireEvent.click(finish)
    const dialog = within(screen.getByRole('dialog', { name: 'Finalizar atención' }))
    const confirm = dialog.getByRole<HTMLButtonElement>('button', { name: 'Confirmar cierre' })
    fireEvent.click(confirm)
    expect((await dialog.findByRole('alert')).textContent).toMatch(/Revisa tu conexión/)
    await waitFor(() => expect(confirm.disabled).toBe(false))
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    expect(journalChanged).not.toHaveBeenCalled()
    expect(screen.getByRole('article')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Ver factura' })).toBeNull()

    fireEvent.click(confirm)
    await screen.findByRole('link', { name: 'Ver factura' })
    expect(mocks.finish).toHaveBeenCalledTimes(2)
    const firstInput = mocks.finish.mock.calls[0][0]
    expect(firstInput).toEqual({ appointmentId: current.id, idempotencyKey: expect.any(String) })
    expect(mocks.finish.mock.calls[1][0]).toEqual(firstInput)
    expect(mocks.router.refresh).toHaveBeenCalledOnce()
    expect(journalChanged).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ detail: { patientId: 'patient' } }))

    rerender(<ActiveCareQueue role="clinic_admin" appointments={[]} onPatientPage />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Insumos pendientes: 1.')
    expect(screen.getByRole('link', { name: 'Ver factura' }).getAttribute('href')).toBe('/consulta/appointment')
  })

  it('actualiza la atención activa cada diez segundos solo mientras la pestaña está visible', () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { rerender } = render(
      <ActiveCareQueue role="dentist" appointments={[{ ...appointment, status: 'checked_in' }]} userId="dentist" onPatientPage />,
    )

    act(() => vi.advanceTimersByTime(10_000))
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    act(() => vi.advanceTimersByTime(9_999))
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(mocks.router.refresh).toHaveBeenCalledOnce()
    rerender(<ActiveCareQueue role="dentist" appointments={[]} userId="dentist" onPatientPage />)
    act(() => vi.advanceTimersByTime(10_000))
    expect(mocks.router.refresh).toHaveBeenCalledOnce()
  })
})
