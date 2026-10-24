import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { PageHeader, Stat } from '@/components/ui'
import { StatusChip } from '@/components/chips'
import { requireMember } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'
import { getDashboard } from '@/server/queries/dashboard'
import { formatBs } from '@/lib/domain/money'
import { formatDayLong, formatTime } from '@/lib/domain/time'

export const metadata = { title: 'Inicio · Alquimia Dental' }

export default async function InicioPage() {
  const s = await requireMember()
  const role = s.member.role
  const d = await getDashboard()
  const active = d.appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
  const waiting = active.filter((a) => a.status === 'checked_in')
  const inCare = active.filter((a) => a.status === 'in_progress')
  const done = active.filter((a) => a.status === 'completed')
  const next = active.filter((a) => ['scheduled', 'confirmed', 'checked_in', 'in_progress'].includes(a.status)).slice(0, 8)
  const firstName = (s.fullName ?? '').split(' ').find((w) => !/^(dr|dra)\.?$/i.test(w)) ?? ''
  const consultaHref = (id: string) => (can(role, 'encounters.read') ? `/consulta/${id}` : '/recepcion')

  return (
    <div className="fade-in">
      <PageHeader eyebrow={formatDayLong(d.date)} title={firstName ? `Hola, ${firstName}` : 'Inicio'} />

      {d.setup && <SetupSteps setup={d.setup} />}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Citas hoy" value={active.length} hint={`${done.length} atendidas`} />
        <Stat label="En sala de espera" value={waiting.length} hint={inCare.length ? `${inCare.length} en atención` : undefined} />
        {d.money ? (
          <>
            <Stat label="Ingresos de hoy" value={formatBs(d.money.incomeTodayCents)} hint={d.money.cashOpen ? 'Caja abierta' : 'Caja cerrada'} />
            <Stat label="Por cobrar" value={formatBs(d.money.pendingCents)} hint={`${d.money.pendingCount} facturas con saldo`} />
          </>
        ) : (
          <Stat label="Insumos con stock bajo" value={d.lowStock.length} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="glass p-5" aria-labelledby="next-h">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="next-h" className="title-gold text-lg">{role === 'dentist' ? 'Mis pacientes de hoy' : 'Agenda de hoy'}</h2>
            <Link href="/agenda" className="btn btn-ghost text-xs">Ver agenda <ArrowRight size={14} aria-hidden /></Link>
          </div>
          {next.length === 0 ? (
            <p className="text-sm text-muted">No quedan citas pendientes hoy.</p>
          ) : (
            <ul>
              {next.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 py-2.5 last:border-0">
                  <Link href={consultaHref(a.id)} className="min-w-0 hover:underline">
                    <span className="num text-gold-soft">{formatTime(a.startsAt)}</span> <span className="text-bone">{a.patient?.fullName ?? 'Paciente'}</span>
                    <span className="block text-xs text-muted">{a.treatment?.name ?? '—'} · {a.dentist.fullName}</span>
                  </Link>
                  <StatusChip status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass p-5" aria-labelledby="stock-h">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="stock-h" className="title-gold text-lg">Stock bajo</h2>
            <Link href="/inventario" className="btn btn-ghost text-xs">Inventario <ArrowRight size={14} aria-hidden /></Link>
          </div>
          {d.lowStock.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 size={16} aria-hidden />Todo por encima del mínimo.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {d.lowStock.map((x) => (
                <li key={x.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-bone"><AlertTriangle size={14} className="text-warn" aria-hidden />{x.name}</span>
                  <span className="num text-warn">{x.onHand} / mín. {x.minStock} {x.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function SetupSteps({ setup }: { setup: NonNullable<Awaited<ReturnType<typeof getDashboard>>['setup']> }) {
  const steps = [
    { done: setup.hoursReviewed, label: 'Revisa el horario de atención y los gabinetes', href: '/configuracion?tab=horarios' },
    { done: setup.treatments > 0, label: 'Carga tus tratamientos con sus precios', href: '/configuracion?tab=tratamientos' },
    { done: setup.supplies > 0, label: 'Carga los insumos y su stock', href: '/inventario' },
    { done: setup.members > 1, label: 'Crea las cuentas de tu equipo (odontólogos y recepción)', href: '/configuracion?tab=equipo' },
    { done: setup.patients > 0, label: 'Importa tus pacientes con su historial médico', href: '/configuracion?tab=importar' },
  ]
  return (
    <section className="glass halo relative mb-6 p-5" aria-labelledby="setup-h">
      <h2 id="setup-h" className="title-gold text-lg">Primeros pasos</h2>
      <p className="mt-1 text-sm text-muted">El sistema está vacío y listo. Completa esto una vez y la clínica queda operando.</p>
      <ol className="mt-4 space-y-2">
        {steps.map((st, i) => (
          <li key={st.href}>
            <Link href={st.href} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-white/5">
              {st.done ? <CheckCircle2 size={18} className="text-ok" aria-label="Hecho" /> : <Circle size={18} className="text-muted" aria-label="Pendiente" />}
              <span className={st.done ? 'text-muted line-through' : 'text-bone'}>{i + 1}. {st.label}</span>
              {!st.done && <ArrowRight size={14} className="ml-auto text-gold" aria-hidden />}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
