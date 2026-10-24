'use server'
import { redirect } from 'next/navigation'
import { createClient } from '../supabase/server'
import { createAdminClient } from '../supabase/admin'
import { fail, fieldErrors, type ActionResult } from '../errors'
import { setupSchema } from '../schemas/auth'
import { HOME } from '../auth/home'

// Sistema exclusivo de Alquimia Dental: el nombre no se pregunta.
const CLINIC_NAME = 'Alquimia Dental'

/** ¿Falta crear la clinica? Solo entonces existe /configuracion-inicial. */
export async function needsSetup() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false
  // Ante cualquier error se responde "no": la pantalla de primer arranque nunca se abre por accidente.
  const { data, error } = await createAdminClient().rpc('is_setup_done').then((r) => r, () => ({ data: null, error: true }))
  return !error && data === false
}

/**
 * Primer arranque: crea la cuenta del administrador (el Doc) y la clinica. Se cierra sola cuando ya existe una clinica
 * (la funcion setup_clinic lo vuelve a comprobar con un bloqueo, por si dos personas envian a la vez).
 */
export async function setupClinic(input: unknown): Promise<ActionResult> {
  const p = setupSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  if (!(await needsSetup())) return fail('CONFLICT', 'La clínica ya está configurada. Ingresa con tu cuenta.')

  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: p.data.email, password: p.data.password, email_confirm: true, user_metadata: { full_name: p.data.fullName },
  })
  if (error || !created.user) return fail('CONFLICT', 'No pudimos crear la cuenta con ese correo.', { email: 'Ese correo no se puede usar.' })

  const { error: rpcError } = await admin.rpc('setup_clinic', { p_user: created.user.id, p_clinic_name: CLINIC_NAME, p_full_name: p.data.fullName })
  if (rpcError) {
    // Sin clinica, la cuenta no sirve: se deshace para poder reintentar con el mismo correo.
    await admin.from('profiles').delete().eq('id', created.user.id)
    await admin.auth.admin.deleteUser(created.user.id)
    return fail(rpcError.message === 'ALREADY_SETUP' ? 'CONFLICT' : 'INTERNAL', rpcError.message === 'ALREADY_SETUP' ? 'La clínica ya está configurada. Ingresa con tu cuenta.' : 'No pudimos crear la clínica. Intenta de nuevo.')
  }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: p.data.email, password: p.data.password })
  redirect(signInError ? '/login' : HOME)
}
