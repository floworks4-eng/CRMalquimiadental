import Link from 'next/link'
import { AuthCard, SupabaseMissing } from '@/components/auth-card'
import { AcceptInviteForm } from '@/components/auth-forms'
import { hasSupabaseEnv } from '@/server/env'
import { peekInvite } from '@/server/actions/members'
import { ROLE_LABEL, type Role } from '@/server/auth/permissions'

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  if (!hasSupabaseEnv()) return <SupabaseMissing />
  const { token } = await params
  const invite = await peekInvite(token)
  if (!invite) {
    return (
      <AuthCard title="Enlace no disponible" subtitle="Venció, ya se usó o no es válido.">
        <p className="text-sm text-muted">Pide una invitación nueva al administrador de la clínica.</p>
        <p className="mt-4 text-sm"><Link href="/login" className="text-gold-soft hover:underline">Ir a ingresar</Link></p>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Te invitaron a Alquimia Dental" subtitle={`${invite.clinicName} · ${ROLE_LABEL[invite.role as Role] ?? invite.role}`}>
      <AcceptInviteForm token={token} email={invite.email} />
    </AuthCard>
  )
}
