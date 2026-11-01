import { addDays, formatTime, localDate } from './time'
import type { AppointmentStatus } from './status'
import type { AppointmentCard } from '@/server/queries/types'

export type CalendarView = 'day' | 'week' | 'month'
export type AgendaView = CalendarView | 'list'
export type CalendarDay = { date: string; hours: { opens: string; closes: string } | null; closedReason: string | null }
export type CalendarEvent = {
  id: string
  date: string
  start: string
  duration: number
  status: AppointmentStatus
  patientName: string
  dentistId: string
  dentistName: string
  cabinetId: string
  treatmentName: string
}
export type CalendarCreateSlot = { date: string; start?: string; cabinetId?: string }
export const minuteOfTime = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
export const calendarDateObject = (date: string) => new Date(date + 'T12:00:00Z')
export const calendarDateLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-BO', { ...options, timeZone: 'UTC' }).format(calendarDateObject(date))
export function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const value = calendarDateObject(date)
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date
}
export const startOfWeek = (date: string) => addDays(date, -((calendarDateObject(date).getUTCDay() + 6) % 7))
export function moveMonth(date: string, amount: number) {
  const d = calendarDateObject(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + amount)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}
export function monthDates(date: string) {
  const firstCell = startOfWeek(date.slice(0, 7) + '-01')
  return Array.from({ length: 42 }, (_, i) => addDays(firstCell, i))
}
export function calendarDates(date: string, view: AgendaView) {
  if (view === 'month') return monthDates(date)
  if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i))
  return [date]
}
export function toCalendarEvent(a: AppointmentCard): CalendarEvent {
  return {
    id: a.id,
    date: localDate(a.startsAt),
    start: formatTime(a.startsAt),
    duration: (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000,
    status: a.status,
    patientName: a.patient?.fullName ?? 'Paciente',
    dentistId: a.dentist.id,
    dentistName: a.dentist.fullName,
    cabinetId: a.cabinet.id,
    treatmentName: a.treatment?.name ?? 'Sin tratamiento',
  }
}

/** Separates simultaneous appointments into lanes; touching end/start times do not overlap. */
export function eventLanes(appointments: CalendarEvent[]) {
  const result = new Map<string, { lane: number; lanes: number }>()
  const sorted = [...appointments].sort((a, b) => minuteOfTime(a.start) - minuteOfTime(b.start) || b.duration - a.duration)
  let group: CalendarEvent[] = []
  let end = 0
  const flush = () => {
    const laneEnds: number[] = []
    const placed = group.map((a) => {
      let lane = laneEnds.findIndex((value) => value <= minuteOfTime(a.start))
      if (lane < 0) lane = laneEnds.length
      laneEnds[lane] = minuteOfTime(a.start) + a.duration
      return { id: a.id, lane }
    })
    placed.forEach((a) => result.set(a.id, { lane: a.lane, lanes: laneEnds.length }))
    group = []
  }
  for (const a of sorted) {
    const start = minuteOfTime(a.start)
    if (group.length && start >= end) flush()
    if (!group.length) end = start + a.duration
    else end = Math.max(end, start + a.duration)
    group.push(a)
  }
  flush()
  return result
}
