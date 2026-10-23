import type { Metadata } from 'next'
import { AppShell, type NavItem } from '@/components/app-shell'
import { requireMember } from '@/server/auth/guards'
import { can, ROLE_LABEL } from '@/server/auth/permissions'
import { listNotifications } from '@/server/actions/agenda'

export const metadata: Metadata = { title: 'Alquimia Dental', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireMember()
  const r = s.member.role
  // El menu muestra lo que el rol puede usar; la autoridad real es el servidor y RLS.
  const items: NavItem[] = [
    ...(can(r, 'agenda.read_all') || can(r, 'agenda.read_own') ? [{ href: '/agenda', label: 'Agenda', icon: 'agenda' as const }] : []),
    ...(can(r, 'patients.read_directory') ? [{ href: '/pacientes', label: 'Pacientes', icon: 'pacientes' as const }] : []),
    ...(can(r, 'checkin.issue') ? [{ href: '/recepcion', label: 'Recepción', icon: 'recepcion' as const }] : []),
    { href: '/cuenta', label: 'Mi cuenta', icon: 'cuenta' as const },
  ]
  return (
    <AppShell user={{ name: s.fullName ?? s.email ?? 'Usuario', roleLabel: ROLE_LABEL[r] }} clinic={s.member.clinicName} items={items} notifications={await listNotifications()}>
      {children}
    </AppShell>
  )
}
