import 'server-only'
import { cache } from 'react'
import { createClient } from '../supabase/server'
import type { Role } from './permissions'

export type Session = {
  userId: string
  email: string | null
  fullName: string | null
  aal: 'aal1' | 'aal2'
  member: { clinicId: string; clinicName: string; role: Role; title: string | null } | null
}

/** Sesion verificada (firma del JWT) + membresia. RLS deja a cada usuario leer su propia membresia aun sin MFA. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null

  const [{ data: profile }, { data: m }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', claims.sub).maybeSingle(),
    supabase.from('clinic_members').select('clinic_id, role, title').eq('user_id', claims.sub).eq('active', true).maybeSingle(),
  ])
  let clinicName = ''
  if (m) {
    const { data: c } = await supabase.from('clinics').select('name').eq('id', m.clinic_id).maybeSingle()
    clinicName = c?.name ?? ''
  }
  return {
    userId: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    fullName: profile?.full_name ?? null,
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
    member: m ? { clinicId: m.clinic_id, clinicName, role: m.role as Role, title: m.title } : null,
  }
})
