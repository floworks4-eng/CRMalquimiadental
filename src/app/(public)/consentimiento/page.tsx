import type { Metadata } from 'next'
import { Notice, PublicShell } from '@/components/public-shell'
import { SupabaseMissing } from '@/components/auth-card'
import { hasPublicBackend } from '@/server/env'
import { getLegalTexts, getPublicClinic } from '@/server/public/context'
import { formatDate } from '@/lib/domain/time'

export const metadata: Metadata = { title: 'Consentimiento · Alquimia Dental' }
export const dynamic = 'force-dynamic'

const TITLE: Record<string, string> = {
  data_processing: 'Autorización de uso de datos',
  clinical_treatment: 'Consentimiento informado',
  whatsapp_reminders: 'Recordatorios por WhatsApp',
  marketing: 'Comunicaciones de la clínica',
}

// Muestra la version vigente de cada texto, con su huella (SHA-256): es exactamente lo que el paciente acepta.
export default async function ConsentimientoPage() {
  if (!hasPublicBackend()) return <SupabaseMissing />
  const clinic = await getPublicClinic()
  const texts = clinic ? await getLegalTexts(clinic.id) : []
  return (
    <PublicShell wide>
      <h1 className="title-gold mb-6 text-4xl">Consentimiento</h1>
      {texts.length === 0 && <Notice title="Sin textos publicados">La clínica todavía no publicó sus textos legales.</Notice>}
      <div className="space-y-5">
        {texts.map((t) => (
          <article key={t.type} className="glass p-5">
            {t.draft && <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn">Borrador pendiente de revisión legal: no válido para pacientes reales.</p>}
            <h2 className="title-gold text-xl">{TITLE[t.type] ?? t.type}</h2>
            <p className="mt-1 text-xs text-muted">Versión {t.version} · vigente desde {formatDate(t.effectiveFrom)}</p>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-bone">{t.body}</p>
            <p className="num mt-3 break-all text-[0.65rem] text-muted">Huella SHA-256: {t.hash}</p>
          </article>
        ))}
      </div>
    </PublicShell>
  )
}
