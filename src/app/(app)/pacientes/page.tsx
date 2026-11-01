import { PatientsView } from '@/components/patients/patients-view'
import { searchPatients } from '@/server/queries/patients'
import { getBookingOptions } from '@/server/queries/agenda'
import { requireCapability } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'
import { SOURCE_LABEL, type AppointmentSource } from '@/lib/domain/status'
import type { PatientStatus } from '@/server/queries/types'

export const metadata = { title: 'Pacientes · Alquimia Dental' }
const STATUSES = ['new', 'active', 'in_treatment', 'inactive']

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; page?: string }>
}) {
  const s = await requireCapability('patients.read_directory')
  const sp = await searchParams
  const [result, options] = await Promise.all([
    searchPatients({
      q: sp.q,
      status: STATUSES.includes(sp.status ?? '') ? (sp.status as PatientStatus) : undefined,
      source: sp.source && sp.source in SOURCE_LABEL ? (sp.source as AppointmentSource) : undefined,
      page: Number(sp.page) || 1,
    }),
    getBookingOptions(),
  ])
  return (
    <PatientsView
      canImport={s.member.role === 'clinic_admin'}
      {...result}
      options={options}
      canAssignDentist={s.member.role !== 'dentist' && can(s.member.role, 'patients.create')}
    />
  )
}
