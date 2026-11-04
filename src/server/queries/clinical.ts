import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { can } from '../auth/permissions'
import { getCurrentAnamnesis, type AnamnesisView } from './patients'
import { appointmentCards } from './agenda'
import { dayBoundsUtc } from '@/lib/domain/time'
import type { AppointmentCard } from './types'
import type { InvoiceStatus, PlanStatus, ToothCondition } from '@/lib/domain/clinical'

// Datos clinicos: solo para admin y el odontologo del paciente (RLS: can_read_clinical). Recepcion nunca llega aca.
const UUID = /^[0-9a-f-]{36}$/

export type Finding = { tooth: number; condition: ToothCondition; surfaces: string[]; encounterId: string; recordedAt: string; notes: string | null }
export type PlanItem = {
  id: string; treatmentId: string; treatmentName: string; tooth: number | null; surfaces: string[]; status: PlanStatus
  priceCents: number; encounterId: string | null; completedEncounterId: string | null; createdAt: string
}
export type TreatmentOption = { id: string; name: string; priceCents: number; requiresTooth: boolean; category: string | null }
export type SupplyNeed = { item: string; unit: string; need: number; available: number }
export type InvoiceSummary = {
  id: string; number: string; status: InvoiceStatus; totalCents: number; paidCents: number; discountCents: number; issuedAt: string
  patient: { id: string; fullName: string } | null
}
export type Addendum = { id: string; reason: string; notes: string; createdAt: string; author: string }
export type EncounterView = {
  id: string; status: 'in_progress' | 'finished' | 'voided'; chiefComplaint: string | null; notes: string | null; startedAt: string; finishedAt: string | null
}

type Supabase = SupabaseClient

export async function findingsOf(supabase: Supabase, patientId: string): Promise<Finding[]> {
  const { data } = await supabase.from('tooth_findings').select('tooth_fdi, condition, surfaces, encounter_id, recorded_at, notes')
    .eq('patient_id', patientId).order('recorded_at')
  return ((data ?? []) as { tooth_fdi: number; condition: ToothCondition; surfaces: string[]; encounter_id: string; recorded_at: string; notes: string | null }[])
    .map((f) => ({ tooth: f.tooth_fdi, condition: f.condition, surfaces: f.surfaces, encounterId: f.encounter_id, recordedAt: f.recorded_at, notes: f.notes }))
}

export async function planOf(supabase: Supabase, patientId: string): Promise<PlanItem[]> {
  const { data } = await supabase.from('treatment_plan_items')
    .select('id, treatment_id, tooth_fdi, surfaces, status, price_cents, encounter_id, completed_encounter_id, created_at, treatment:treatments(name)')
    .eq('patient_id', patientId).neq('status', 'cancelled').order('sequence').order('created_at')
  return ((data ?? []) as unknown as {
    id: string; treatment_id: string; tooth_fdi: number | null; surfaces: string[]; status: PlanStatus; price_cents: number
    encounter_id: string | null; completed_encounter_id: string | null; created_at: string; treatment: { name: string } | null
  }[]).map((r) => ({
    id: r.id, treatmentId: r.treatment_id, treatmentName: r.treatment?.name ?? '—', tooth: r.tooth_fdi, surfaces: r.surfaces, status: r.status,
    priceCents: r.price_cents, encounterId: r.encounter_id, completedEncounterId: r.completed_encounter_id, createdAt: r.created_at,
  }))
}

export async function treatmentOptions(supabase: Supabase): Promise<TreatmentOption[]> {
  const { data } = await supabase.from('treatments').select('id, name, price_cents, requires_tooth, category:treatment_categories(name)').eq('active', true).order('sort').order('name')
  return ((data ?? []) as unknown as { id: string; name: string; price_cents: number; requires_tooth: boolean; category: { name: string } | null }[])
    .map((t) => ({ id: t.id, name: t.name, priceCents: t.price_cents, requiresTooth: t.requires_tooth, category: t.category?.name ?? null }))
}

const toInvoice = (r: {
  id: string; number: string; status: InvoiceStatus; total_cents: number; paid_cents: number; discount_cents: number; issued_at: string
  patient?: { id: string; full_name: string } | null
}): InvoiceSummary => ({
  id: r.id, number: r.number, status: r.status, totalCents: r.total_cents, paidCents: r.paid_cents, discountCents: r.discount_cents,
  issuedAt: r.issued_at, patient: r.patient ? { id: r.patient.id, fullName: r.patient.full_name } : null,
})
export const INVOICE_SELECT = 'id, number, status, total_cents, paid_cents, discount_cents, issued_at, patient:patients(id, full_name)'
export const mapInvoices = (data: unknown) => ((data ?? []) as Parameters<typeof toInvoice>[0][]).map(toInvoice)

