// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ClinicCalendar } from './clinic-calendar'
import { calendarDates, type CalendarDay, type CalendarEvent } from '@/lib/domain/calendar'

const event: CalendarEvent = {
  id: 'appointment',
  date: '2026-11-02',
  start: '09:00',
  duration: 60,
  status: 'confirmed',
  patientName: 'Paciente sintético',
  dentistId: 'doctor',
  dentistName: 'Profesional',
  cabinetId: 'c1',
  treatmentName: 'Consulta',
}
const days: CalendarDay[] = calendarDates('2026-11-02', 'month').map((date) => ({
  date,
  hours: date === '2026-11-04' ? null : { opens: '08:30', closes: '18:00' },
  closedReason: date === '2026-11-04' ? 'Feriado' : null,
}))
const props = () => ({
  cabinets: [{ id: 'c1', name: 'Consultorio 1' }],
  providers: [{ id: 'doctor', fullName: 'Profesional' }],
  daysInfo: days,
  date: '2026-11-02',
  view: 'day' as const,
  appointments: [event],
  dentist: '',
  canCreate: true,
  onDentistChange: vi.fn(),
  onDateChange: vi.fn(),
  onOpenDay: vi.fn(),
  onSelect: vi.fn(),
  onCreate: vi.fn(),
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-01T14:00:00Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('calendario conectado a los contratos del sistema', () => {
  it('abre la cita original sin cambiar su identidad', () => {
    const p = props()
    render(<ClinicCalendar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cita de Paciente sintético a las 09:00, Confirmada' }))
    expect(p.onSelect).toHaveBeenCalledWith(event)
  })
  it('solo ofrece horarios dentro del horario configurado y conserva el consultorio al agendar', () => {
    const p = props()
    render(<ClinicCalendar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fuera de horario el 2 de noviembre a las 08:00, Consultorio 1' }))
    expect(p.onCreate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Agendar el 2 de noviembre a las 08:30, Consultorio 1' }))
    expect(p.onCreate).toHaveBeenCalledWith({ date: '2026-11-02', start: '08:30', cabinetId: 'c1' })
  })
  it('no permite agendar en un feriado', () => {
    const p = props()
    render(<ClinicCalendar {...p} date="2026-11-04" />)
    expect(screen.queryAllByRole('button', { name: /^Agendar el/ })).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Fuera de horario el 4 de noviembre a las 08:30, Consultorio 1' }))
    expect(p.onCreate).not.toHaveBeenCalled()
  })
  it('no habilita la creacion si el permiso esta desactivado', () => {
    const p = props()
    render(<ClinicCalendar {...p} canCreate={false} />)
    const cell = screen.getByRole('button', { name: 'Fuera de horario el 2 de noviembre a las 08:30, Consultorio 1' }) as HTMLButtonElement
    expect(cell.disabled).toBe(true)
    fireEvent.click(cell)
    expect(p.onCreate).not.toHaveBeenCalled()
  })
  it('la rejilla se puede recorrer con el teclado', () => {
    const p = props()
    render(<ClinicCalendar {...p} />)
    const first = screen.getByRole('button', { name: 'Fuera de horario el 2 de noviembre a las 08:00, Consultorio 1' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Agendar el 2 de noviembre a las 08:30, Consultorio 1' }))
  })
  it('el mes conserva los feriados y permite abrir un dia', () => {
    const p = props()
    render(<ClinicCalendar {...p} view="month" />)
    const holiday = screen.getByRole('button', { name: 'Nueva cita el 4 de noviembre de 2026' }) as HTMLButtonElement
    expect(holiday.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Ver día 3 de noviembre de 2026' }))
    expect(p.onOpenDay).toHaveBeenCalledWith('2026-11-03')
  })
})
