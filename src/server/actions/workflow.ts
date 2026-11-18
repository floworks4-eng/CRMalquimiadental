'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCapability } from '../auth/guards'
import { fail, ok, type ActionResult } from '../errors'
import { rpcError } from '../errors-rpc'
import { createClient } from '../supabase/server'

const appointment = z.object({ appointmentId: z.uuid() })
const finish = appointment.extend({ idempotencyKey: z.string().min(8).max(100) })

export type FinishCareResult = {
  encounterId: string
  invoiceId: string | null
  totalCents: number
  pendingSupplyCount: number
}

function refreshCare(appointmentId: string, patientId: string) {
  revalidatePath('/inicio')
  revalidatePath('/agenda')
  revalidatePath('/consulta')
  revalidatePath('/recepcion')
  revalidatePath(`/consulta/${appointmentId}`)
  revalidatePath(`/pacientes/${patientId}`)
}

export async function startCare(input: { appointmentId: string }): Promise<ActionResult<{ encounterId: string }>> {
  const parsed = appointment.safeParse(input)
  if (!parsed.success) return fail('VALIDATION', 'Cita no válida.')
  await requireCapability('encounters.write')
  const { data, error } = await (await createClient()).rpc('start_care', { p_appointment: parsed.data.appointmentId })
  if (error) return rpcError(error.message, error.code)
  const { encounterId, patientId } = data as { encounterId: string; patientId: string }
  refreshCare(parsed.data.appointmentId, patientId)
  return ok({ encounterId })
}

export async function finishCare(input: { appointmentId: string; idempotencyKey: string }): Promise<ActionResult<FinishCareResult>> {
  const parsed = finish.safeParse(input)
  if (!parsed.success) return fail('VALIDATION', 'Revisa la cita y la clave de cierre.')
  const session = await requireCapability('encounters.finish')
  const db = await createClient()
  const { appointmentId, idempotencyKey } = parsed.data
  const { data: encounter, error: lookupError } = await db.from('encounters').select('id, patient_id')
    .eq('clinic_id', session.member.clinicId).eq('appointment_id', appointmentId).maybeSingle()
  if (lookupError) return rpcError(lookupError.message, lookupError.code)
  if (!encounter) return fail('NOT_FOUND', 'No encontramos una atención para esta cita.')

  const { data, error } = await db.rpc('finish_care', { p_encounter: encounter.id, p_idempotency_key: idempotencyKey })
  if (error?.message === 'EVALUATION_NOTE_REQUIRED') {
    return fail('VALIDATION', 'Guarda una nota de evaluación o agrega el tratamiento realizado para finalizar.')
  }
  if (error) return rpcError(error.message, error.code, error.details)
  refreshCare(appointmentId, encounter.patient_id)
  revalidatePath('/inventario')
  revalidatePath('/caja')
  return ok(data as FinishCareResult)
}
