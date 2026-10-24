import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { MapPin } from 'lucide-react'
import { BookingFlow } from '@/components/booking/booking-flow'
import { Notice, PublicShell } from '@/components/public-shell'
import { SupabaseMissing } from '@/components/auth-card'
import { hasPublicBackend } from '@/server/env'
import { getBookableTreatments, getLegalTexts, getPublicClinic } from '@/server/public/context'

export const metadata: Metadata = {
  title: 'Reservar cita · Alquimia Dental',
  description: 'Agenda tu cita en Alquimia Dental (San Miguel, La Paz): elige el tratamiento, el día y la hora.',
  openGraph: { title: 'Reservar cita · Alquimia Dental', description: 'Agenda tu cita en línea.' },
}
export const dynamic = 'force-dynamic'

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

export default async function ReservarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!hasPublicBackend()) return <SupabaseMissing />
  const clinic = await getPublicClinic()
  if (!clinic) return <PublicShell><Notice title="Reservas no disponibles">Por ahora no se puede reservar en línea. Llama a la clínica, por favor.</Notice></PublicShell>

  const [treatments, legal, sp, h] = await Promise.all([getBookableTreatments(clinic.id), getLegalTexts(clinic.id), searchParams, headers()])
  const data = legal.find((t) => t.type === 'data_processing')
  if (!data || (data.draft && !clinic.allow_draft_legal)) {
    return <PublicShell><Notice title="Reservas no disponibles">Las reservas en línea se habilitan pronto. Mientras tanto, llama a la clínica.</Notice></PublicShell>
  }

  // Atribucion: parametros UTM del anuncio y el sitio de origen (solo el dominio, sin la ruta ni datos de la URL).
  const utm: Record<string, string> = { landing_path: '/reservar' }
  for (const k of UTM) {
    const v = sp[k]
    if (typeof v === 'string' && v) utm[k] = v.slice(0, 100)
  }
  try {
    const ref = h.get('referer')
    if (ref) utm.referrer = new URL(ref).origin
  } catch {}

  return (
    <PublicShell wide>
      <div className="mb-8 text-center">
        <h1 className="title-gold text-4xl md:text-5xl">Agenda tu cita</h1>
        <p className="mt-2 text-muted">Elige el tratamiento, el día y la hora.</p>
        {clinic.address && <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted"><MapPin size={13} className="text-gold" aria-hidden />{clinic.address}</p>}
      </div>
      <BookingFlow treatments={treatments} utm={utm} consentText={data.body} whatsappAvailable={legal.some((t) => t.type === 'whatsapp_reminders')} />
    </PublicShell>
  )
}
