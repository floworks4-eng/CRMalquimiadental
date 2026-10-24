'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { patientSchema, updatePatientSchema } from '../schemas/patients'
import { normalizeName } from '@/lib/domain/text'
import { pickPatients } from '../queries/patients'

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

export type ImportRow = { fullName: string; phone: string; birthDate?: string; sex?: string; zone?: string; address?: string; email?: string }
export type ImportResult = { inserted: number; skipped: { row: number; reason: string }[] }

/**
 * Importa la lista historica de pacientes (planilla de la clinica). Cada fila se valida igual que el alta manual;
 * se omiten los celulares que ya existen o que se repiten en el archivo. Queda auditado (trigger por fila + evento).
 */
export async function importPatients(input: unknown): Promise<ActionResult<ImportResult>> {
  const p = z.object({ rows: z.array(z.record(z.string(), z.string().optional())).min(1, 'El archivo no tiene filas.').max(2000, 'Máximo 2000 pacientes por archivo.') }).safeParse(input)
  if (!p.success) return fail('VALIDATION', p.error.issues[0]?.message ?? 'Archivo no válido.')
  const s = await requireCapability('settings.manage')
  const supabase = await createClient()

  const skipped: ImportResult['skipped'] = []
  const valid: { row: number; data: z.infer<typeof patientSchema> }[] = []
  p.data.rows.forEach((raw, i) => {
    const r = patientSchema.safeParse({ ...raw, firstSource: 'historical' })
    if (r.success) valid.push({ row: i + 2, data: r.data }) // +2: fila 1 es el encabezado
    else skipped.push({ row: i + 2, reason: r.error.issues[0]?.message ?? 'Datos no válidos' })
  })

  const phones = valid.map((v) => v.data.phone)
  const existing = new Set<string>()
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await supabase.from('patients').select('phone_e164').in('phone_e164', phones.slice(i, i + 200))
    for (const x of (data ?? []) as { phone_e164: string }[]) existing.add(x.phone_e164)
  }
  const seen = new Set<string>()
  const rows = valid.filter((v) => {
    const dup = existing.has(v.data.phone) ? 'Ya existe un paciente con ese celular' : seen.has(v.data.phone) ? 'Celular repetido en el archivo' : null
    if (dup) skipped.push({ row: v.row, reason: dup })
    seen.add(v.data.phone)
    return !dup
  })

  let inserted = 0
  for (let i = 0; i < rows.length; i += 200) {
    const { error, count } = await supabase.from('patients').insert(
      rows.slice(i, i + 200).map(({ data: d }) => ({
        clinic_id: s.member.clinicId, full_name: d.fullName, normalized_name: normalizeName(d.fullName), phone_e164: d.phone, phone_raw: d.phone,
        email: d.email ?? null, birth_date: d.birthDate ?? null, sex: d.sex ?? null, zone: d.zone ?? null, address: d.address ?? null,
        first_source: 'historical', created_by: s.userId,
      })),
      { count: 'exact' },
    )
    if (error) return fail('INTERNAL', `Se importaron ${inserted} pacientes y luego hubo un error. Revisa el archivo y vuelve a subirlo: los ya importados se omiten.`)
    inserted += count ?? 0
  }
  await supabase.rpc('log_event', { p_clinic: s.member.clinicId, p_action: 'patients.import', p_entity_type: 'patients', p_meta: { inserted, skipped: skipped.length } })
  revalidatePath('/pacientes')
  return ok({ inserted, skipped: skipped.sort((a, b) => a.row - b.row) })
}
