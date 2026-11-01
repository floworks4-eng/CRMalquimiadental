import { describe, expect, it } from 'vitest'
import {
  calendarDates,
  eventLanes,
  isCalendarDate,
  monthDates,
  moveMonth,
  startOfWeek,
  toCalendarEvent,
  type CalendarEvent,
} from './calendar'
import type { AppointmentCard } from '@/server/queries/types'

const event = (id: string, start: string, duration: number): CalendarEvent => ({
  id,
  start,
  duration,
  date: '2026-11-02',
  status: 'confirmed',
  patientName: 'Persona de prueba',
  dentistId: 'dentist',
  dentistName: 'Profesional',
  cabinetId: 'cabinet',
  treatmentName: 'Consulta',
})

describe('periodos del calendario', () => {
  it('empieza en lunes incluso cuando el dia elegido es domingo', () => {
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26')
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02')
    expect(calendarDates('2026-11-01', 'week')).toHaveLength(7)
    expect(calendarDates('2026-11-01', 'week').at(-1)).toBe('2026-11-01')
  })
  it('el mes incluye dias vecinos en una rejilla de 42 dias sin duplicados', () => {
    const dates = monthDates('2026-11-15')
    expect(dates).toHaveLength(42)
    expect(new Set(dates).size).toBe(42)
    expect(dates[0]).toBe('2026-10-26')
    expect(dates.at(-1)).toBe('2026-12-06')
  })
  it('ajusta el 31 de enero y respeta los anios bisiestos', () => {
    expect(moveMonth('2027-01-31', 1)).toBe('2027-02-28')
    expect(moveMonth('2028-01-31', 1)).toBe('2028-02-29')
    expect(moveMonth('2027-01-31', -1)).toBe('2026-12-31')
  })
  it.each(['2026-02-30', '2026-13-01', 'no-es-una-fecha', '2026-1-01'])('rechaza la fecha invalida %s', (value) =>
    expect(isCalendarDate(value)).toBe(false),
  )
  it('mantiene una sola fecha en las vistas dia y lista', () => {
    expect(calendarDates('2026-11-01', 'day')).toEqual(['2026-11-01'])
    expect(calendarDates('2026-11-01', 'list')).toEqual(['2026-11-01'])
  })
})

describe('citas reales del servidor', () => {
  it('convierte UTC a la fecha de La Paz, incluso al cruzar medianoche', () => {
    const a: AppointmentCard = {
      id: 'appointment',
      startsAt: '2026-11-03T02:30:00Z',
      endsAt: '2026-11-03T03:15:00Z',
      status: 'confirmed',
      source: 'phone',
      notes: null,
      cancellationReason: null,
      checkedInAt: null,
      updatedAt: '2026-11-01T00:00:00Z',
      patient: { id: 'patient', fullName: 'Persona de prueba' },
      dentist: { id: 'dentist', fullName: 'Profesional' },
      cabinet: { id: 'cabinet', name: 'Consultorio' },
      treatment: { id: 'treatment', name: 'Consulta' },
      campaignName: null,
    }
    expect(toCalendarEvent(a)).toMatchObject({
      date: '2026-11-02',
      start: '22:30',
      duration: 45,
      patientName: 'Persona de prueba',
      status: 'confirmed',
    })
  })
  it('separa citas simultaneas y reutiliza columnas cuando termina una cita', () => {
    const lanes = eventLanes([event('a', '09:00', 60), event('b', '09:30', 60), event('c', '10:00', 30), event('d', '11:00', 30)])
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 })
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 })
    expect(lanes.get('c')).toEqual({ lane: 0, lanes: 2 })
    expect(lanes.get('d')).toEqual({ lane: 0, lanes: 1 })
  })
  it('no considera solapadas dos citas consecutivas', () => {
    const lanes = eventLanes([event('a', '09:00', 30), event('b', '09:30', 30)])
    expect(lanes.get('a')?.lanes).toBe(1)
    expect(lanes.get('b')?.lanes).toBe(1)
  })
})
