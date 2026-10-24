'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import {
  cabinetSchema, categorySchema, clinicSchema, holidaySchema, hoursSchema, memberSchema, recipeSchema, scheduleSchema, treatmentSchema,
} from '../schemas/operations'

// Configuracion de la clinica: solo el administrador (RLS: is_admin). Cada cambio queda auditado por trigger.
const done = () => {
  revalidatePath('/configuracion')
  revalidatePath('/agenda')
}
const admin = () => requireCapability('settings.manage')
const invalid = (issues: z.core.$ZodIssue[]) => fail('VALIDATION', issues[0]?.message ?? 'Revisa los datos.', fieldErrors(issues))

export async function updateClinic(input: unknown): Promise<ActionResult> {
  const p = clinicSchema.safeParse(input)
  if (!p.success) return invalid(p.error.issues)
  const s = await admin()
  const d = p.data
  const { error } = await (await createClient()).from('clinics').update({
    name: d.name, legal_name: d.legalName ?? null, nit: d.nit ?? null, phone: d.phone ?? null, whatsapp_number: d.whatsappNumber ?? null, address: d.address ?? null,
  }).eq('id', s.member.clinicId)
  if (error) return fail('INTERNAL', 'No se pudo guardar.')
  revalidatePath('/', 'layout')
  return ok(undefined)
}

export async function saveHours(input: unknown): Promise<ActionResult> {
  const p = hoursSchema.safeParse(input)
  if (!p.success) return invalid(p.error.issues)
  const s = await admin()
  const rows = p.data.days.map((d) => ({
    clinic_id: s.member.clinicId, weekday: d.weekday, is_closed: d.closed, opens_at: d.closed ? null : d.opens, closes_at: d.closed ? null : d.closes,
  }))
  const { error } = await (await createClient()).from('clinic_hours').upsert(rows, { onConflict: 'clinic_id,weekday' })
  if (error) return fail('INTERNAL', 'No se pudo guardar el horario.')
  done()
  return ok(undefined)
}

export async function addHoliday(input: unknown): Promise<ActionResult> {
  const p = holidaySchema.safeParse(input)
  if (!p.success) return invalid(p.error.issues)
  const s = await admin()
  const { error } = await (await createClient()).from('clinic_holidays').insert({ clinic_id: s.member.clinicId, date: p.data.date, name: p.data.name })
  if (error) return error.code === '23505' ? fail('CONFLICT', 'Ese día ya está marcado.', { date: 'Ya está marcado.' }) : fail('INTERNAL', 'No se pudo guardar.')
  done()
  return ok(undefined)
}

export async function removeHoliday(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail('VALIDATION', 'Datos no válidos.')
  await admin()
  const { error } = await (await createClient()).from('clinic_holidays').delete().eq('id', id)
  if (error) return fail('INTERNAL', 'No se pudo quitar.')
  done()
  return ok(undefined)
}

export async function saveCabinet(input: unknown): Promise<ActionResult> {
  const p = cabinetSchema.safeParse(input)
  if (!p.success) return invalid(p.error.issues)
  const s = await admin()
  const supabase = await createClient()
  const { error } = p.data.id
    ? await supabase.from('cabinets').update({ name: p.data.name, active: p.data.active }).eq('id', p.data.id)
    : await supabase.from('cabinets').insert({ clinic_id: s.member.clinicId, name: p.data.name, sort: 99 })
  if (error) return error.code === '23505' ? fail('CONFLICT', 'Ya existe un gabinete con ese nombre.', { name: 'Ya existe.' }) : fail('INTERNAL', 'No se pudo guardar.')
  done()
  return ok(undefined)
}

const slug = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'trat'

