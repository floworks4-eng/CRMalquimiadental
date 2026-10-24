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

export async function requireMember() {
  const s = await requireSession()
  if (!s.member) redirect('/forbidden')
  return s as Session & { member: Member }
}

export async function requireCapability(cap: Capability) {
  const s = await requireMember()
  if (!can(s.member.role, cap)) redirect('/forbidden')
  return s
}
