'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { patientSchema, phoneField, updatePatientSchema } from '../schemas/patients'
import { normalizeBoPhone } from '@/lib/domain/phone'
import type { AppointmentSource } from '@/lib/domain/status'
import { normalizeName } from '@/lib/domain/text'
import { pickPatients, recentPatientPicker } from '../queries/patients'

const DUP = 'Ya existe un paciente con ese teléfono.'

export async function createPatient(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = patientSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const s = await requireCapability('patients.create')
  const supabase = await createClient()
  const d = p.data
  // Un odontologo solo ve a "sus" pacientes: el que crea queda como primario para no perder de vista su propio alta.
  const primary = s.member.role === 'dentist' ? s.userId : (d.primaryDentistId ?? null)
  const { data, error } = await supabase
    .from('patients')
    .insert({
      clinic_id: s.member.clinicId, full_name: d.fullName, normalized_name: normalizeName(d.fullName),
      phone_e164: d.phone, phone_raw: String((input as Record<string, unknown>)?.phone ?? '').slice(0, 40),
      email: d.email ?? null, birth_date: d.birthDate ?? null, sex: d.sex ?? null, zone: d.zone ?? null, address: d.address ?? null,
      primary_dentist_id: primary, first_source: d.firstSource, first_campaign_id: d.campaignId ?? null, created_by: s.userId,
    })
    .select('id')
    .single()
  if (error) return error.code === '23505' ? fail('CONFLICT', DUP, { phone: DUP }) : fail('INTERNAL', 'No pudimos guardar el paciente. Intenta de nuevo.')
  revalidatePath('/pacientes')
  return ok({ id: data.id as string })
}

export async function updatePatient(input: unknown): Promise<ActionResult> {
  const p = updatePatientSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues.map((i) => ({ ...i, path: i.path.slice(1) }))))
  await requireCapability('patients.update_demographics')
  const supabase = await createClient()
  const d = p.data.data
  const { data, error } = await supabase
    .from('patients')
    .update({
      full_name: d.fullName, normalized_name: normalizeName(d.fullName), phone_e164: d.phone,
      phone_raw: String(((input as { data?: Record<string, unknown> })?.data?.phone) ?? '').slice(0, 40),
      email: d.email ?? null, birth_date: d.birthDate ?? null, sex: d.sex ?? null, zone: d.zone ?? null, address: d.address ?? null,
      primary_dentist_id: d.primaryDentistId ?? null,
    })
    .eq('id', p.data.id)
    .eq('updated_at', p.data.expectedUpdatedAt) // control de concurrencia: si alguien edito antes, no pisamos su cambio
    .select('id')
  if (error) return error.code === '23505' ? fail('CONFLICT', DUP, { phone: DUP }) : fail('INTERNAL', 'No pudimos guardar los cambios.')
  if (!data?.length) return fail('CONFLICT', 'Otra persona modificó este paciente. Recarga para ver los cambios.')
  revalidatePath('/pacientes')
  revalidatePath(`/pacientes/${p.data.id}`)
  return ok(undefined)
}

export async function searchPatientPicker(q: string) {
  return pickPatients(String(q).slice(0, 60))
}

export async function listRecentPatientPicker() {
  return recentPatientPicker()
}

/** Alta mínima en Nueva cita. El equipo completa teléfono y anamnesis después en la ficha. */
export async function createQuickPatient(input: unknown): Promise<ActionResult<{ id: string; fullName: string; phone: string | null }>> {
  const parsed = z.object({
    fullName: z.string().trim().min(3, 'Escribe al menos 3 letras.').max(120),
    phone: z.string().trim().max(30).default(''),
    firstSource: z.enum(['whatsapp', 'web', 'campaign', 'phone', 'walk_in', 'referral']),
  }).safeParse(input)
  if (!parsed.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(parsed.error.issues))
  const s = await requireCapability('patients.create')
  const d = parsed.data
  const phone = d.phone ? normalizeBoPhone(d.phone) : null
  if (d.phone && !phone) return fail('VALIDATION', 'Revisa el celular.', { phone: 'Usa +591 y 8 dígitos que empiecen con 6 o 7.' })
  const { data, error } = await (await createClient()).from('patients').insert({
    clinic_id: s.member.clinicId,
    full_name: d.fullName,
    normalized_name: normalizeName(d.fullName),
    phone_e164: phone,
    phone_raw: d.phone || null,
    first_source: d.firstSource as AppointmentSource,
    primary_dentist_id: s.member.role === 'dentist' ? s.userId : null,
    created_by: s.userId,
  }).select('id').single()
  if (error || !data) return error?.code === '23505'
    ? fail('CONFLICT', DUP, { phone: DUP })
    : fail('INTERNAL', 'No pudimos crear al paciente.')
  revalidatePath('/pacientes')
  return ok({ id: data.id as string, fullName: d.fullName, phone })
}

