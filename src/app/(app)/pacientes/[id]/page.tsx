import { notFound } from 'next/navigation'
import { PatientDetailView } from '@/components/patients/patient-detail'
import { getPatientDetail } from '@/server/queries/patients'
import { getBookingOptions } from '@/server/queries/agenda'
import { requireCapability } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'

export const metadata = { title: 'Paciente · Alquimia Dental' }

export default async function PacientePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireCapability('patients.read_directory')
  const { id } = await params
  const [patient, options] = await Promise.all([getPatientDetail(id), getBookingOptions()])
  if (!patient) notFound() // mismo resultado si no existe o si el rol no puede verlo
  const r = s.member.role
  return (
    <PatientDetailView patient={patient} options={options} canEdit={can(r, 'patients.update_demographics')} canBook={can(r, 'agenda.manage')} canAssignDentist={r !== 'dentist'} />
  )
}
