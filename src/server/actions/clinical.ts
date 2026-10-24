'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { rpcError } from '../errors-rpc'
import {
  addendumSchema, anamnesisSchema, encounterNotesSchema, findingSchema, finishSchema, planItemSchema, planStatusSchema,
} from '../schemas/operations'
import { z } from 'zod'

// Consulta: el odontologo de la cita o el admin. RLS (can_read_clinical) y las RPC lo vuelven a exigir.
const refresh = (appointmentId?: string, patientId?: string) => {
  if (appointmentId) revalidatePath(`/consulta/${appointmentId}`)
  if (patientId) revalidatePath(`/pacientes/${patientId}`)
  revalidatePath('/consulta')
}

export async function startEncounter(appointmentId: string): Promise<ActionResult<{ encounterId: string }>> {
  if (!z.uuid().safeParse(appointmentId).success) return fail('VALIDATION', 'Cita no válida.')
  await requireCapability('encounters.write')
  const { data, error } = await (await createClient()).rpc('start_encounter', { p_appointment: appointmentId })
  if (error) return rpcError(error.message, error.code)
  refresh(appointmentId)
  revalidatePath('/agenda')
  revalidatePath('/recepcion')
  return ok({ encounterId: data as string })
}

export async function saveEncounterNotes(input: unknown): Promise<ActionResult> {
  const p = encounterNotesSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  await requireCapability('encounters.write')
  const { data, error } = await (await createClient())
    .from('encounters').update({ chief_complaint: p.data.chiefComplaint ?? null, notes: p.data.notes ?? null })
    .eq('id', p.data.encounterId).eq('status', 'in_progress').select('appointment_id')
  if (error || !data?.length) return fail('IMMUTABLE', 'Esta atención ya no se puede editar.')
  refresh(data[0].appointment_id as string)
  return ok(undefined)
}

export async function addFinding(input: unknown): Promise<ActionResult> {
  const p = findingSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el hallazgo.', fieldErrors(p.error.issues))
  const s = await requireCapability('encounters.write')
  const d = p.data
  const supabase = await createClient()
  // Un hallazgo por pieza y atención: si ya había uno hoy, se reemplaza.
  await supabase.from('tooth_findings').delete().eq('encounter_id', d.encounterId).eq('tooth_fdi', d.tooth)
  const { error } = await supabase.from('tooth_findings').insert({
    patient_id: d.patientId, encounter_id: d.encounterId, tooth_fdi: d.tooth, condition: d.condition, surfaces: d.surfaces,
    notes: d.notes ?? null, recorded_by: s.userId, clinic_id: s.member.clinicId,
  })
  if (error) return fail('IMMUTABLE', 'No se pudo guardar: la atención ya no está en curso.')
  refresh(undefined, d.patientId)
  return ok(undefined)
}

export async function removeFinding(input: unknown): Promise<ActionResult> {
  const p = z.object({ encounterId: z.uuid(), tooth: z.number().int() }).safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Datos no válidos.')
  await requireCapability('encounters.write')
  const { error } = await (await createClient()).from('tooth_findings').delete().eq('encounter_id', p.data.encounterId).eq('tooth_fdi', p.data.tooth)
  if (error) return fail('IMMUTABLE', 'No se pudo quitar el hallazgo.')
  return ok(undefined)
}

export async function addPlanItem(input: unknown): Promise<ActionResult> {
  const p = planItemSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el tratamiento.', fieldErrors(p.error.issues))
  const s = await requireCapability('encounters.write')
  const d = p.data
  const supabase = await createClient()
  const { data: t } = await supabase.from('treatments').select('requires_tooth').eq('id', d.treatmentId).maybeSingle()
  if (t?.requires_tooth && !d.tooth) return fail('VALIDATION', 'Este tratamiento necesita una pieza: elígela en el odontograma.', { tooth: 'Elige la pieza.' })
  // price_cents lo reemplaza la base de datos con la tarifa vigente (trigger plan_items_zz_price).
  const { error } = await supabase.from('treatment_plan_items').insert({
    clinic_id: s.member.clinicId, patient_id: d.patientId, encounter_id: d.encounterId ?? null, treatment_id: d.treatmentId,
    tooth_fdi: d.tooth ?? null, surfaces: d.surfaces, status: d.today ? 'in_progress' : 'planned', price_cents: 0, created_by: s.userId,
  })
  if (error) return fail('FORBIDDEN', 'No se pudo agregar al plan.')
  refresh(undefined, d.patientId)
  return ok(undefined)
}

