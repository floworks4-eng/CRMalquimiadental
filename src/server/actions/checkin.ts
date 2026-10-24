'use server'
import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import { createClient } from '../supabase/server'
import { createAdminClient } from '../supabase/admin'
import { publicEnv } from '../env'
import { requireCapability } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { rpcError } from '../errors-rpc'
import { checkinSchema } from '../schemas/checkin'
import { ipHash, userAgent } from '../public/ip'
import { newToken, tokenHash } from '../public/tokens'
import { decodePngDataUrl } from '../public/signature'
import { z } from 'zod'

/** Recepcion genera el enlace + QR de una cita. Un enlace nuevo invalida el anterior. */
export async function issueCheckinToken(input: unknown): Promise<ActionResult<{ url: string; qrSvg: string; expiresAt: string }>> {
  const p = z.object({ appointmentId: z.uuid() }).safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Cita no válida.')
  await requireCapability('checkin.issue')
  const token = newToken()
  const { data, error } = await (await createClient()).rpc('issue_checkin_token', { p_appointment: p.data.appointmentId, p_token_hash: tokenHash(token) })
  if (error) return rpcError(error.message, error.code, error.details)
  const url = `${publicEnv().siteUrl}/c/${token}`
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#1e1f21', light: '#f2eee6' } })
  return ok({ url, qrSvg, expiresAt: data as string })
}

/**
 * Publica: el enlace es la credencial. Todo pasa por el servidor con service_role; el navegador nunca habla con PostgREST.
 * Orden: limite de intentos -> validar -> subir firma -> RPC atomica -> (si falla) borrar firma.
 */
export async function submitCheckin(input: unknown): Promise<ActionResult> {
  const p = checkinSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const d = p.data
  const png = decodePngDataUrl(d.signature)
  if (!png) return fail('VALIDATION', 'No pudimos leer tu firma. Dibújala de nuevo.', { signature: 'Dibuja tu firma de nuevo.' })

  const admin = createAdminClient()
  const ip = await ipHash()
  const hash = tokenHash(d.token)
  for (const [key, limit, win] of [[`checkin:tok:${hash}`, 5, '10 minutes'], [`checkin:ip:${ip}`, 20, '1 hour']] as const) {
    const { error } = await admin.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window: win })
    if (error) return rpcError(error.message, error.code)
  }

  const { data: target, error: tErr } = await admin.rpc('checkin_target', { p_token_hash: hash })
  if (tErr) return rpcError(tErr.message, tErr.code)
  const t = target as { clinic_id: string; patient_id: string }
  const path = `${t.clinic_id}/${t.patient_id}/${randomUUID()}.png`
  const up = await admin.storage.from('clinical').upload(path, png, { contentType: 'image/png', upsert: false })
  if (up.error) return fail('INTERNAL', 'No pudimos guardar tu firma. Intenta de nuevo.')

  const { error } = await admin.rpc('submit_checkin', {
    p_token_hash: hash,
    p_payload: {
      birth_date: d.birthDate ?? null, emergency_contact_name: d.emergencyContactName, emergency_contact_phone: d.emergencyContactPhone,
      allergies: d.allergies, allergy_other: d.allergyOther ?? null, conditions: d.conditions, medications: d.medications ?? null,
      pregnancy: d.pregnancy, anticoagulants: d.anticoagulants, reason: d.reason, consent_clinical: d.consentClinical, consent_data: d.consentData,
      consent_whatsapp: d.consentWhatsapp, signature_name: d.signatureName, signature_path: path,
    },
    p_ip_hash: ip, p_user_agent: await userAgent(),
  })
  if (error) {
    await admin.storage.from('clinical').remove([path]) // la firma no debe quedar huerfana
    return rpcError(error.message, error.code, error.details)
  }
  return ok(undefined)
}
