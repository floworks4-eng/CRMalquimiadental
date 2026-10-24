import 'server-only'
import { createAdminClient } from '../supabase/admin'
import { TOKEN_RE, tokenHash } from './tokens'

export type CheckinContext = {
  firstName: string
  startsAt: string
  clinicName: string
  treatment: string | null
  dentist: string | null
  needsBirthDate: boolean
  inWindow: boolean
  legalReady: boolean
  consents: { id: string; type: 'data_processing' | 'clinical_treatment' | 'whatsapp_reminders'; version: string; body: string; draft: boolean }[]
}

/** null si el enlace no existe, esta usado, vencido o revocado: mismo resultado en todos los casos. */
export async function getCheckinContext(token: string): Promise<CheckinContext | null> {
  if (!TOKEN_RE.test(token)) return null
  const { data, error } = await createAdminClient().rpc('checkin_context', { p_token_hash: tokenHash(token) })
  if (error || !data) return null
  const c = data as {
    first_name: string; starts_at: string; clinic_name: string; treatment: string | null; dentist: string | null; needs_birth_date: boolean
    in_window: boolean; legal_ready: boolean; consents: { id: string; type: CheckinContext['consents'][number]['type']; version: string; body_md: string; draft: boolean }[]
  }
  return {
    firstName: c.first_name, startsAt: c.starts_at, clinicName: c.clinic_name, treatment: c.treatment, dentist: c.dentist,
    needsBirthDate: c.needs_birth_date, inWindow: c.in_window, legalReady: c.legal_ready,
    consents: c.consents.map((x) => ({ id: x.id, type: x.type, version: x.version, body: x.body_md, draft: x.draft })),
  }
}

/** La clinica a la que apunta el sitio publico: CLINIC_SLUG, o la unica que exista. */
export async function getPublicClinic() {
  const admin = createAdminClient()
  const slug = process.env.CLINIC_SLUG
  const q = admin.from('clinics').select('id, name, address, phone, timezone, allow_draft_legal')
  const { data } = slug ? await q.eq('slug', slug).limit(1) : await q.limit(2)
  if (!data || data.length !== 1) return null // sin slug y con varias clinicas: no se adivina
  return data[0] as { id: string; name: string; address: string | null; phone: string | null; timezone: string; allow_draft_legal: boolean }
}

export async function getBookableTreatments(clinicId: string) {
  const { data } = await createAdminClient().from('treatments').select('id, name, duration_min').eq('clinic_id', clinicId).eq('active', true).eq('bookable_online', true).order('sort')
  return ((data ?? []) as { id: string; name: string; duration_min: number }[]).map((t) => ({ id: t.id, name: t.name, durationMin: t.duration_min }))
}

export async function getLegalTexts(clinicId: string) {
  const { data } = await createAdminClient().rpc('public_consent_texts', { p_clinic: clinicId })
  return ((data ?? []) as { type: string; version: string; body_md: string; draft: boolean; hash: string; effective_from: string }[]).map((t) => ({
    type: t.type, version: t.version, body: t.body_md, draft: t.draft, hash: t.hash, effectiveFrom: t.effective_from,
  }))
}
