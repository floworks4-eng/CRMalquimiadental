import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { StatusChip } from '@/components/chips'
import { requireCapability } from '@/server/auth/guards'
import { getConsultaList } from '@/server/queries/clinical'
import { addDays, formatDayLong, formatTime, todayLaPaz } from '@/lib/domain/time'

export const metadata = { title: 'Consulta · Alquimia Dental' }

const ACTION = { scheduled: 'Iniciar', confirmed: 'Iniciar', checked_in: 'Iniciar', in_progress: 'Continuar', completed: 'Ver' } as const

export default async function ConsultaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const s = await requireCapability('encounters.read')
  const { date } = await searchParams
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayLaPaz()
  const list = await getConsultaList(day)
  const waiting = list.filter((a) => a.status === 'checked_in' || a.status === 'in_progress')
  return (
    <div className="fade-in">
      <PageHeader eyebrow={s.member.role === 'dentist' ? 'Mis pacientes' : 'Todos los odontólogos'} title="Consulta">
        <Link href={`/consulta?date=${addDays(day, -1)}`} className="btn btn-ghost" aria-label="Día anterior">←</Link>
        <Link href="/consulta" className="btn btn-secondary">Hoy</Link>
        <Link href={`/consulta?date=${addDays(day, 1)}`} className="btn btn-ghost" aria-label="Día siguiente">→</Link>
      </PageHeader>
      <p className="mb-4 text-sm text-muted">{formatDayLong(day)} · {waiting.length ? `${waiting.length} en sala o en atención` : 'nadie esperando'}</p>
      <section className="glass p-5">
        {list.length === 0 ? (
          <p className="text-sm text-muted">No hay citas este día.</p>
        ) : (
          <ul>
            {list.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 py-3 last:border-0">
                <span className="min-w-0">
                  <span className="num text-gold-soft">{formatTime(a.startsAt)}</span> <span className="text-bone">{a.patient?.fullName ?? 'Paciente'}</span>
                  <span className="block text-xs text-muted">{a.treatment?.name ?? '—'} · {a.cabinet.name}{s.member.role !== 'dentist' && ` · ${a.dentist.fullName}`}</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusChip status={a.status} />
                  <Link href={`/consulta/${a.id}`} className={`btn px-3 py-1 text-xs ${a.status === 'checked_in' || a.status === 'in_progress' ? 'btn-primary' : 'btn-secondary'}`}>
                    {ACTION[a.status as keyof typeof ACTION] ?? 'Abrir'} <ArrowRight size={13} aria-hidden />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
