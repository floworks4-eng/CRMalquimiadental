import Link from 'next/link'
import { Suspense } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  CalendarPlus,
  Users,
  Wallet,
  Clock3,
  CheckCircle2,
  Circle,
  Package,
  Sun,
  ChevronRight,
} from 'lucide-react'
import { Avatar } from '@/components/ui'
import { StatusChip } from '@/components/chips'
import { requireMember } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'
import { getDashboard } from '@/server/queries/dashboard'
import { formatBs } from '@/lib/domain/money'
import { formatDayLong, formatTime } from '@/lib/domain/time'
import { PatientInsights } from '@/components/dashboard/patient-insights'

export const metadata = { title: 'Mi día · Alquimia Dental' }

export default async function InicioPage() {
  const s = await requireMember()
  const role = s.member.role
  const d = await getDashboard()
  const active = d.appointments.filter((a) => !['cancelled', 'no_show'].includes(a.status))
  const waiting = active
    .filter((a) => a.status === 'checked_in')
    .sort((a, b) => (a.checkedInAt ?? a.startsAt).localeCompare(b.checkedInAt ?? b.startsAt))
  const inCare = active.filter((a) => a.status === 'in_progress')
  const upcoming = active.filter((a) => ['scheduled', 'confirmed'].includes(a.status))
  const done = active.filter((a) => a.status === 'completed').length
  const featured = inCare.find((a) => a.dentist.id === s.userId) ?? waiting[0] ?? upcoming[0] ?? inCare[0]
  const firstName = (s.fullName ?? '').split(' ').find((w) => !/^(dr|dra)\.?$/i.test(w)) ?? ''
  const hour = Number(formatTime(new Date().toISOString()).slice(0, 2))
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const clinical = can(role, 'encounters.read')
  const progress = active.length ? Math.round((done / active.length) * 100) : 0
  const flow = [
    { label: 'Por llegar', count: upcoming.length, filter: 'pendientes', color: '#d7b56d' },
    { label: 'En espera', count: waiting.length, filter: 'espera', color: '#e9c988' },
    { label: 'En consulta', count: inCare.length, filter: 'atencion', color: '#afb9d2' },
    { label: 'Atendidos', count: done, filter: 'atendidas', color: '#a4cab4' },
  ]
  const target =
    featured && clinical && ['checked_in', 'in_progress'].includes(featured.status)
      ? `/consulta/${featured.id}`
      : featured
        ? `/agenda?cita=${featured.id}`
        : '/agenda'

  return (
    <div className="fade-in">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-muted">
            <Sun size={17} className="text-gold" aria-hidden />
            {formatDayLong(d.date)}
          </p>
          <h1 className="title-gold text-[2rem] md:text-[2.4rem]">
            {greeting}
            {firstName ? `, ${firstName}` : ''}
            <span className="text-gold">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted">Un vistazo a tu clínica. Todo listo para empezar.</p>
        </div>
        {can(role, 'agenda.manage') && (
          <Link href="/agenda?nueva=1" className="btn btn-primary">
            <CalendarPlus size={18} aria-hidden />
            Agendar una cita
          </Link>
        )}
      </div>
      <section className="mb-7 grid grid-cols-4 gap-2 sm:gap-3" aria-label="El día en números">
        {flow.map((item) => (
          <Link
            key={item.filter}
            href={`/agenda?view=list&vista=${item.filter}`}
            className="glass group flex items-center justify-between gap-2 px-2.5 py-3.5 transition-colors hover:border-gold/30 sm:px-4 sm:py-4 md:px-5"
          >
            <div>
              <p className="flex items-center gap-1.5 whitespace-nowrap text-[0.6rem] text-muted sm:text-xs">
                <span className="hidden h-1.5 w-1.5 rounded-full sm:inline-block" style={{ background: item.color }} aria-hidden />
                {item.label}
              </p>
              <p className="num mt-2 text-2xl font-semibold sm:text-3xl">{String(item.count).padStart(2, '0')}</p>
            </div>
            <ArrowUpRight size={17} className="hidden text-muted group-hover:text-gold sm:block" aria-hidden />
          </Link>
        ))}
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,1fr)]">
        <section className="glass home-patient overflow-hidden p-5 sm:p-7" aria-labelledby="next-patient">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 id="next-patient" className="flex items-center gap-2 text-sm font-medium">
              <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
              {featured?.status === 'in_progress' ? 'Consulta en curso' : 'Tu siguiente paciente'}
            </h2>
            <span className="rounded-full bg-white/6 px-2.5 py-1 text-[0.65rem] text-gold-soft">HOY</span>
          </div>
          {featured ? (
            <>
              <div className="flex items-center gap-4 sm:gap-5">
                <Avatar name={featured.patient?.fullName ?? 'Paciente'} size={68} />
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold tracking-tight sm:text-[1.65rem]">{featured.patient?.fullName ?? 'Paciente'}</h3>
                  <p className="mt-1.5 text-sm text-muted">{featured.treatment?.name ?? 'Sin tratamiento'}</p>
                  <div className="mt-3">
                    <StatusChip status={featured.status} />
                  </div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
                <div>
                  <p className="text-[0.7rem] text-muted">Hora de la cita</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                    <Clock3 size={14} className="text-muted" aria-hidden />
                    {formatTime(featured.startsAt)}
                    <span className="text-xs font-normal text-muted">
                      · {Math.round((new Date(featured.endsAt).getTime() - new Date(featured.startsAt).getTime()) / 60000)} min
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[0.7rem] text-muted">Consultorio</p>
                  <p className="mt-1 text-sm font-medium">{featured.cabinet.name}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[0.7rem] text-muted">Profesional</p>
                  <p className="mt-1 text-sm font-medium">{featured.dentist.fullName}</p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href={target} className="btn btn-primary">
                  {clinical && featured.status === 'in_progress'
                    ? 'Continuar consulta'
                    : clinical && featured.status === 'checked_in'
                      ? 'Atender paciente'
                      : can(role, 'reception.board')
                        ? 'Recibir paciente'
                        : 'Ver cita'}
                  <ArrowRight size={17} aria-hidden />
                </Link>
                {featured.patient && (
                  <Link href={`/pacientes/${featured.patient.id}`} className="btn btn-ghost">
                    Ver ficha
                    <ArrowUpRight size={16} aria-hidden />
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-[245px] flex-col items-start justify-center">
              <span className="icon-tile mb-4">
                <CheckCircle2 size={28} aria-hidden />
              </span>
              <h3 className="text-2xl font-semibold">Todo al día</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                No hay pacientes pendientes para hoy. Puedes consultar la agenda o programar una nueva cita.
              </p>
              <Link href="/agenda" className="btn btn-primary mt-5">
                Abrir agenda
                <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          )}
        </section>
        <section aria-labelledby="quick-actions">
          <h2 id="quick-actions" className="section-heading mb-4">
            ¿Qué necesitas hacer?
          </h2>
          <div className="grid gap-3">
            <Link href="/agenda?nueva=1" className="quick-action">
              <span className="icon-tile">
                <CalendarPlus size={22} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Nueva cita</span>
                <span className="mt-1 block text-xs text-muted">Reserva un horario en la agenda</span>
              </span>
              <ChevronRight size={17} className="text-muted" aria-hidden />
            </Link>
            <Link href="/pacientes" className="quick-action">
              <span className="icon-tile">
                <Users size={22} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Buscar un paciente</span>
                <span className="mt-1 block text-xs text-muted">Abre su ficha e historial</span>
              </span>
              <ChevronRight size={17} className="text-muted" aria-hidden />
            </Link>
            {can(role, 'cash.read') ? (
              <Link href="/caja" className="quick-action">
                <span className="icon-tile">
                  <Wallet size={22} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Registrar un pago</span>
                  <span className="mt-1 block text-xs text-muted">Cobros y movimientos de caja</span>
                </span>
                <ChevronRight size={17} className="text-muted" aria-hidden />
              </Link>
            ) : (
              <Link href="/agenda?view=list&vista=espera" className="quick-action">
                <span className="icon-tile">
                  <Users size={22} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Sala de espera</span>
                  <span className="mt-1 block text-xs text-muted">Pacientes listos para su consulta</span>
                </span>
                <ChevronRight size={17} className="text-muted" aria-hidden />
              </Link>
            )}
          </div>
        </section>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,1fr)]">
        <section className="glass p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-heading">Así va tu día</h2>
            <Link href="/agenda" className="flex items-center gap-1 text-xs text-gold">
              Ver agenda
              <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
          <div className="mt-5 flex items-end justify-between">
            <p className="text-sm text-muted">
              <span className="text-xl font-semibold text-bone">{done}</span> de {active.length} pacientes atendidos
            </p>
            <span className="num text-sm text-gold">{progress}%</span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-white/5"
            role="progressbar"
            aria-label="Pacientes atendidos hoy"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-gold" style={{ width: `${progress}%` }} />
          </div>
          <Link href="/inventario" className="mt-6 flex items-start gap-3 rounded-xl bg-white/3 p-3.5">
            <Package size={18} className="mt-0.5 text-gold" aria-hidden />
            <span>
              <span className="block text-sm">{d.lowStock.length ? `${d.lowStock.length} insumos por reponer` : 'Inventario al día'}</span>
              <span className="mt-1 block text-xs text-muted">
                {d.lowStock.length
                  ? d.lowStock
                      .slice(0, 2)
                      .map((x) => x.name)
                      .join(' · ')
                  : 'Los insumos están por encima de su mínimo'}
              </span>
            </span>
            <ArrowRight size={15} className="ml-auto mt-1 text-muted" aria-hidden />
          </Link>
        </section>
        {d.money ? (
          <section className="glass p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="section-heading">Caja de hoy</h2>
              <Wallet size={19} className="text-gold" aria-hidden />
            </div>
            <p className="num mt-5 text-3xl font-semibold">{formatBs(d.money.incomeTodayCents)}</p>
            <p className="mt-1.5 text-xs text-muted">Ingresos de hoy · {d.money.cashOpen ? 'Caja abierta' : 'Caja cerrada'}</p>
            <p className="mt-4 text-xs text-muted">
              Por cobrar: <span className="font-medium text-gold-soft">{formatBs(d.money.pendingCents)}</span>
            </p>
            <Link href="/caja" className="mt-5 flex items-center justify-between border-t border-white/8 pt-4 text-sm text-gold">
              Ver movimientos
              <ArrowUpRight size={17} aria-hidden />
            </Link>
          </section>
        ) : (
          <section className="glass p-5 sm:p-6">
            <span className="icon-tile mb-4">
              <Users size={22} aria-hidden />
            </span>
            <h2 className="section-heading">Tu espacio clínico</h2>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-muted">
              El historial y el plan de tratamiento de cada paciente están en su ficha.
            </p>
            <Link href="/pacientes" className="flex items-center gap-2 text-sm text-gold">
              Ver mis pacientes
              <ArrowRight size={16} aria-hidden />
            </Link>
          </section>
        )}
      </div>
      <Suspense fallback={<section className="glass mt-6 p-5 text-sm text-muted" role="status">Cargando estadísticas de pacientes…</section>}>
        <PatientInsights />
      </Suspense>
      {d.setup && <SetupSteps setup={d.setup} />}
    </div>
  )
}