/** Lista de atención del día: el odontólogo ve lo suyo; el admin, todo. */
export async function getConsultaList(date: string): Promise<AppointmentCard[]> {
  await requireCapability('encounters.read')
  const supabase = await createClient()
  const [from, to] = dayBoundsUtc(date)
  return appointmentCards(supabase, (q) => q.gte('starts_at', from).lt('starts_at', to).not('status', 'in', '(cancelled,no_show)').order('starts_at'))
}

export type ConsultaData = {
  appointment: AppointmentCard
  patient: { id: string; fullName: string; birthDate: string | null; phone: string | null }
  anamnesis: AnamnesisView | null
  encounter: EncounterView | null
  findings: Finding[]
  plan: PlanItem[]
  treatments: TreatmentOption[]
  supplies: SupplyNeed[]
  invoice: InvoiceSummary | null
  addenda: Addendum[]
  canFinish: boolean
  canDiscount: boolean
}

export const getConsulta = cache(async (appointmentId: string): Promise<ConsultaData | null> => {
  if (!UUID.test(appointmentId)) return null
  const s = await requireCapability('encounters.read')
  const supabase = await createClient()
  const readPatient = async () => {
    const [appointment] = await appointmentCards(supabase, (q) => q.eq('id', appointmentId))
    if (!appointment?.patient) return null
    const patientId = appointment.patient.id
    const [{ data: p }, anamnesis, findings, plan] = await Promise.all([
      supabase.from('patients').select('id, full_name, birth_date, phone_e164').eq('id', patientId).maybeSingle(),
      getCurrentAnamnesis(patientId),
      findingsOf(supabase, patientId),
      planOf(supabase, patientId),
    ])
    return p ? { appointment, p, anamnesis, findings, plan } : null
  }
  // El encuentro y el catálogo no necesitan el patientId resuelto por la cita.
  const [patientResult, encounterResult, treatmentResult] = await Promise.allSettled([
    readPatient(),
    supabase.from('encounters').select('id, status, chief_complaint, notes, started_at, finished_at').eq('appointment_id', appointmentId).maybeSingle(),
    treatmentOptions(supabase),
  ])
  if (patientResult.status === 'rejected') throw patientResult.reason
  const patientData = patientResult.value
  if (!patientData) return null
  if (encounterResult.status === 'rejected') throw encounterResult.reason
  if (treatmentResult.status === 'rejected') throw treatmentResult.reason
  const { data: e } = encounterResult.value
  const treatments = treatmentResult.value
  const { appointment, p, anamnesis, findings, plan } = patientData
  const enc = e as { id: string; status: EncounterView['status']; chief_complaint: string | null; notes: string | null; started_at: string; finished_at: string | null } | null
  const encounter: EncounterView | null = enc
    ? { id: enc.id, status: enc.status, chiefComplaint: enc.chief_complaint, notes: enc.notes, startedAt: enc.started_at, finishedAt: enc.finished_at }
    : null

  // Insumos que se usarian hoy (receta x items "hoy") frente al stock disponible.
  const today = plan.filter((i) => i.status === 'in_progress')
  let supplies: SupplyNeed[] = []
  if (encounter?.status === 'in_progress' && today.length) {
    const treatmentCounts = new Map<string, number>()
    for (const item of today) treatmentCounts.set(item.treatmentId, (treatmentCounts.get(item.treatmentId) ?? 0) + 1)
    const { data: recipe } = await supabase.from('treatment_supplies').select('treatment_id, qty, supply_item_id, item:supply_items(name, unit)')
      .in('treatment_id', [...treatmentCounts.keys()])
    const need = new Map<string, SupplyNeed>()
    for (const r of (recipe ?? []) as unknown as { treatment_id: string; qty: number; supply_item_id: string; item: { name: string; unit: string } }[]) {
      const times = treatmentCounts.get(r.treatment_id) ?? 0
      const cur = need.get(r.supply_item_id) ?? { item: r.item.name, unit: r.item.unit, need: 0, available: 0 }
      cur.need += Number(r.qty) * times
      need.set(r.supply_item_id, cur)
    }
    if (need.size) {
      const { data: stock } = await supabase.from('v_stock').select('supply_item_id, on_hand').in('supply_item_id', [...need.keys()])
      for (const st of (stock ?? []) as { supply_item_id: string; on_hand: number }[]) need.get(st.supply_item_id)!.available = Number(st.on_hand)
    }
    supplies = [...need.values()]
  }

  let invoice: InvoiceSummary | null = null
  let addenda: Addendum[] = []
  if (encounter && encounter.status !== 'in_progress') {
    const [{ data: inv }, { data: add }] = await Promise.all([
      supabase.from('invoices').select(INVOICE_SELECT).eq('encounter_id', encounter.id).maybeSingle(),
      supabase.from('encounter_addenda').select('id, reason, notes, created_at, author:profiles(full_name)').eq('encounter_id', encounter.id).order('created_at'),
    ])
    invoice = inv ? mapInvoices([inv])[0] : null
    addenda = ((add ?? []) as unknown as { id: string; reason: string; notes: string; created_at: string; author: { full_name: string } | null }[])
      .map((a) => ({ id: a.id, reason: a.reason, notes: a.notes, createdAt: a.created_at, author: a.author?.full_name ?? '—' }))
  }

  const role = s.member.role
  const pr = p as { id: string; full_name: string; birth_date: string | null; phone_e164: string | null }
  return {
    appointment,
    patient: { id: pr.id, fullName: pr.full_name, birthDate: pr.birth_date, phone: pr.phone_e164 },
    anamnesis, encounter, findings,
    // Lo pendiente del paciente + lo que se hizo en esta atencion.
    plan: plan.filter((i) => i.status !== 'done' || (encounter && i.completedEncounterId === encounter.id)),
    treatments, supplies, invoice, addenda,
    canFinish: role === 'clinic_admin' || (role === 'dentist' && appointment.dentist.id === s.userId),
    canDiscount: role === 'clinic_admin',
  }
})

