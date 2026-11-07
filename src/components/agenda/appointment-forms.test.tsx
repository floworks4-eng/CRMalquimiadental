// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { AppointmentCard } from '@/server/queries/types'

const mocks = vi.hoisted(() => ({ slots: vi.fn(), create: vi.fn(), reschedule: vi.fn(), status: vi.fn() }))
vi.mock('@/server/actions/agenda', () => ({ getSlots: mocks.slots, createAppointment: mocks.create, rescheduleAppointment: mocks.reschedule, changeAppointmentStatus: mocks.status }))
vi.mock('@/server/actions/patients', () => ({ createQuickPatient: vi.fn(), listRecentPatientPicker: vi.fn(), searchPatientPicker: vi.fn() }))
vi.mock('../ui', async () => ({
  ...await vi.importActual('../ui'),
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
}))
import { AppointmentDialog } from './appointment-dialog'
import { AppointmentPanel } from './appointment-panel'

const slot = { start: '2040-11-03T14:00:00Z', end: '2040-11-03T14:30:00Z', dentistId: 'doctor', cabinetId: 'cabinet' }
const appointment: AppointmentCard = {
  id: 'appointment', startsAt: slot.start, endsAt: slot.end, status: 'confirmed', source: 'phone', notes: null,
  cancellationReason: null, checkedInAt: null, updatedAt: slot.start, patient: { id: 'patient', fullName: 'Persona sintética' },
  dentist: { id: 'doctor', fullName: 'Profesional' }, cabinet: { id: 'cabinet', name: 'Consultorio' },
  treatment: { id: 'treatment', name: 'Consulta' }, campaignName: null,
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.slots.mockResolvedValue({ ok: true, data: [slot] })
})
afterEach(cleanup)

function booking() {
  render(<AppointmentDialog open onClose={vi.fn()} onCreated={vi.fn()}
    preset={{ patient: appointment.patient!, date: '2040-11-03', startsAt: slot.start }}
    options={{ dentists: [appointment.dentist], treatments: [{ id: 'treatment', name: 'Consulta', durationMin: 30 }], campaigns: [] }} />)
}
function panel() {
  render(<AppointmentPanel appointment={appointment} role="clinic_admin" onClose={vi.fn()} onChanged={vi.fn()} />)
}

describe('formularios de citas: recuperación y selección vigente', () => {
  it('un rechazo al cargar horarios termina la espera y muestra el error', async () => {
    mocks.slots.mockRejectedValueOnce(new Error('network'))
    booking()
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar los horarios')
    expect(screen.queryByText('Buscando horarios…')).toBeNull()
  })

  it('un rechazo al confirmar libera Guardando y conserva el aviso de revisar la agenda', async () => {
    mocks.create.mockRejectedValueOnce(new Error('network'))
    booking()
    await screen.findByRole('button', { name: /10:00/ })
    await waitFor(() => expect(screen.getByRole('button', { name: /10:00/ }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cita' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Revisa la agenda')
    expect((screen.getByRole('button', { name: 'Confirmar cita' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('cambiar la fecha al reprogramar invalida la selección del día anterior', async () => {
    panel()
    fireEvent.click(screen.getByRole('button', { name: 'Reprogramar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver horarios' }))
    fireEvent.click(await screen.findByRole('button', { name: '10:00' }))
    expect((screen.getByRole('button', { name: 'Guardar cambio' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('Nueva fecha'), { target: { value: '2040-11-04' } })
    expect((screen.getByRole('button', { name: 'Guardar cambio' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }))
    expect(mocks.reschedule).not.toHaveBeenCalled()
  })

  it('un rechazo al cambiar el estado no deja las acciones bloqueadas', async () => {
    mocks.status.mockRejectedValueOnce(new Error('network'))
    panel()
    fireEvent.click(screen.getByRole('button', { name: 'Llegó (check-in)' }))
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos actualizar la cita')
    expect((screen.getByRole('button', { name: 'Llegó (check-in)' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('un rechazo al reprogramar libera el botón y muestra un aviso sin perder la selección', async () => {
    mocks.reschedule.mockRejectedValueOnce(new Error('network'))
    panel()
    fireEvent.click(screen.getByRole('button', { name: 'Reprogramar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver horarios' }))
    fireEvent.click(await screen.findByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }))
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos reprogramar')
    expect((screen.getByRole('button', { name: 'Guardar cambio' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
