'use server'
import { createHash, randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { createClient } from '../supabase/server'
import { createAdminClient } from '../supabase/admin'
import { publicEnv } from '../env'
import { requireCapability } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { acceptInviteSchema, inviteSchema } from '../schemas/auth'

const INVITE_HOURS = 72
const hashToken = (token: string) => '\\x' + createHash('sha256').update(token).digest('hex') // bytea para PostgREST

/** El admin crea una invitacion de un solo uso. Devuelve el enlace para compartirlo (WhatsApp o correo). */
export async function inviteMember(input: unknown): Promise<ActionResult<{ inviteUrl: string; expiresAt: string }>> {
  const p = inviteSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const s = await requireCapability('members.manage')

  const token = randomBytes(32).toString('base64url') // 43 caracteres; en la base solo vive su hash
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3_600_000).toISOString()
  const admin = createAdminClient()
  // Una invitacion vigente por correo: las anteriores sin aceptar se invalidan.
  await admin.from('member_invites').delete().eq('clinic_id', s.member.clinicId).eq('email', p.data.email).is('accepted_at', null)
  const { error } = await admin.from('member_invites').insert({
    clinic_id: s.member.clinicId, email: p.data.email, role: p.data.role, token_hash: hashToken(token), expires_at: expiresAt, invited_by: s.userId,
  })
  if (error) return fail('INTERNAL', 'No pudimos crear la invitación.')

  const supabase = await createClient()
  await supabase.rpc('log_event', { p_clinic: s.member.clinicId, p_action: 'member.invite', p_entity_type: 'member_invites', p_meta: { email: p.data.email, role: p.data.role } })
  return ok({ inviteUrl: `${publicEnv().siteUrl}/invitacion/${token}`, expiresAt })
}

/** Datos para mostrar en la pagina de invitacion. null si el enlace no sirve (mismo mensaje en todos los casos). */
export async function peekInvite(token: string): Promise<{ email: string; role: string; clinicName: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('member_invites')
    .select('email, role, expires_at, accepted_at, clinics(name)')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (!data || data.accepted_at || new Date(data.expires_at) <= new Date()) return null
  const clinic = data.clinics as unknown as { name: string } | null
  return { email: data.email, role: data.role, clinicName: clinic?.name ?? '' }
}

/**
 * Publica (el token es la credencial). Crea el usuario de Auth con la contrasena elegida y acepta la
 * invitacion de forma atomica (RPC accept_invite). Si la RPC falla tras crear el usuario, queda una cuenta
 * sin membresia: no da acceso a nada y un admin puede reinvitar.
 */
export async function acceptInvite(input: unknown): Promise<ActionResult> {
  const p = acceptInviteSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const invite = await peekInvite(p.data.token)
  if (!invite) return fail('NOT_FOUND', 'Este enlace ya no está disponible. Pide uno nuevo al administrador.')

  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: invite.email, password: p.data.password, email_confirm: true, user_metadata: { full_name: p.data.fullName },
  })
  if (error || !created.user) {
    return fail('CONFLICT', 'No pudimos crear tu cuenta. Si ya tienes una, inicia sesión o pide ayuda al administrador.')
  }
  const { error: rpcError } = await admin.rpc('accept_invite', { p_token_hash: hashToken(p.data.token), p_user_id: created.user.id })
  if (rpcError) return fail('NOT_FOUND', 'Este enlace ya no está disponible. Pide uno nuevo al administrador.')

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.email, password: p.data.password })
  redirect(signInError ? '/login' : '/mfa') // primer ingreso: enrolar TOTP
}