function SetupSteps({ setup }: { setup: NonNullable<Awaited<ReturnType<typeof getDashboard>>['setup']> }) {
  const steps = [
    { done: setup.hoursReviewed, label: 'Revisa el horario y los consultorios', href: '/configuracion?tab=horarios' },
    { done: setup.treatments > 0, label: 'Carga tus tratamientos y precios', href: '/configuracion?tab=tratamientos' },
    { done: setup.supplies > 0, label: 'Carga los insumos y su stock', href: '/inventario' },
    { done: setup.members > 1, label: 'Crea las cuentas de tu equipo', href: '/configuracion?tab=equipo' },
    { done: setup.patients > 0, label: 'Importa tus pacientes y su historial', href: '/configuracion?tab=importar' },
  ]
  return (
    <details className="glass mt-6 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Primeros pasos{' '}
        <span className="ml-2 text-xs font-normal text-muted">
          {steps.filter((step) => step.done).length} de {steps.length} completos
        </span>
      </summary>
      <ol className="mt-4 space-y-2">
        {steps.map((step, i) => (
          <li key={step.href}>
            <Link href={step.href} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-white/5">
              {step.done ? (
                <CheckCircle2 size={18} className="text-ok" aria-label="Hecho" />
              ) : (
                <Circle size={18} className="text-muted" aria-label="Pendiente" />
              )}
              <span className={step.done ? 'text-muted line-through' : 'text-bone'}>
                {i + 1}. {step.label}
              </span>
              {!step.done && <ArrowRight size={14} className="ml-auto text-gold" aria-hidden />}
            </Link>
          </li>
        ))}
      </ol>
    </details>
  )
}