export async function saveTreatment(input: unknown): Promise<ActionResult> {
  const p = treatmentSchema.safeParse(input)
  if (!p.success) return invalid(p.error.issues)
  const s = await admin()
  const d = p.data
  const row = { name: d.name, category_id: d.categoryId ?? null, duration_min: d.durationMin, price_cents: d.priceCents, requires_tooth: d.requiresTooth, active: d.active }
  const supabase = await createClient()
  const { error } = d.id
    ? await supabase.from('treatments').update(row).eq('id', d.id)
    : await supabase.from('treatments').insert({ ...row, clinic_id: s.member.clinicId, code: d.code ?? `${slug(d.name)}_${Date.now().toString(36).slice(-4)}`, sort: 99 })
  if (error) return error.code === '23505' ? fail('CONFLICT', 'Ya existe un tratamiento con ese código.') : fail('INTERNAL', 'No se pudo guardar el tratamiento.')
  done()
  return ok(undefined)
}

export async function saveCategory(input: unknown): Promise<ActionResult> {
  const p = categorySchema.safeParse(input)
  if (!p.success) return invalid(p.error.issues)
  const s = await admin()
  const { error } = await (await createClient()).from('treatment_categories').insert({ clinic_id: s.member.clinicId, name: p.data.name, sort: 99 })
  if (error) return error.code === '23505' ? fail('CONFLICT', 'Ya existe esa categoría.', { name: 'Ya existe.' }) : fail('INTERNAL', 'No se pudo guardar.')
  done()
  return ok(undefined)
}

/** Reemplaza la receta completa de un tratamiento (insumos que se descuentan al finalizar la atención). */
export async function saveRecipe(input: unknown): Promise<ActionResult> {
  const p = recipeSchema.safeParse(input)
  if (!p.success) return invalid(p.error.issues)
  const s = await admin()
  const supabase = await createClient()
  const { error: delError } = await supabase.from('treatment_supplies').delete().eq('treatment_id', p.data.treatmentId)
  if (delError) return fail('INTERNAL', 'No se pudo guardar la receta.')
  if (p.data.lines.length) {
    const { error } = await supabase.from('treatment_supplies').insert(
      p.data.lines.map((l) => ({ clinic_id: s.member.clinicId, treatment_id: p.data.treatmentId, supply_item_id: l.supplyItemId, qty: l.qty })),
    )
    if (error) return fail('INTERNAL', 'No se pudo guardar la receta.')
  }
  done()
  return ok(undefined)
}

export async function updateMember(input: unknown): Promise<ActionResult> {
  const p = memberSchema.safeParse(input)
  if (!p.success) return invalid(p.error.issues)
  const s = await requireCapability('members.manage')
  const { data, error } = await (await createClient()).from('clinic_members')
    .update({ role: p.data.role, title: p.data.title ?? null, active: p.data.active }).eq('id', p.data.memberId).eq('clinic_id', s.member.clinicId).select('id')
  if (error?.message?.startsWith('LAST_ADMIN')) return fail('VALIDATION', 'La clínica debe conservar al menos un administrador activo.')
  if (error || !data?.length) return fail('INTERNAL', 'No se pudo guardar.')
  done()
  return ok(undefined)
}

/** Turnos semanales de un odontólogo. Sin turnos, atiende en todo el horario de la clínica. */
export async function saveSchedule(input: unknown): Promise<ActionResult> {
  const p = scheduleSchema.safeParse(input)
  if (!p.success) return invalid(p.error.issues)
  const s = await admin()
  const supabase = await createClient()
  const { error: delError } = await supabase.from('dentist_schedules').delete().eq('clinic_id', s.member.clinicId).eq('dentist_id', p.data.dentistId)
  if (delError) return fail('INTERNAL', 'No se pudo guardar el turno.')
  if (p.data.days.length) {
    const { error } = await supabase.from('dentist_schedules').insert(
      p.data.days.map((d) => ({ clinic_id: s.member.clinicId, dentist_id: p.data.dentistId, weekday: d.weekday, starts_at: d.starts, ends_at: d.ends })),
    )
    if (error) return fail('INTERNAL', 'No se pudo guardar el turno.')
  }
  done()
  return ok(undefined)
}
