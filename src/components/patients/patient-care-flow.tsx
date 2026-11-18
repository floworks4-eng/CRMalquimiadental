import { ActiveCareQueue } from '@/components/agenda/care-flow-board'
import type { Role } from '@/server/auth/permissions'
import type { AppointmentCard } from '@/server/queries/types'

export function PatientCareFlow({
  appointments,
  role,
  userId,
}: {
  appointments: AppointmentCard[]
  role: Role
  userId?: string
}) {
  const active = appointments.filter((a) => a.status === 'checked_in' || a.status === 'in_progress')
  return <ActiveCareQueue appointments={active} role={role} userId={userId} onPatientPage />
}