export async function setPlanItemToday(input: unknown): Promise<ActionResult> {
  const p = planStatusSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Datos no válidos.')
  await requireCapability('encounters.write')
  const { data, error } = await (await createClient())
    .from('treatment_plan_items').update({ status: p.data.today ? 'in_progress' : 'planned' })
    .eq('id', p.data.id).in('status', ['planned', 'accepted', 'in_progress']).select('id')
  if (error || !data?.length) return fail('IMMUTABLE', 'Este ítem ya no se puede cambiar.')
  return ok(undefined)
}

export async function removePlanItem(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail('VALIDATION', 'Datos no válidos.')
  await requireCapability('encounters.write')
  const { data, error } = await (await createClient()).from('treatment_plan_items').delete().eq('id', id).select('id')
  if (error || !data?.length) return fail('IMMUTABLE', 'Este ítem ya no se puede quitar (ya fue realizado).')
  return ok(undefined)
}

export type FinishResult = { invoiceId: string; number: string; totalCents: number; paidCents: number; balanceCents: number }
export type Shortage = { item: string; unit: string; need: number; available: number }

/** Cierre atomico (factura, pago, stock, cita). Si faltan insumos devuelve STOCK_SHORTAGE con la lista. */
export async function finishEncounter(input: unknown): Promise<ActionResult<FinishResult>> {
  const p = finishSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos del cobro.', fieldErrors(p.error.issues))
  await requireCapability('encounters.finish')
  const d = p.data
  if (d.amountCents > 0 && !d.method) return fail('VALIDATION', 'Elige el método de pago.', { method: 'Elige el método de pago.' })
  const { data, error } = await (await createClient()).rpc('finish_encounter', {
    p_encounter: d.encounterId, p_idempotency_key: d.idempotencyKey, p_payment_method: d.amountCents > 0 ? d.method : null,
    p_payment_amount_cents: d.amountCents, p_discount_cents: d.discountCents, p_discount_reason: d.discountReason ?? null, p_reference: d.reference ?? null,
  })
  if (error) {
    if (error.message === 'STOCK_SHORTAGE') {
      let list: Shortage[] = []
      try {
        list = (JSON.parse(error.details ?? '[]') as Shortage[]).map((x) => ({ ...x, need: Number(x.need), available: Number(x.available) }))
      } catch {}
      return fail('STOCK_SHORTAGE', 'No alcanzan los insumos para lo de hoy.', undefined, list)
    }
    return rpcError(error.message, error.code, error.details)
  }
  const r = data as { invoice_id: string; number: string; total_cents: number; paid_cents: number; balance_cents: number }
  revalidatePath('/consulta')
  revalidatePath('/caja')
  revalidatePath('/inventario')
  revalidatePath('/agenda')
  return ok({ invoiceId: r.invoice_id, number: r.number, totalCents: r.total_cents, paidCents: r.paid_cents, balanceCents: r.balance_cents })
}

export async function addAddendum(input: unknown): Promise<ActionResult> {
  const p = addendumSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa la addenda.', fieldErrors(p.error.issues))
  const s = await requireCapability('encounters.write')
  const { error } = await (await createClient()).from('encounter_addenda').insert({
    patient_id: p.data.patientId, encounter_id: p.data.encounterId, reason: p.data.reason, notes: p.data.notes, created_by: s.userId,
  })
  if (error) return fail('FORBIDDEN', 'No se pudo guardar la addenda.')
  refresh(undefined, p.data.patientId)
  return ok(undefined)
}

const list = (v?: string) => (v ? v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 20) : [])

/** Nueva version de anamnesis cargada por el equipo (no se edita la anterior: queda el historial). */
export async function saveAnamnesis(input: unknown): Promise<ActionResult> {
  const p = anamnesisSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const s = await requireCapability('patients.read_clinical')
  const d = p.data
  const allergies = list(d.allergies)
  const conditions = list(d.conditions)
  const { error } = await (await createClient()).from('anamnesis_versions').insert({
    clinic_id: s.member.clinicId, patient_id: d.patientId,
    allergies: allergies.length ? allergies : ['Ninguna'], conditions: conditions.length ? conditions : ['Ninguno'],
    medications: d.medications ?? null, reason: d.reason ?? null, emergency_contact_name: d.emergencyContactName ?? null,
    emergency_contact_phone: d.emergencyContactPhone ?? null, pregnancy: d.pregnancy, anticoagulants: d.anticoagulants,
    notes: d.notes ?? null, source: 'staff', submitted_by: s.userId,
  })
  if (error) return fail('FORBIDDEN', 'No se pudo guardar la anamnesis.')
  refresh(undefined, d.patientId)
  return ok(undefined)
}
