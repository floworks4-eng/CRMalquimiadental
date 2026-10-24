import 'server-only'
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

export async function getConsulta(appointmentId: string): Promise<ConsultaData | null> {
  if (!UUID.test(appointmentId)) return null
  const s = await requireCapability('encounters.read')
  const supabase = await createClient()
  const [appointment] = await appointmentCards(supabase, (q) => q.eq('id', appointmentId))
  if (!appointment?.patient) return null
  const patientId = appointment.patient.id

  const [{ data: p }, anamnesis, { data: e }, findings, plan, treatments] = await Promise.all([
    supabase.from('patients').select('id, full_name, birth_date, phone_e164').eq('id', patientId).maybeSingle(),
    getCurrentAnamnesis(patientId),
    supabase.from('encounters').select('id, status, chief_complaint, notes, started_at, finished_at').eq('appointment_id', appointmentId).maybeSingle(),
    findingsOf(supabase, patientId),
    planOf(supabase, patientId),
    treatmentOptions(supabase),
  ])
  if (!p) return null
  const enc = e as { id: string; status: EncounterView['status']; chief_complaint: string | null; notes: string | null; started_at: string; finished_at: string | null } | null
  const encounter: EncounterView | null = enc
    ? { id: enc.id, status: enc.status, chiefComplaint: enc.chief_complaint, notes: enc.notes, startedAt: enc.started_at, finishedAt: enc.finished_at }
    : null

  // Insumos que se usarian hoy (receta x items "hoy") frente al stock disponible.
  const today = plan.filter((i) => i.status === 'in_progress')
  let supplies: SupplyNeed[] = []
  if (encounter?.status === 'in_progress' && today.length) {
    const { data: recipe } = await supabase.from('treatment_supplies').select('treatment_id, qty, supply_item_id, item:supply_items(name, unit)')
      .in('treatment_id', [...new Set(today.map((i) => i.treatmentId))])
    const need = new Map<string, SupplyNeed>()
    for (const r of (recipe ?? []) as unknown as { treatment_id: string; qty: number; supply_item_id: string; item: { name: string; unit: string } }[]) {
      const times = today.filter((i) => i.treatmentId === r.treatment_id).length
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
}

export type EncounterHistoryItem = {
  id: string; appointmentId: string; status: EncounterView['status']; chiefComplaint: string | null; startedAt: string; dentist: string
  items: string[]; invoice: { number: string; totalCents: number; paidCents: number } | null; addenda: number
}
export type PatientClinical = { anamnesis: AnamnesisView | null; findings: Finding[]; pending: PlanItem[]; history: EncounterHistoryItem[] }

/** Bloque clinico de la ficha del paciente. */
export async function getPatientClinical(patientId: string): Promise<PatientClinical | null> {
  if (!UUID.test(patientId)) return null
  await requireCapability('patients.read_clinical')
  const supabase = await createClient()
  const [anamnesis, findings, plan, { data: enc }] = await Promise.all([
    getCurrentAnamnesis(patientId),
    findingsOf(supabase, patientId),
    planOf(supabase, patientId),
    supabase.from('encounters')
      .select('id, appointment_id, status, chief_complaint, started_at, dentist:profiles!encounters_dentist_id_fkey(full_name), invoice:invoices(number, total_cents, paid_cents), addenda:encounter_addenda(count)')
      .eq('patient_id', patientId).order('started_at', { ascending: false }).limit(50),
  ])
  const history = ((enc ?? []) as unknown as {
    id: string; appointment_id: string; status: EncounterView['status']; chief_complaint: string | null; started_at: string
    dentist: { full_name: string } | null; invoice: { number: string; total_cents: number; paid_cents: number }[] | { number: string; total_cents: number; paid_cents: number } | null
    addenda: { count: number }[]
  }[]).map((r) => {
    const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice
    return {
      id: r.id, appointmentId: r.appointment_id, status: r.status, chiefComplaint: r.chief_complaint, startedAt: r.started_at, dentist: r.dentist?.full_name ?? '—',
      items: plan.filter((i) => i.completedEncounterId === r.id).map((i) => i.treatmentName + (i.tooth ? ` · ${i.tooth}` : '')),
      invoice: inv ? { number: inv.number, totalCents: inv.total_cents, paidCents: inv.paid_cents } : null,
      addenda: r.addenda?.[0]?.count ?? 0,
    }
  })
  return { anamnesis, findings, pending: plan.filter((i) => i.status !== 'done'), history }
}

/** Facturas del paciente (recepcion tambien las ve: es dinero, no salud). */
export async function getPatientInvoices(patientId: string): Promise<InvoiceSummary[]> {
  if (!UUID.test(patientId)) return []
  const s = await requireCapability('patients.read_directory')
  if (!can(s.member.role, 'billing.read')) return []
  const { data } = await (await createClient()).from('invoices').select(INVOICE_SELECT).eq('patient_id', patientId).order('issued_at', { ascending: false }).limit(50)
  return mapInvoices(data)
}
