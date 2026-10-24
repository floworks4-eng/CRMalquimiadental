import type { Metadata } from 'next'
import { CheckinForm } from '@/components/checkin/checkin-form'
import { Notice, PublicShell } from '@/components/public-shell'
import { SupabaseMissing } from '@/components/auth-card'
import { hasPublicBackend } from '@/server/env'
import { getCheckinContext } from '@/server/public/context'
import { formatTime } from '@/lib/domain/time'

// El token va en la URL: que no se indexe ni se filtre como "referrer" a otros sitios.
export const metadata: Metadata = { title: 'Check-in · Alquimia Dental', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  if (!hasPublicBackend()) return <SupabaseMissing />
  const { token } = await params
  const ctx = await getCheckinContext(token)
  return (
    <PublicShell>
      {!ctx ? (
        <Notice title="Enlace no disponible">Este enlace ya no es válido: venció, ya se usó o no existe. Pide uno nuevo en recepción.</Notice>
      ) : !ctx.legalReady ? (
        <Notice title="Check-in no disponible">El check-in digital todavía no está habilitado en esta clínica. Pasa por recepción, por favor.</Notice>
      ) : !ctx.inWindow ? (
        <Notice title={`Tu cita es a las ${formatTime(ctx.startsAt)}`}>El check-in se abre 2 horas antes de la cita. Vuelve a abrir este enlace entonces.</Notice>
      ) : (
        <CheckinForm token={token} ctx={ctx} />
      )}
    </PublicShell>
  )
}
