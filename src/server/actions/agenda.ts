'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '../supabase/server'
import { requireCapability, requireMember } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { rpcError } from '../errors-rpc'
import { createAppointmentSchema, rescheduleSchema, slotsSchema, statusSchema } from '../schemas/agenda'
import { addDays, localDate } from '@/lib/domain/time'
import type { Slot } from '../queries/types'

type Supabase = Awaited<ReturnType<typeof createClient>>
type SlotRow = { slot_start: string; slot_end: string; slot_dentist: string; slot_cabinet: string }
const toSlot = (r: SlotRow): Slot => ({ start: r.slot_start, end: r.slot_end, dentistId: r.slot_dentist, cabinetId: r.slot_cabinet })

async function fetchSlots(supabase: Supabase, clinicId: string, treatmentId: string, from: string, to: string, dentistId?: string | null) {
  const { data, error } = await supabase.rpc('available_slots', { p_clinic: clinicId, p_treatment: treatmentId, p_from: from, p_to: to, p_dentist: dentistId ?? null, p_step: 30 })
  return { slots: ((data ?? []) as SlotRow[]).map(toSlot), error }
}

export async function getSlots(input: unknown): Promise<ActionResult<Slot[]>> {
  const p = slotsSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const s = await requireCapability('agenda.manage')
  const { slots, error } = await fetchSlots(await createClient(), s.member.clinicId, p.data.treatmentId, p.data.from, p.data.to, p.data.dentistId)
  if (error) return rpcError(error.message, error.code)
  return ok(slots.slice(0, 300))
}

/** Los 3 horarios libres mas cercanos al pedido (mismo odontologo; si no hay, cualquiera). */
async function nearestSlots(supabase: Supabase, clinicId: string, treatmentId: string, dentistId: string, startsAt: string) {
  const day = localDate(startsAt)
  const target = new Date(startsAt).getTime()
  for (const who of [dentistId, null]) {
    const { slots } = await fetchSlots(supabase, clinicId, treatmentId, day, addDays(day, 1), who)
    if (slots.length) return slots.sort((a, b) => Math.abs(new Date(a.start).getTime() - target) - Math.abs(new Date(b.start).getTime() - target)).slice(0, 3)
  }
  return []
}

export async function createAppointment(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = createAppointmentSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const s = await requireCapability('agenda.manage')
  const supabase = await createClient()
  const d = p.data
  const { data, error } = await supabase.rpc('create_appointment', {
    p_patient: d.patientId, p_dentist: d.dentistId, p_cabinet: d.cabinetId, p_treatment: d.treatmentId, p_starts_at: d.startsAt,
    p_source: d.source, p_campaign: d.campaignId ?? null, p_notes: d.notes ?? null,
  })
  if (error) {
    const r = rpcError(error.message, error.code)
    if (!r.ok && r.error.code === 'SLOT_TAKEN') return fail('SLOT_TAKEN', r.error.message, undefined, await nearestSlots(supabase, s.member.clinicId, d.treatmentId, d.dentistId, d.startsAt))
    return r
  }
  revalidatePath('/agenda')
  return ok({ id: data as string })
}

export async function rescheduleAppointment(input: unknown): Promise<ActionResult> {
  const p = rescheduleSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  await requireCapability('agenda.manage')
  const { error } = await (await createClient()).rpc('reschedule_appointment', {
    p_id: p.data.id, p_starts_at: p.data.startsAt, p_cabinet: p.data.cabinetId ?? null, p_dentist: p.data.dentistId ?? null, p_expected_updated_at: p.data.expectedUpdatedAt,
  })
  if (error) return rpcError(error.message, error.code)
  revalidatePath('/agenda')
  return ok(undefined)
}

export async function changeAppointmentStatus(input: unknown): Promise<ActionResult> {
  const p = statusSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  await requireCapability('agenda.read_all') // el rol decide la transicion dentro de la base de datos
  const { error } = await (await createClient()).rpc('change_appointment_status', {
    p_id: p.data.id, p_to: p.data.to, p_reason: p.data.reason ?? null, p_expected_updated_at: p.data.expectedUpdatedAt,
  })
  if (error) {
    const r = rpcError(error.message, error.code)
    return !r.ok && error.message === 'REASON_REQUIRED' ? fail('VALIDATION', r.error.message, { reason: r.error.message }) : r
  }
  revalidatePath('/agenda')
  revalidatePath('/recepcion')
  return ok(undefined)
}

export type NotificationItem = { id: string; kind: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string }

export async function listNotifications(): Promise<NotificationItem[]> {
  await requireMember()
  const { data } = await (await createClient()).from('notifications').select('id, kind, title, body, href, read_at, created_at').order('created_at', { ascending: false }).limit(20)
  return ((data ?? []) as { id: string; kind: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string }[]).map((n) => ({
    id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, readAt: n.read_at, createdAt: n.created_at,
  }))
}

export async function markNotificationsRead() {
  const s = await requireMember()
  await (await createClient()).from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', s.userId).is('read_at', null)
}
