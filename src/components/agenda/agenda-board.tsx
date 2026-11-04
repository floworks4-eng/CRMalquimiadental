'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, List, Search, MoreHorizontal, ArrowRight, Clock3 } from 'lucide-react'
import { StatusChip } from '../chips'
import { Avatar, PageHeader } from '../ui'
import type { DialogPreset } from './appointment-dialog'
import { ClinicCalendar } from './clinic-calendar'
import { addDays, formatTime, localDate, todayLaPaz, zonedToUtcIso } from '@/lib/domain/time'
import { calendarDateLabel, moveMonth, startOfWeek, toCalendarEvent, type AgendaView, type CalendarCreateSlot } from '@/lib/domain/calendar'
import { can, type Role } from '@/server/auth/permissions'
import type { AppointmentCard, CalendarBoard } from '@/server/queries/types'
import type { AppointmentStatus } from '@/lib/domain/status'

const AppointmentDialog = dynamic(() => import('./appointment-dialog').then((mod) => mod.AppointmentDialog), {
  loading: () => <p role="status" aria-live="polite" aria-busy="true" className="text-sm text-muted">Cargando nueva cita…</p>,
})
const AppointmentPanel = dynamic(() => import('./appointment-panel').then((mod) => mod.AppointmentPanel), {
  loading: () => <p role="status" aria-live="polite" aria-busy="true" className="text-sm text-muted">Cargando detalles de la cita…</p>,
})

