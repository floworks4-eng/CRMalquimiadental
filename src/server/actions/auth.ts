'use server'
import { redirect } from 'next/navigation'
import { createClient } from '../supabase/server'
import { publicEnv } from '../env'
import { requireSession } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { mfaEnrollSchema, mfaVerifySchema, newPasswordSchema, resetRequestSchema, signInSchema } from '../schemas/auth'

const HOME = '/cuenta' // TODO(Sprint 2): /inicio cuando exista la pantalla real

export async function signIn(input: unknown): Promise<ActionResult> {
  const p = signInSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(p.data)
  // Mensaje generico: no revela si el correo existe.
  if (error) return fail('UNAUTHENTICATED', 'Correo o contraseña incorrectos.')
  redirect('/mfa')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

/** Estado del segundo factor para decidir que muestra /mfa. */
export async function getMfaState(): Promise<'verified' | 'verify' | 'enroll'> {
  await requireSession()
  const supabase = await createClient()
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel === 'aal2') return 'verified'
  return aal?.nextLevel === 'aal2' ? 'verify' : 'enroll'
}

/** Inicia el alta de TOTP. Descarta intentos previos sin verificar para no acumular factores. */
export async function startMfaEnroll(): Promise<ActionResult<{ factorId: string; qr: string; secret: string }>> {
  await requireSession()
  const supabase = await createClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  for (const f of factors?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Alquimia' })
  if (error || !data) return fail('INTERNAL', 'No pudimos iniciar la verificación en dos pasos. Intenta de nuevo.')
  return ok({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
}

export async function confirmMfaEnroll(input: unknown): Promise<ActionResult> {
  const p = mfaEnrollSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el código.', fieldErrors(p.error.issues))
  await requireSession()
  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: p.data.factorId, code: p.data.code })
  if (error) return fail('VALIDATION', 'Código incorrecto o vencido.', { code: 'Código incorrecto o vencido.' })
  redirect(HOME)
}

export async function verifyMfa(input: unknown): Promise<ActionResult> {
  const p = mfaVerifySchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el código.', fieldErrors(p.error.issues))
  await requireSession()
  const supabase = await createClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const factor = factors?.totp.find((f) => f.status === 'verified')
  if (!factor) return fail('MFA_REQUIRED', 'Primero configura la verificación en dos pasos.')
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: p.data.code })
  if (error) return fail('VALIDATION', 'Código incorrecto o vencido.', { code: 'Código incorrecto o vencido.' })
  redirect(HOME)
}

/** Siempre responde igual, exista o no el correo. */
export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const p = resetRequestSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Escribe un correo válido.', fieldErrors(p.error.issues))
  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(p.data.email, { redirectTo: `${publicEnv().siteUrl}/api/auth/callback?next=/recuperar/nueva` })
  return ok(undefined)
}

export async function updatePassword(input: unknown): Promise<ActionResult> {
  const p = newPasswordSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa la contraseña.', fieldErrors(p.error.issues))
  await requireSession()
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: p.data.password })
  if (error) return fail('VALIDATION', 'No pudimos cambiar la contraseña. Pide un enlace nuevo.')
  redirect('/mfa')
}
