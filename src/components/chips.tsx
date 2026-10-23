import { Globe, Megaphone, MessageCircle, Phone, Footprints, Users, Archive } from 'lucide-react'
import { SOURCE_LABEL, STATUS_LABEL, type AppointmentSource, type AppointmentStatus } from '@/lib/domain/status'

const ICON = { whatsapp: MessageCircle, web: Globe, campaign: Megaphone, phone: Phone, walk_in: Footprints, referral: Users, historical: Archive }
export function SourceChip({ source, campaign }: { source: AppointmentSource; campaign?: string | null }) {
  const Icon = ICON[source]
  return (
    <span
      title={campaign ? `Campaña: ${campaign}` : undefined}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap ${
        source === 'campaign' ? 'border-gold/50 text-gold-soft' : source === 'whatsapp' ? 'border-azure/50 text-[#9cc0ff]' : 'border-white/15 text-muted'
      }`}
    >
      <Icon size={12} aria-hidden />
      {SOURCE_LABEL[source]}
    </span>
  )
}

const STYLE: Record<AppointmentStatus, string> = {
  scheduled: 'text-muted border-white/15',
  confirmed: 'text-bone border-white/25',
  checked_in: 'text-warn border-warn/50 bg-warn/10',
  in_progress: 'text-[#9cc0ff] border-azure/60 bg-azure/10',
  completed: 'text-ok border-ok/40 bg-ok/10',
  no_show: 'text-bad border-bad/40',
  cancelled: 'text-muted border-white/10 line-through',
}
// El estado siempre lleva texto y un simbolo: no depende solo del color.
const MARK: Record<AppointmentStatus, string> = { scheduled: '○', confirmed: '●', checked_in: '◐', in_progress: '▶', completed: '✓', no_show: '✕', cancelled: '–' }

export function StatusChip({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap ${STYLE[status]}`}>
      <span aria-hidden>{MARK[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  )
}