const FILTERS: { id: string; label: string; statuses: AppointmentStatus[] | null }[] = [
  { id: 'todas', label: 'Todas las citas', statuses: null },
  { id: 'pendientes', label: 'Por llegar', statuses: ['scheduled', 'confirmed'] },
  { id: 'espera', label: 'Sala de espera', statuses: ['checked_in'] },
  { id: 'atencion', label: 'En consulta', statuses: ['in_progress'] },
  { id: 'atendidas', label: 'Atendidas', statuses: ['completed'] },
]
const VIEWS = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'list', label: 'Lista' },
] as const
const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function AgendaBoard({
  board,
  role,
  userId,
  view,
  filter,
  selectedId,
  createInitially,
}: {
  board: CalendarBoard
  role: Role
  userId: string
  view: AgendaView
  filter: string
  selectedId?: string
  createInitially?: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [dentist, setDentist] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AppointmentCard | null>(null)
  const canCreate = can(role, 'agenda.manage')
  const [creating, setCreating] = useState<DialogPreset | null>(() => (createInitially && canCreate ? { date: board.date } : null))
  const linked = selectedId ? (board.appointments.find((a) => a.id === selectedId) ?? null) : null
  const currentAppointment = selected ?? linked
  const currentFilter = FILTERS.find((value) => value.id === filter) ?? FILTERS[0]
  const appointments = board.appointments.filter(
    (a) => (!dentist || a.dentist.id === dentist) && normalize(a.patient?.fullName ?? 'Paciente').includes(normalize(query)),
  )
  const dayAppointments = appointments.filter((a) => localDate(a.startsAt) === board.date)
  const list = dayAppointments.filter((a) => !currentFilter.statuses || currentFilter.statuses.includes(a.status))
  const providers = board.dentists.filter((d) => role !== 'dentist' || d.id === userId)
  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    startTransition(() => router.push(`/agenda?${next}`, { scroll: false }))
  }
  const goDay = (date: string) => go({ date, cita: null, nueva: null })
  const chooseView = (mode: AgendaView) => go({ view: mode, vista: null, cita: null, nueva: null })
  const move = (direction: number) =>
    goDay(view === 'month' ? moveMonth(board.date, direction) : addDays(board.date, direction * (view === 'week' ? 7 : 1)))
  const closePanel = () => {
    setSelected(null)
    if (selectedId) go({ cita: null })
  }
  const refresh = () => {
    closePanel()
    router.refresh()
  }
  const newAt = (slot: CalendarCreateSlot) => {
    if (!canCreate) return
    setCreating({
      date: slot.date,
      ...(slot.start ? { startsAt: zonedToUtcIso(slot.date, slot.start) } : {}),
      cabinetId: slot.cabinetId,
      dentistId: role === 'dentist' ? userId : dentist || undefined,
    })
  }
  const month = calendarDateLabel(board.date, { month: 'long' })
  const period =
    view === 'week'
      ? `${calendarDateLabel(startOfWeek(board.date), { day: 'numeric', month: 'short' })} – ${calendarDateLabel(addDays(startOfWeek(board.date), 6), { day: 'numeric', month: 'short' })}`
      : view === 'month'
        ? 'Calendario mensual'
        : calendarDateLabel(board.date, { weekday: 'long', day: 'numeric' })

  useEffect(() => {
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'visible') router.refresh()
      },
      view === 'list' ? 10_000 : 30_000,
    )
    return () => clearInterval(timer)
  }, [router, view])

  const action = (a: AppointmentCard) => {
    if (can(role, 'encounters.read') && ['checked_in', 'in_progress'].includes(a.status))
      return (
        <Link href={`/consulta/${a.id}`} className="btn btn-primary min-h-9 px-3 py-2 text-xs">
          {a.status === 'in_progress' ? 'Continuar' : 'Atender'}
          <ArrowRight size={14} aria-hidden />
        </Link>
      )
    return (
      <button className="btn btn-secondary min-h-9 px-3 py-2 text-xs" onClick={() => setSelected(a)}>
        {can(role, 'reception.board') && ['scheduled', 'confirmed'].includes(a.status) ? 'Recibir' : 'Ver cita'}
      </button>
    )
  }

  return (
    <div className="fade-in">
      <PageHeader title="Agenda" eyebrow="Tus citas, las llegadas y la atención del equipo en un solo lugar.">
        {canCreate && (
          <button className="btn btn-primary" onClick={() => newAt({ date: board.date < todayLaPaz() ? todayLaPaz() : board.date })}>
            <Plus size={18} aria-hidden />
            Nueva cita
          </button>
        )}
      </PageHeader>
      {board.closedReason && (
        <p role="status" className="mb-4 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm text-gold-soft">
          {board.closedReason}
        </p>
      )}
      <section className={`glass calendar-window ${pending ? 'opacity-75' : ''}`} aria-label="Agenda de citas" aria-busy={pending}>
        <header className="calendar-toolbar">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="whitespace-nowrap text-xl capitalize tracking-tight sm:text-2xl">
                <span className="font-semibold">{month}</span> <span className="font-light text-muted">{board.date.slice(0, 4)}</span>
              </h2>
              <p className="mt-1 text-xs capitalize text-muted">{period}</p>
            </div>
            <label className="relative grid h-9 w-9 place-items-center rounded-full bg-white/5">
              <CalendarDays size={16} className="text-gold" aria-hidden />
              <span className="sr-only">Fecha de la agenda</span>
              <input
                aria-label="Fecha de la agenda"
                type="date"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={board.date}
                onChange={(e) => {
                  if (e.target.value) goDay(e.target.value)
                }}
              />
            </label>
          </div>
          <div className="calendar-navigation">
            <button className="calendar-arrow" disabled={pending} aria-label="Período anterior" onClick={() => move(-1)}>
              <ChevronLeft size={17} />
            </button>
            <button
              className="min-h-8 rounded-full px-3 text-xs font-medium text-gold-soft hover:bg-white/5"
              onClick={() => goDay(todayLaPaz())}
            >
              Hoy
            </button>
            <button className="calendar-arrow" disabled={pending} aria-label="Período siguiente" onClick={() => move(1)}>
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="calendar-segments" role="group" aria-label="Vista de agenda">
            {VIEWS.map((mode) => (
              <button key={mode.id} className="calendar-segment" aria-pressed={view === mode.id} onClick={() => chooseView(mode.id)}>
                {mode.id === 'list' && <List size={13} aria-hidden />}
                {mode.label}
              </button>
            ))}
          </div>
        </header>
        <div className="calendar-filters">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="group" aria-label="Filtrar citas por estado">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className="filter-chip min-h-8 px-2.5 py-1.5 text-[0.7rem]"
                aria-pressed={currentFilter.id === f.id}
                onClick={() => go({ view: 'list', vista: f.id === 'todas' ? null : f.id, cita: null, nueva: null })}
              >
                {f.label}
                <span className="filter-count h-[19px] min-w-[19px] text-[0.6rem]">
                  {dayAppointments.filter((a) => !f.statuses || f.statuses.includes(a.status)).length}
                </span>
              </button>
            ))}
          </div>
          <label className="relative w-full sm:w-44">
            <Search size={14} className="absolute left-3 top-3 text-muted" aria-hidden />
            <span className="sr-only">Buscar paciente en las citas</span>
            <input
              className="field min-h-9 rounded-full border-white/10 bg-black/10 py-2 pl-9 text-xs"
              placeholder="Buscar paciente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {(view === 'list' || role !== 'dentist') && (
          <div
            className={`flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3 ${view !== 'list' ? 'xl:hidden' : ''}`}
          >
            <p className="text-xs text-muted">
              {view === 'list' ? `${calendarDateLabel(board.date, { dateStyle: 'short' })} · ${list.length} citas` : ''}
            </p>
            {role !== 'dentist' && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="sr-only">Profesional</span>
                <select
                  aria-label="Profesional"
                  className="rounded-lg bg-transparent p-1.5 text-xs text-bone"
                  value={dentist}
                  onChange={(e) => setDentist(e.target.value)}
                >
                  <option value="">Todo el equipo</option>
                  {providers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {view !== 'list' &&
          (board.cabinets.length ? (
            <ClinicCalendar
              key={`${board.date}:${view}`}
              cabinets={board.cabinets}
              providers={providers}
              daysInfo={board.days}
              date={board.date}
              view={view}
              appointments={appointments.map(toCalendarEvent)}
              dentist={dentist}
              canCreate={canCreate}
              onDentistChange={setDentist}
              onDateChange={goDay}
              onOpenDay={(date) => go({ date, view: 'day', vista: null })}
              onSelect={(event) => setSelected(board.appointments.find((a) => a.id === event.id) ?? null)}
              onCreate={newAt}
            />
          ) : (
            <div className="empty-state">
              <CalendarDays size={28} className="text-gold" aria-hidden />
              <p>No hay consultorios activos.</p>
              {role === 'clinic_admin' && (
                <Link href="/configuracion?tab=horarios" className="btn btn-secondary text-xs">
                  Configurar consultorios
                </Link>
              )}
            </div>
          ))}
        {view === 'list' && (
          <div>
            <div className="hidden grid-cols-[70px_minmax(0,1.7fr)_minmax(120px,1fr)_minmax(120px,1fr)_140px] gap-4 border-y border-white/6 bg-white/2 px-6 py-3 text-[0.65rem] uppercase tracking-wider text-muted xl:grid">
              <span>Hora</span>
              <span>Paciente</span>
              <span>Profesional</span>
              <span>Estado</span>
              <span className="text-right">Acciones</span>
            </div>
            {list.map((a) => (
              <article
                key={a.id}
                className={`appointment-row ${['cancelled', 'no_show'].includes(a.status) ? 'opacity-60' : ''}`}
                aria-label={`Cita de ${a.patient?.fullName ?? 'Paciente'} a las ${formatTime(a.startsAt)}`}
              >
                <div className="self-start pt-1 sm:self-center sm:pt-0">
                  <p className="num text-sm font-semibold">{formatTime(a.startsAt)}</p>
                  <p className="mt-1 text-[0.65rem] text-muted">
                    {Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000)} min
                  </p>
                </div>
                <Link href={a.patient ? `/pacientes/${a.patient.id}` : '#'} className="flex min-w-0 items-center gap-3">
                  <span className="hidden sm:block">
                    <Avatar name={a.patient?.fullName ?? 'Paciente'} size={42} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium sm:truncate">{a.patient?.fullName ?? 'Paciente'}</span>
                    <span className="mt-1 block truncate text-xs text-muted">{a.treatment?.name ?? 'Sin tratamiento'}</span>
                    <span className="mt-1.5 block xl:hidden">
                      <StatusChip status={a.status} />
                    </span>
                  </span>
                </Link>
                <div className="appointment-detail min-w-0">
                  <p className="truncate text-xs">{a.dentist.fullName}</p>
                  <p className="mt-1 text-xs text-muted">{a.cabinet.name}</p>
                </div>
                <div className="appointment-detail">
                  <StatusChip status={a.status} />
                </div>
                <div className="appointment-actions flex items-center justify-end gap-1 sm:gap-2">
                  {action(a)}
                  <button
                    className="btn btn-ghost min-h-9 px-2"
                    onClick={() => setSelected(a)}
                    aria-label={`Detalles de la cita de ${a.patient?.fullName ?? 'Paciente'}`}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              </article>
            ))}
            {!list.length && (
              <div className="empty-state">
                <span className="icon-tile">
                  <CalendarDays size={24} aria-hidden />
                </span>
                <h3 className="font-semibold">
                  {query ? 'No encontramos esa cita' : filter === 'espera' ? 'La sala de espera está vacía' : 'No hay citas en esta vista'}
                </h3>
                <p className="max-w-sm text-sm text-muted">Prueba otra fecha o cambia el filtro para consultar más citas.</p>
                <button className="btn btn-secondary text-xs" onClick={() => go({ view: 'day', vista: null })}>
                  Volver al calendario
                </button>
              </div>
            )}
          </div>
        )}
        <footer className="flex flex-wrap justify-between gap-3 border-t border-white/10 bg-white/2 px-5 py-3 text-[0.65rem] text-muted">
          <p className="flex items-center gap-1.5">
            <Clock3 size={12} aria-hidden />
            {board.hours ? `${board.hours.opens}–${board.hours.closes} · La Paz` : 'Horario según el día seleccionado'}
          </p>
          <p>Selecciona una cita para ver sus acciones</p>
        </footer>
      </section>
      {creating && <AppointmentDialog
        open={!!creating}
        onClose={() => {
          setCreating(null)
          if (createInitially) go({ nueva: null })
        }}
        options={board}
        preset={creating}
        onCreated={() => {
          setCreating(null)
          if (createInitially) go({ nueva: null })
          router.refresh()
        }}
      />}
      {currentAppointment && <AppointmentPanel appointment={currentAppointment} role={role} onClose={closePanel} onChanged={refresh} />}
    </div>
  )
}
