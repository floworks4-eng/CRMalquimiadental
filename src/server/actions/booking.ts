'use server'
import { createAdminClient } from '../supabase/admin'
import { publicEnv } from '../env'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { rpcError } from '../errors-rpc'
import { bookingSchema, publicSlotsSchema } from '../schemas/booking'
import { getPublicClinic } from '../public/context'
import { ipHash } from '../public/ip'
import { newToken, tokenHash } from '../public/tokens'

async function limited(key: string, limit: number, window: string) {
  const { error } = await createAdminClient().rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window: window })
  return error ? rpcError(error.message, error.code) : null
}

/** Horarios publicos: solo instantes, sin odontologos ni gabinetes. */
export async function getPublicSlots(input: unknown): Promise<ActionResult<string[]>> {
  const p = publicSlotsSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.')
  const clinic = await getPublicClinic()
  if (!clinic) return fail('INTERNAL', 'El servicio no está disponible por ahora.')
  const blocked = await limited(`slots:ip:${await ipHash()}`, 120, '10 minutes')
  if (blocked) return blocked
  const { data, error } = await createAdminClient().rpc('public_slots', { p_clinic: clinic.id, p_treatment: p.data.treatmentId, p_from: p.data.from, p_to: p.data.to })
  if (error) return rpcError(error.message, error.code)
  return ok(((data ?? []) as { slot_start: string }[]).map((r) => r.slot_start))
}

export type BookingResult = { code: string; startsAt: string; treatment: string; checkinUrl: string; checkinExpiresAt: string }

export async function createPublicBooking(input: unknown): Promise<ActionResult<BookingResult>> {
  const p = bookingSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const clinic = await getPublicClinic()
  if (!clinic) return fail('INTERNAL', 'El servicio no está disponible por ahora.')
  const ip = await ipHash()
  for (const [key, limit, win] of [[`book:ip:${ip}`, 10, '1 hour'], [`book:phone:${p.data.phone}`, 5, '1 hour']] as const) {
    const blocked = await limited(key, limit, win)
    if (blocked) return blocked
  }
  const token = newToken()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('public_book', {
    p_clinic: clinic.id, p_treatment: p.data.treatmentId, p_starts_at: p.data.startsAt, p_name: p.data.name, p_phone: p.data.phone,
    p_consent_data: p.data.consentData, p_consent_whatsapp: p.data.consentWhatsapp, p_utm: p.data.utm, p_token_hash: tokenHash(token), p_ip_hash: ip,
  })
  if (error) return rpcError(error.message, error.code, error.details)
  const r = data as { code: string; expires_at: string }
  const { data: t } = await admin.from('treatments').select('name').eq('id', p.data.treatmentId).maybeSingle()
  return ok({ code: r.code, startsAt: p.data.startsAt, treatment: (t as { name: string } | null)?.name ?? '', checkinUrl: `${publicEnv().siteUrl}/c/${token}`, checkinExpiresAt: r.expires_at })
}
