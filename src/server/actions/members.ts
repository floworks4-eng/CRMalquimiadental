'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '../supabase/server'
import { createAdminClient } from '../supabase/admin'
import { requireCapability } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { createMemberSchema, memberPasswordSchema } from '../schemas/auth'

/**
 * Solo el administrador crea cuentas: nombre, correo, rol y una contrasena inicial que le entrega a la persona
 * (despues la cambia en «Mi cuenta»). No hay registro publico ni invitaciones.
 */
export async function createMember(input: unknown): Promise<ActionResult> {
  const p = createMemberSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa los datos.', fieldErrors(p.error.issues))
  const s = await requireCapability('members.manage')
  const d = p.data
  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: d.email, password: d.password, email_confirm: true, user_metadata: { full_name: d.fullName },
  })
  if (error || !created.user) {
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists') return fail('CONFLICT', 'Ya existe una cuenta con ese correo.', { email: 'Ya existe una cuenta con ese correo.' })
    return fail('INTERNAL', 'No pudimos crear el usuario. Revisa el correo y la contraseña e intenta de nuevo.')
  }

  const { error: memberError } = await admin.from('clinic_members').insert({
    clinic_id: s.member.clinicId, user_id: created.user.id, role: d.role, title: d.title ?? null,
  })
  if (memberError) {
    // Sin membresia la cuenta no sirve: se deshace para poder reintentar con el mismo correo.
    await admin.from('profiles').delete().eq('id', created.user.id)
    await admin.auth.admin.deleteUser(created.user.id)
    return fail('INTERNAL', 'No pudimos crear la cuenta. Intenta de nuevo.')
  }
  await (await createClient()).rpc('log_event', {
    p_clinic: s.member.clinicId, p_action: 'member.create', p_entity_type: 'clinic_members', p_meta: { email: d.email, role: d.role },
  })
  revalidatePath('/configuracion')
  return ok(undefined)
}

/** El administrador pone una contrasena nueva a alguien del equipo (olvido, o al reactivarlo). */
export async function setMemberPassword(input: unknown): Promise<ActionResult> {
  const p = memberPasswordSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa la contraseña.', fieldErrors(p.error.issues))
  const s = await requireCapability('members.manage')
  const supabase = await createClient()
  // Solo personas de su propia clinica (RLS: el admin ve los miembros de su clinica).
  const { data: m } = await supabase.from('clinic_members').select('user_id').eq('id', p.data.memberId).eq('clinic_id', s.member.clinicId).maybeSingle()
  if (!m) return fail('NOT_FOUND', 'No encontramos a esa persona.')
  const { error } = await createAdminClient().auth.admin.updateUserById(m.user_id as string, { password: p.data.password })
  if (error) return fail('INTERNAL', 'No pudimos cambiar la contraseña.')
  await supabase.rpc('log_event', { p_clinic: s.member.clinicId, p_action: 'member.password_reset', p_entity_type: 'clinic_members', p_entity_id: p.data.memberId })
  return ok(undefined)
}
