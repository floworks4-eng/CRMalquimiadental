import type { AppointmentSource, AppointmentStatus } from '@/lib/domain/status'

// DTOs: el navegador solo recibe lo que cada pantalla necesita. Ninguno incluye datos clinicos.
export type PatientStatus = 'new' | 'active' | 'in_treatment' | 'inactive'

export type PatientDirectoryItem = {
  id: string
  fullName: string
  phone: string | null
  birthDate: string | null
  zone: string | null
  status: PatientStatus
  firstSource: AppointmentSource
  primaryDentistName: string | null
  nextAppointmentAt: string | null
}

export type PatientDetail = Omit<PatientDirectoryItem, 'nextAppointmentAt'> & {
  email: string | null
  sex: string | null
  address: string | null
  primaryDentistId: string | null
  campaignName: string | null
  updatedAt: string
  appointments: AppointmentCard[]
}

export type AppointmentCard = {
  id: string
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  source: AppointmentSource
  notes: string | null
  cancellationReason: string | null
  checkedInAt: string | null
  updatedAt: string
  patient: { id: string; fullName: string } | null
  dentist: { id: string; fullName: string }
  cabinet: { id: string; name: string }
  treatment: { id: string; name: string } | null
  campaignName: string | null
}

export type BookingOptions = {
  dentists: { id: string; fullName: string }[]
  treatments: { id: string; name: string; durationMin: number }[]
  campaigns: { id: string; name: string }[]
}

export type DayBoard = BookingOptions & {
  date: string
  cabinets: { id: string; name: string }[]
  /** Horas de atencion del dia ("08:30"-"19:30") o null si la clinica no abre. */
  hours: { opens: string; closes: string } | null
  closedReason: string | null
  appointments: AppointmentCard[]
}

export type Slot = { start: string; end: string; dentistId: string; cabinetId: string }

export type CalendarBoard = DayBoard & { days: import('@/lib/domain/calendar').CalendarDay[] }
