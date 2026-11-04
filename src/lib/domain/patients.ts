import type { PatientStatus } from '@/server/queries/types'

export const PATIENT_STATUS_LABEL: Record<PatientStatus, string> = {
  new: 'Nuevo',
  active: 'Activo',
  in_treatment: 'En tratamiento',
  inactive: 'Inactivo',
}