export type EncounterHistoryItem = {
  id: string; appointmentId: string; status: EncounterView['status']; chiefComplaint: string | null; notes: string | null; startedAt: string; dentist: string
  items: string[]; findings: string[]; invoice: { number: string; totalCents: number; paidCents: number } | null
  addenda: { reason: string; notes: string; createdAt: string; author: string }[]
}
export type ClinicalNote = { id: string; notedOn: string; body: string; source: 'staff' | 'import'; author: string; createdAt: string }
export type AnamnesisVersion = { id: string; version: number; submittedAt: string; source: AnamnesisView['source']; summary: string; author: string }
export type PatientFile = { id: string; kind: 'photo' | 'document'; mime: string; sizeBytes: number; createdAt: string; url: string | null }
export type PatientClinical = {
  anamnesis: AnamnesisView | null; findings: Finding[]; pending: PlanItem[]; history: EncounterHistoryItem[]
  notes: ClinicalNote[]; anamnesisVersions: AnamnesisVersion[]; files: PatientFile[]
}

/** Historia clinica completa de la ficha: anamnesis y sus versiones, odontograma, plan, atenciones, notas e historial importado. */
export const getPatientClinical = cache(async (patientId: string): Promise<PatientClinical | null> => {
  if (!UUID.test(patientId)) return null
  await requireCapability('patients.read_clinical')
  const supabase = await createClient()
  const readFiles = async (): Promise<PatientFile[]> => {
    const { data: files } = await supabase.from('patient_files').select('id, kind, mime, size_bytes, storage_path, created_at').eq('patient_id', patientId).order('created_at', { ascending: false })
    const rows = (files ?? []) as { id: string; kind: 'photo' | 'document'; mime: string; size_bytes: number; storage_path: string; created_at: string }[]
    if (!rows.length) return []
    // Firmar solo rutas devueltas por RLS, sin esperar el resto de la historia.
    const batches: typeof rows[] = []
    for (let offset = 0; offset < rows.length; offset += 100) batches.push(rows.slice(offset, offset + 100))
    const signedBatches = await Promise.all(batches.map(async (batch) => {
      const { data, error } = await supabase.storage.from('clinical').createSignedUrls(batch.map((file) => file.storage_path), 3600)
      const urls = new Map<string, string | null>()
      // Storage puede ordenar por path; nunca asociar la respuesta por índice.
      if (!error) for (const signed of data ?? []) {
        if (signed.path !== null) urls.set(signed.path, signed.error !== null ? null : signed.signedUrl)
      }
      return batch.map((file) => ({
        id: file.id, kind: file.kind, mime: file.mime, sizeBytes: Number(file.size_bytes), createdAt: file.created_at,
        url: urls.get(file.storage_path) ?? null,
      }))
    }))
    return signedBatches.flat()
  }
  const [anamnesis, findings, plan, { data: enc }, { data: notes }, { data: versions }, filesWithUrls] = await Promise.all([
    getCurrentAnamnesis(patientId),
    findingsOf(supabase, patientId),
    planOf(supabase, patientId),
    supabase.from('encounters')
      .select('id, appointment_id, status, chief_complaint, notes, started_at, dentist:profiles!encounters_dentist_id_fkey(full_name), invoice:invoices(number, total_cents, paid_cents), addenda:encounter_addenda(reason, notes, created_at, author:profiles(full_name))')
      .eq('patient_id', patientId).order('started_at', { ascending: false }).limit(200),
    supabase.from('clinical_notes').select('id, noted_on, body, source, created_at, author:profiles(full_name)').eq('patient_id', patientId).order('noted_on', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    supabase.from('anamnesis_versions').select('id, version, submitted_at, source, allergies, allergy_other, conditions, medications, author:profiles!anamnesis_versions_submitted_by_fkey(full_name)').eq('patient_id', patientId).order('version', { ascending: false }),
    readFiles(),
  ])
  const itemsByEncounter = new Map<string, string[]>()
  for (const item of plan) {
    if (item.completedEncounterId === null) continue
    const items = itemsByEncounter.get(item.completedEncounterId) ?? []
    items.push(item.treatmentName + (item.tooth ? ` · ${item.tooth}` : ''))
    itemsByEncounter.set(item.completedEncounterId, items)
  }
  const findingsByEncounter = new Map<string, string[]>()
  for (const finding of findings) {
    const items = findingsByEncounter.get(finding.encounterId) ?? []
    items.push(`${finding.tooth} ${finding.condition}${finding.surfaces.length ? ` (${finding.surfaces.join('')})` : ''}`)
    findingsByEncounter.set(finding.encounterId, items)
  }
  type Inv = { number: string; total_cents: number; paid_cents: number }
  const history = ((enc ?? []) as unknown as {
    id: string; appointment_id: string; status: EncounterView['status']; chief_complaint: string | null; notes: string | null; started_at: string
    dentist: { full_name: string } | null; invoice: Inv[] | Inv | null
    addenda: { reason: string; notes: string; created_at: string; author: { full_name: string } | null }[] | null
  }[]).map((r) => {
    const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice
    return {
      id: r.id, appointmentId: r.appointment_id, status: r.status, chiefComplaint: r.chief_complaint, notes: r.notes, startedAt: r.started_at,
      dentist: r.dentist?.full_name ?? '—',
      items: itemsByEncounter.get(r.id) ?? [],
      findings: findingsByEncounter.get(r.id) ?? [],
      invoice: inv ? { number: inv.number, totalCents: inv.total_cents, paidCents: inv.paid_cents } : null,
      addenda: (r.addenda ?? []).map((x) => ({ reason: x.reason, notes: x.notes, createdAt: x.created_at, author: x.author?.full_name ?? '—' })),
    }
  })
  const clean = (l: string[] | null, none: string) => (l ?? []).filter((x) => x !== none)
  return {
    anamnesis, findings, pending: plan.filter((i) => i.status !== 'done'), history,
    notes: ((notes ?? []) as unknown as { id: string; noted_on: string; body: string; source: 'staff' | 'import'; created_at: string; author: { full_name: string } | null }[])
      .map((n) => ({ id: n.id, notedOn: n.noted_on, body: n.body, source: n.source, createdAt: n.created_at, author: n.author?.full_name ?? '—' })),
    anamnesisVersions: ((versions ?? []) as unknown as {
      id: string; version: number; submitted_at: string; source: AnamnesisView['source']; allergies: string[] | null; allergy_other: string | null
      conditions: string[] | null; medications: string | null; author: { full_name: string } | null
    }[]).map((v) => {
      const al = [...clean(v.allergies, 'Ninguna'), ...(v.allergy_other ? [v.allergy_other] : [])]
      const co = clean(v.conditions, 'Ninguno')
      return {
        id: v.id, version: v.version, submittedAt: v.submitted_at, source: v.source, author: v.author?.full_name ?? '—',
        summary: [`Alergias: ${al.join(', ') || 'ninguna'}`, `Antecedentes: ${co.join(', ') || 'ninguno'}`, v.medications && `Medicamentos: ${v.medications}`].filter(Boolean).join(' · '),
      }
    }),
    files: filesWithUrls,
  }
})

/** Facturas del paciente (recepcion tambien las ve: es dinero, no salud). */
export async function getPatientInvoices(patientId: string): Promise<InvoiceSummary[]> {
  if (!UUID.test(patientId)) return []
  const s = await requireCapability('patients.read_directory')
  if (!can(s.member.role, 'billing.read')) return []
  const { data } = await (await createClient()).from('invoices').select(INVOICE_SELECT).eq('patient_id', patientId).order('issued_at', { ascending: false }).limit(50)
  return mapInvoices(data)
}
