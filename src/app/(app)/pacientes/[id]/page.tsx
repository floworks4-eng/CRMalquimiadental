import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { PatientDetailView } from '@/components/patients/patient-detail'
import { AnamnesisCard } from '@/components/patients/anamnesis-card'
import { PatientClinicalView, PatientInvoices } from '@/components/patients/patient-clinical'
import { getPatientDetail } from '@/server/queries/patients'
import { getPatientClinical, getPatientInvoices } from '@/server/queries/clinical'
import { getBookingOptions } from '@/server/queries/agenda'
import { requireCapability } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'
import { ageYears } from '@/lib/domain/clinical'
import type { Role } from '@/server/auth/permissions'
import type { PatientDetail } from '@/server/queries/types'

export const metadata = { title: 'Paciente · Alquimia Dental' }

export default async function PacientePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireCapability('patients.read_directory')
  const { id } = await params
  const [patient, options] = await Promise.all([getPatientDetail(id), getBookingOptions()])
  if (!patient) notFound() // mismo resultado si no existe o si el rol no puede verlo
  const r = s.member.role
  // Lo clinico se arma solo en el servidor y solo para quien puede verlo: a recepcion ni siquiera le llega.
  const clinical =
    can(r, 'patients.read_clinical') || can(r, 'billing.read') ? (
      <Suspense
        fallback={
          <div role="status" aria-busy="true" className="glass p-5 text-sm text-muted">
            Cargando historial del paciente…
          </div>
        }
      >
        <ClinicalSections patient={patient} role={r} />
      </Suspense>
    ) : null
  return (
    <PatientDetailView
      patient={patient}
      options={options}
      canEdit={can(r, 'patients.update_demographics')}
      canBook={can(r, 'agenda.manage')}
      canAssignDentist={r !== 'dentist'}
      clinical={clinical}
    />
  )
}

async function ClinicalSections({ patient, role }: { patient: PatientDetail; role: Role }) {
  const [clinicalData, invoices] = await Promise.all([
    can(role, 'patients.read_clinical') ? getPatientClinical(patient.id) : null,
    can(role, 'billing.read') ? getPatientInvoices(patient.id) : [],
  ])
  return (
    <>
      {clinicalData && <AnamnesisCard patientId={patient.id} anamnesis={clinicalData.anamnesis} />}
      {clinicalData && (
        <PatientClinicalView patientId={patient.id} data={clinicalData} child={!!patient.birthDate && ageYears(patient.birthDate) < 12} />
      )}
      {can(role, 'billing.read') && <PatientInvoices invoices={invoices} canCharge={can(role, 'cash.read')} />}
    </>
  )
}
