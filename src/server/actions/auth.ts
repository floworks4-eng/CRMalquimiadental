'use server'
import { redirect } from 'next/navigation'
import { createClient } from '../supabase/server'
import { publicEnv } from '../env'
import { requireSession } from '../auth/guards'
import { HOME } from '../auth/home'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { newPasswordSchema, resetRequestSchema, signInSchema } from '../schemas/auth'


export async function signIn(input: unknown): Promise<ActionResult> {
  const p = signInSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(p.data)
  // Mensaje generico: no revela si el correo existe.
  if (error) return fail('UNAUTHENTICATED', 'Correo o contraseña incorrectos.')
  redirect(HOME)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
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
  redirect(HOME)
}
