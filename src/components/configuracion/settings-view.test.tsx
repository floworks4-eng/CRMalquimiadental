// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SettingsView } from './settings-view'
import type { SettingsData } from '@/server/queries/settings'

const actions = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateClinic: vi.fn(),
  setMemberPassword: vi.fn(),
  saveTreatment: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }))
vi.mock('@/server/actions/settings', () => ({
  updateClinic: actions.updateClinic,
  saveTreatment: actions.saveTreatment,
  saveHours: vi.fn(), saveCabinet: vi.fn(), addHoliday: vi.fn(), removeHoliday: vi.fn(),
  saveCategory: vi.fn(), saveRecipe: vi.fn(), saveSchedule: vi.fn(), updateMember: vi.fn(),
}))
vi.mock('@/server/actions/members', () => ({
  setMemberPassword: actions.setMemberPassword, createMember: vi.fn(),
}))

const data: SettingsData = {
  clinic: { name: 'Clínica sintética', legalName: '', nit: '', phone: '', whatsappNumber: '', address: '' },
  hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, closed: false, opens: '08:30', closes: '18:00' })),
  holidays: [], cabinets: [], categories: [], supplies: [],
  treatments: [{ id: 't1', code: 'T1', name: 'Consulta', categoryId: null, durationMin: 30, priceCents: 12500, requiresTooth: false, active: true, recipe: [] }],
  members: [{ id: 'm1', userId: 'u1', fullName: 'Profesional sintético', email: 'synthetic@example.com', role: 'dentist', title: null, active: true, schedule: [] }],
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.updateClinic.mockResolvedValue({ ok: true })
  actions.setMemberPassword.mockResolvedValue({ ok: true })
  actions.saveTreatment.mockResolvedValue({ ok: true })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

describe('configuración al abrir secciones y diálogos diferidos', () => {
  it('guarda la clínica y reinicia el borrador al volver desde otra pestaña', async () => {
    const { rerender } = render(<SettingsView data={data} tab="clinica" />)
    fireEvent.change(await screen.findByLabelText('Nombre de la clínica'), { target: { value: 'Nombre actualizado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(actions.updateClinic).toHaveBeenCalledWith({ ...data.clinic, name: 'Nombre actualizado' }))
    await screen.findByText('Guardado.')
    expect(actions.refresh).toHaveBeenCalledTimes(1)

    rerender(<SettingsView data={data} tab="horarios" />)
    await screen.findByRole('heading', { name: 'Horario de atención' })
    expect(screen.queryByLabelText('Nombre de la clínica')).toBeNull()
    rerender(<SettingsView data={data} tab="clinica" />)
    expect((await screen.findByLabelText('Nombre de la clínica') as HTMLInputElement).value).toBe(data.clinic.name)
  })

  it('conserva el restablecimiento de contraseñas y limpia el formulario al reabrir', async () => {
    render(<SettingsView data={data} tab="equipo" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Contraseña' }))
    let dialog = await screen.findByRole('dialog', { name: 'Contraseña de Profesional sintético' })
    fireEvent.change(within(dialog).getByLabelText('Contraseña nueva'), { target: { value: 'clave-sintetica-123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(actions.setMemberPassword).toHaveBeenCalledWith({ memberId: 'm1', password: 'clave-sintetica-123' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Listo' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Contraseña' }))
    dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText('Contraseña nueva') as HTMLInputElement).value).toBe('')
    expect(within(dialog).queryByText(/Contraseña cambiada/)).toBeNull()
  })

  it('mantiene los modos nuevo y edición de tratamientos sin reutilizar borradores', async () => {
    render(<SettingsView data={data} tab="tratamientos" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    const editing = await screen.findByRole('dialog', { name: 'Editar tratamiento' })
    expect((within(editing).getByLabelText('Nombre') as HTMLInputElement).value).toBe('Consulta')
    fireEvent.change(within(editing).getByLabelText('Nombre'), { target: { value: 'Borrador' } })
    fireEvent.click(within(editing).getByRole('button', { name: 'Cancelar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo tratamiento' }))
    const creating = await screen.findByRole('dialog', { name: 'Nuevo tratamiento' })
    expect((within(creating).getByLabelText('Nombre') as HTMLInputElement).value).toBe('')
    fireEvent.change(within(creating).getByLabelText('Nombre'), { target: { value: 'Control' } })
    fireEvent.change(within(creating).getByLabelText('Precio (Bs.)'), { target: { value: '50,25' } })
    fireEvent.click(within(creating).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(actions.saveTreatment).toHaveBeenCalledWith({
      id: undefined, name: 'Control', categoryId: '', durationMin: 30, priceCents: 5025, requiresTooth: false, active: true,
    }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
