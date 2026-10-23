import type { Role } from '@/server/auth/permissions'

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'checked_in' | 'in_progress' | 'completed' | 'no_show' | 'cancelled'
export type AppointmentSource = 'whatsapp' | 'web' | 'campaign' | 'phone' | 'walk_in' | 'referral' | 'historical'

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  checked_in: 'En sala de espera',
  in_progress: 'En atención',
  completed: 'Atendida',
  no_show: 'No asistió',
  cancelled: 'Cancelada',
}
export const SOURCE_LABEL: Record<AppointmentSource, string> = {
  whatsapp: 'WhatsApp', web: 'Web', campaign: 'Campaña', phone: 'Teléfono', walk_in: 'Sin cita', referral: 'Referido', historical: 'Histórico',
}
export const ACTIVE_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed', 'checked_in', 'in_progress']

/**
 * Transiciones que ofrece la UI. Espejo de public.change_appointment_status (supabase/migrations/0010);
 * la prueba supabase/tests/status-parity.test.ts verifica que coinciden. La autoridad es siempre la base de datos.
 * in_progress y completed las manejan start_encounter / finish_encounter (Sprint 4).
 */
export function allowedTransitions(from: AppointmentStatus, role: Role): AppointmentStatus[] {
  const staff = role === 'clinic_admin' || role === 'reception'
  const out: AppointmentStatus[] = []
  if (staff) {
    if (from === 'scheduled') out.push('confirmed')
    if (from === 'scheduled' || from === 'confirmed') out.push('checked_in', 'no_show')
    if (from === 'scheduled' || from === 'confirmed' || from === 'checked_in') out.push('cancelled')
  }
  if ((from === 'cancelled' || from === 'no_show') && role === 'clinic_admin') out.push('scheduled')
  return out
}
export const needsReason = (to: AppointmentStatus) => to === 'cancelled' || to === 'scheduled'