/** El odontologo (o admin) confirma que leyo la anamnesis vigente antes de atender. Queda auditado por trigger. */
export async function reviewAnamnesis(input: unknown): Promise<ActionResult> {
  const p = z.object({ patientId: z.uuid(), versionId: z.uuid() }).safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Datos no válidos.')
  const s = await requireCapability('patients.read_clinical')
  const { data, error } = await (await createClient())
    .from('anamnesis_versions')
    .update({ reviewed_by: s.userId, reviewed_at: new Date().toISOString() })
    .eq('id', p.data.versionId)
    .eq('patient_id', p.data.patientId)
    .is('reviewed_at', null)
    .select('id')
  if (error) return fail('INTERNAL', 'No pudimos registrar la revisión.')
  if (!data?.length) return fail('CONFLICT', 'Esta anamnesis ya fue revisada o ya no es la vigente.')
  revalidatePath(`/pacientes/${p.data.patientId}`)
  return ok(undefined)
}

export type ImportRow = {
  fullName: string; phone?: string; birthDate?: string; sex?: string; zone?: string; address?: string; email?: string
  allergies?: string; conditions?: string; medications?: string; history?: string; historyDate?: string
}
export type ImportResult = { inserted: number; withHistory: number; skipped: { row: number; reason: string }[] }

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const longText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Texto demasiado largo (máx. ${max}).`).optional())
// Igual que el alta manual, pero el celular es opcional: las fichas antiguas muchas veces no lo tienen.
const importRowSchema = patientSchema.omit({ phone: true, firstSource: true, campaignId: true, primaryDentistId: true }).extend({
  phone: z.preprocess(blank, phoneField.optional()),
  allergies: longText(300), conditions: longText(300), medications: longText(500), history: longText(10_000),
  historyDate: z.preprocess(blank, z.iso.date('Fecha del historial no válida.').optional()),
})
const splitList = (v?: string) => (v ? v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 20) : [])

/** Alta mínima para digitalizar fichas antiguas que no tienen celular. */
export async function createPaperPatient(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = importRowSchema.safeParse(input)
  if (!parsed.success) return fail('VALIDATION', parsed.error.issues[0]?.message ?? 'Revisa los datos.')
  const session = await requireCapability('settings.manage')
  const supabase = await createClient()
  const normalized = normalizeName(parsed.data.fullName)
  const { data: existing, error: lookupError } = await supabase.from('patients').select('id')
    .eq('clinic_id', session.member.clinicId).eq('normalized_name', normalized).limit(1)
  if (lookupError) return fail('INTERNAL', 'No pudimos comprobar si el paciente ya existe.')
  if (existing?.length) return fail('CONFLICT', 'Ya existe un paciente con ese nombre. Búscalo en «Paciente existente» para adjuntar sus fichas.')
  const { data, error } = await supabase.from('patients').insert({
    clinic_id: session.member.clinicId, full_name: parsed.data.fullName, normalized_name: normalized,
    phone_e164: parsed.data.phone ?? null, first_source: 'historical', created_by: session.userId,
  }).select('id').single()
  if (error || !data) return fail('INTERNAL', error?.code === '23505' ? 'Ya existe un paciente con ese celular. Selecciónalo en «Paciente existente».' : 'No pudimos crear el paciente.')
  revalidatePath('/pacientes')
  return ok({ id: data.id as string })
}

/**
 * Importa la lista historica de pacientes con su historia clinica (planilla o fichas en papel transcritas).
 * Cada fila se valida como el alta manual. Se omiten duplicados: mismo celular, o mismo nombre y fecha de nacimiento
 * si no hay celular. Alergias/antecedentes/medicamentos van a la anamnesis; el historial, a las notas clinicas.
 * Todo queda auditado (trigger por fila + evento).
 */
export async function importPatients(input: unknown): Promise<ActionResult<ImportResult>> {
  const p = z.object({ rows: z.array(z.record(z.string(), z.string().optional())).min(1, 'El archivo no tiene filas.').max(2000, 'Máximo 2000 pacientes por archivo.') }).safeParse(input)
  if (!p.success) return fail('VALIDATION', p.error.issues[0]?.message ?? 'Archivo no válido.')
  const s = await requireCapability('settings.manage')
  const supabase = await createClient()

  const skipped: ImportResult['skipped'] = []
  const valid: { row: number; data: z.infer<typeof importRowSchema> }[] = []
  p.data.rows.forEach((raw, i) => {
    const r = importRowSchema.safeParse(raw)
    if (r.success) valid.push({ row: i + 2, data: r.data }) // +2: la fila 1 es el encabezado
    else skipped.push({ row: i + 2, reason: r.error.issues[0]?.message ?? 'Datos no válidos' })
  })

  // Duplicados contra lo que ya existe en la clinica.
  const existingPhones = new Set<string>()
  const existingNames = new Set<string>()
  const phones = valid.flatMap((v) => (v.data.phone ? [v.data.phone] : []))
  const names = [...new Set(valid.filter((v) => !v.data.phone).map((v) => normalizeName(v.data.fullName)))]
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await supabase.from('patients').select('phone_e164').in('phone_e164', phones.slice(i, i + 200))
    for (const x of (data ?? []) as { phone_e164: string }[]) existingPhones.add(x.phone_e164)
  }
  for (let i = 0; i < names.length; i += 200) {
    const { data } = await supabase.from('patients').select('normalized_name, birth_date').in('normalized_name', names.slice(i, i + 200))
    for (const x of (data ?? []) as { normalized_name: string; birth_date: string | null }[]) existingNames.add(`${x.normalized_name}|${x.birth_date ?? ''}`)
  }
  const seen = new Set<string>()
  const rows = valid.filter((v) => {
    const key = v.data.phone ?? `${normalizeName(v.data.fullName)}|${v.data.birthDate ?? ''}`
    const dup = v.data.phone
      ? (existingPhones.has(v.data.phone) ? 'Ya existe un paciente con ese celular' : seen.has(key) ? 'Celular repetido en el archivo' : null)
      : (existingNames.has(key) ? 'Ya existe un paciente con ese nombre y fecha de nacimiento' : seen.has(key) ? 'Paciente repetido en el archivo' : null)
    if (dup) skipped.push({ row: v.row, reason: dup })
    seen.add(key)
    return !dup
  })

  let inserted = 0
  let withHistory = 0
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { data: created, error } = await supabase.from('patients').insert(
      chunk.map(({ data: d }) => ({
        clinic_id: s.member.clinicId, full_name: d.fullName, normalized_name: normalizeName(d.fullName), phone_e164: d.phone ?? null, phone_raw: d.phone ?? null,
        email: d.email ?? null, birth_date: d.birthDate ?? null, sex: d.sex ?? null, zone: d.zone ?? null, address: d.address ?? null,
        first_source: 'historical', created_by: s.userId,
      })),
    ).select('id')
    if (error || !created) {
      return fail('INTERNAL', `Se importaron ${inserted} pacientes y luego hubo un error. Vuelve a subir el archivo: los ya importados se omiten.`)
    }
    inserted += created.length
    // PostgREST devuelve las filas en el mismo orden del insert.
    const ids = (created as { id: string }[]).map((c) => c.id)
    const anamnesis = chunk.flatMap(({ data: d }, j) => {
      const al = splitList(d.allergies), co = splitList(d.conditions)
      return al.length || co.length || d.medications
        ? [{ clinic_id: s.member.clinicId, patient_id: ids[j], allergies: al.length ? al : ['Ninguna'], conditions: co.length ? co : ['Ninguno'],
            medications: d.medications ?? null, source: 'import', submitted_by: s.userId }]
        : []
    })
    const notes = chunk.flatMap(({ data: d }, j) => (d.history
      ? [{ clinic_id: s.member.clinicId, patient_id: ids[j], body: d.history, noted_on: d.historyDate ?? new Date().toISOString().slice(0, 10), source: 'import', created_by: s.userId }]
      : []))
    if (anamnesis.length && (await supabase.from('anamnesis_versions').insert(anamnesis)).error) return fail('INTERNAL', 'Se importaron los pacientes pero no sus alergias/antecedentes. Avísale al soporte.')
    if (notes.length && (await supabase.from('clinical_notes').insert(notes)).error) return fail('INTERNAL', 'Se importaron los pacientes pero no su historial. Avísale al soporte.')
    withHistory += new Set([...anamnesis.map((x) => x.patient_id), ...notes.map((x) => x.patient_id)]).size
  }
  await supabase.rpc('log_event', { p_clinic: s.member.clinicId, p_action: 'patients.import', p_entity_type: 'patients', p_meta: { inserted, withHistory, skipped: skipped.length } })
  revalidatePath('/pacientes')
  return ok({ inserted, withHistory, skipped: skipped.sort((a, b) => a.row - b.row) })
}

/** Nota en el historial clinico del paciente (transcribir una ficha en papel, un dato importante). No se edita. */
export async function addClinicalNote(input: unknown): Promise<ActionResult> {
  const p = z.object({
    patientId: z.uuid(), body: z.string().trim().min(3, 'Escribe la nota.').max(10_000),
    notedOn: z.iso.date('Fecha no válida.').refine((d) => d <= new Date().toISOString().slice(0, 10), 'La fecha no puede ser futura.'),
  }).safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa la nota.', fieldErrors(p.error.issues))
  const s = await requireCapability('patients.read_clinical')
  const { error } = await (await createClient()).from('clinical_notes').insert({
    clinic_id: s.member.clinicId, patient_id: p.data.patientId, body: p.data.body, noted_on: p.data.notedOn, source: 'staff', created_by: s.userId,
  })
  if (error) return fail('FORBIDDEN', 'No se pudo guardar la nota.')
  revalidatePath(`/pacientes/${p.data.patientId}`)
  return ok(undefined)
}
