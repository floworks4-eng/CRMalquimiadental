import 'server-only'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { searchTerm } from '@/lib/domain/text'
import type { PatientDetail, PatientDirectoryItem, PatientStatus } from './types'
import type { AppointmentSource } from '@/lib/domain/status'
import { appointmentCards } from './agenda'

export const PAGE_SIZE = 25

// Columnas del directorio: Recepcion las ve completas; los datos clinicos viven en otras tablas.
const DIRECTORY = 'id, full_name, phone_e164, birth_date, zone, status, first_source, primary_dentist:profiles!patients_primary_dentist_id_fkey(full_name)'

type DirRow = {
  id: string; full_name: string; phone_e164: string | null; birth_date: string | null; zone: string | null
  status: PatientStatus; first_source: AppointmentSource; primary_dentist: { full_name: string } | null
}
const toItem = (r: DirRow, next?: string): PatientDirectoryItem => ({
  id: r.id, fullName: r.full_name, phone: r.phone_e164, birthDate: r.birth_date, zone: r.zone, status: r.status,
  firstSource: r.first_source, primaryDentistName: r.primary_dentist?.full_name ?? null, nextAppointmentAt: next ?? null,
})

export type PatientFilters = { q?: string; status?: PatientStatus; source?: AppointmentSource; page?: number }

export async function searchPatients(f: PatientFilters) {
  await requireCapability('patients.read_directory')
  const supabase = await createClient()
  const page = Math.max(1, f.page ?? 1)
  let query = supabase.from('patients').select(DIRECTORY, { count: 'exact' }).is('archived_at', null)

  const term = searchTerm(f.q ?? '')
  if (term) {
    const digits = term.replace(/\D/g, '')
    query = /^[+\d ]+$/.test(term) && digits ? query.ilike('phone_e164', `%${digits}%`) : query.ilike('normalized_name', `%${term}%`)
  }
  if (f.status) query = query.eq('status', f.status)
  if (f.source) query = query.eq('first_source', f.source)

  const { data, count, error } = await query.order('full_name').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) throw new Error('No pudimos cargar los pacientes')
  const rows = (data ?? []) as unknown as DirRow[]

  const next = new Map<string, string>()
  if (rows.length) {
    const { data: appts } = await supabase
      .from('appointments').select('patient_id, starts_at').in('patient_id', rows.map((r) => r.id))
      .in('status', ['scheduled', 'confirmed', 'checked_in']).gte('starts_at', new Date().toISOString()).order('starts_at')
    for (const a of (appts ?? []) as { patient_id: string; starts_at: string }[]) if (!next.has(a.patient_id)) next.set(a.patient_id, a.starts_at)
  }
  return { items: rows.map((r) => toItem(r, next.get(r.id))), total: count ?? 0, page, pageSize: PAGE_SIZE }
}

/** null si no existe o no tiene permiso: el llamador responde igual (no se revela la existencia). */
export async function getPatientDetail(id: string): Promise<PatientDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  await requireCapability('patients.read_directory')
  const supabase = await createClient()
  const { data } = await supabase
    .from('patients')
    .select(`${DIRECTORY}, email, sex, address, primary_dentist_id, updated_at, campaign:campaigns!patients_first_campaign_id_fkey(name)`)
    .eq('id', id).maybeSingle()
  if (!data) return null
  const r = data as unknown as DirRow & { email: string | null; sex: string | null; address: string | null; primary_dentist_id: string | null; updated_at: string; campaign: { name: string } | null }
  const appointments = await appointmentCards(supabase, (q) => q.eq('patient_id', id).order('starts_at', { ascending: false }).limit(50))
  return {
    ...toItem(r), email: r.email, sex: r.sex, address: r.address, primaryDentistId: r.primary_dentist_id,
    campaignName: r.campaign?.name ?? null, updatedAt: r.updated_at, appointments,
  }
}

/** Para el selector de pacientes de "Nueva cita". */
export async function pickPatients(q: string) {
  await requireCapability('patients.read_directory')
  const term = searchTerm(q)
  if (term.length < 2) return []
  const supabase = await createClient()
  const digits = term.replace(/\D/g, '')
  const base = supabase.from('patients').select('id, full_name, phone_e164').is('archived_at', null)
  const { data } = await (/^[+\d ]+$/.test(term) && digits ? base.ilike('phone_e164', `%${digits}%`) : base.ilike('normalized_name', `%${term}%`)).order('full_name').limit(8)
  return ((data ?? []) as { id: string; full_name: string; phone_e164: string | null }[]).map((p) => ({ id: p.id, fullName: p.full_name, phone: p.phone_e164 }))
}
