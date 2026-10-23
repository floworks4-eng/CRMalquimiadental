import 'server-only'
import { redirect } from 'next/navigation'
import { getSession, type Session } from './session'
import { can, type Capability } from './permissions'

type Member = NonNullable<Session['member']>

export async function requireSession() {
  const s = await getSession()
  if (!s) redirect('/login')
  return s
}

/** Sin segundo factor verificado no hay acceso a nada operativo. */
export async function requireMfa() {
  const s = await requireSession()
  if (s.aal !== 'aal2') redirect('/mfa')
  return s
}

export async function requireMember() {
  const s = await requireMfa()
  if (!s.member) redirect('/forbidden')
  return s as Session & { member: Member }
}

export async function requireCapability(cap: Capability) {
  const s = await requireMember()
  if (!can(s.member.role, cap)) redirect('/forbidden')
  return s
}
