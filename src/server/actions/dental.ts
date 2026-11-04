'use server'

import { getConsulta, getConsultaList } from '../queries/clinical'
import { z } from 'zod'

/** Consultas con RLS y control clínico; nunca usa el cliente administrador. */
export async function listDentalAppointments(date: string) {
  if (!z.iso.date().safeParse(date).success) return []
  return getConsultaList(date)
}

export async function loadDentalSession(appointmentId: string) {
  const data = await getConsulta(appointmentId)
  if (!data) return null
  return {
    patient: data.patient,
    encounter: data.encounter,
    findings: data.findings,
    canStart: data.canFinish && ['scheduled', 'confirmed', 'checked_in'].includes(data.appointment.status),
  }
}
