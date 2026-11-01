'use client'
import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, List, CalendarDays, MoreHorizontal, ArrowRight, Stethoscope, QrCode, Clock3, Search, SlidersHorizontal, Pencil, MapPin } from 'lucide-react'
import { useDB, visibleAppointments, todayISO, addDays, byId, setCabinetCount, startConsult, can, type Appointment } from '@/lib/data'
import { PageHeader, StatusBadge, Avatar, Modal } from '@/components/ui'
import { AppointmentModal } from '@/components/appointment-modal'
import { ReceptionDialog } from '@/components/reception-dialog'
import { ClinicCalendar, moveMonth, startOfWeek, type CalendarView } from '@/components/clinic-calendar'

const FILTERS = [
  { id: 'todas', label: 'Todas las citas', statuses: null },
  { id: 'pendientes', label: 'Por llegar', statuses: ['agendada', 'confirmada'] },
  { id: 'espera', label: 'Sala de espera', statuses: ['en_espera'] },
  { id: 'atencion', label: 'En consulta', statuses: ['en_atencion'] },
  { id: 'atendidas', label: 'Atendidas', statuses: ['atendida'] },
] as const
const VIEWS = [{ id: 'day', label: 'Día' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mes' }, { id: 'list', label: 'Lista' }] as const

type View = CalendarView | 'list'
export default function AgendaPage() {
  return <Suspense fallback={<p className="p-6 text-muted">Preparando agenda…</p>}><Agenda /></Suspense>
}

function Agenda() {
  const db = useDB()
  const router = useRouter()
  const params = useSearchParams()
  const [date, setDate] = useState(todayISO())
  const [view, setView] = useState<View>('day')
  const [dentist, setDentist] = useState('')
  const [query, setQuery] = useState('')
  const [edit, setEdit] = useState<Appointment | null>(null)
  const [details, setDetails] = useState<Appointment | null>(null)
  const [create, setCreate] = useState<Partial<Appointment> | null>(null)
  const role = db.session!.role
  const all = visibleAppointments(db).filter(a => !dentist || a.dentistId === dentist)
  const appts = all.filter(a => a.date === date)
  const selected = FILTERS.find(f => f.id === params.get('vista')) ?? FILTERS[0]
  const activeView = selected.id !== 'todas' ? 'list' : view
  const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const searched = all.filter(a => normalize(byId(db.patients, a.patientId)?.name ?? '').includes(normalize(query)))
  const filtered = searched.filter(a => a.date === date && (!selected.statuses || (selected.statuses as readonly string[]).includes(a.status)))
  const receiveId = params.get('recibir') ?? undefined
  const receive = can(role, 'checkin') ? visibleAppointments(db).find(a => a.id === receiveId) : undefined
  const month = new Intl.DateTimeFormat('es-BO', { month: 'long', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))
  const formatDay = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-BO', { ...options, timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'))
  const periodLabel = activeView === 'week' ? `${formatDay(startOfWeek(date), { day: 'numeric', month: 'short' })} – ${formatDay(addDays(startOfWeek(date), 6), { day: 'numeric', month: 'short' })}` : activeView === 'month' ? 'Calendario mensual' : formatDay(date, { weekday: 'long', day: 'numeric' })
  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value); else next.delete(key)
    router.replace(`/agenda${next.size ? `?${next}` : ''}`, { scroll: false })
  }
  const chooseView = (mode: View) => { setView(mode); if (params.has('vista')) setParam('vista') }
  const move = (direction: number) => setDate(activeView === 'month' ? moveMonth(date, direction) : addDays(date, direction * (activeView === 'week' ? 7 : 1)))
  const openConsult = (a: Appointment) => { setDetails(null); if (a.status === 'en_espera') startConsult(a.id); router.push(`/consulta/${a.id}`) }
  const createAt = (preset: Partial<Appointment>) => setCreate({ ...(dentist ? { dentistId: dentist } : {}), ...preset })
  const action = (a: Appointment) => {
    if (can(role, 'consulta') && ['en_espera', 'en_atencion'].includes(a.status)) return <button className="btn btn-primary min-h-10 px-3 py-2 text-xs" onClick={() => openConsult(a)}><Stethoscope size={15} aria-hidden /><span>{a.status === 'en_atencion' ? 'Continuar' : 'Atender'}</span></button>
    if (can(role, 'checkin') && ['agendada', 'confirmada'].includes(a.status) && a.date === todayISO()) return <button className="btn btn-secondary min-h-10 px-3 py-2 text-xs" onClick={() => { setDetails(null); setParam('recibir', a.id) }}><QrCode size={14} aria-hidden /><span>Recibir</span></button>
    return <Link href={`/pacientes/${a.patientId}`} className="btn btn-ghost min-h-10 px-3 py-2 text-xs">Ver ficha<ArrowRight size={14} aria-hidden /></Link>
  }
  const detailPatient = details && byId(db.patients, details.patientId)

  return <div className="fade-in">
    <PageHeader title="Agenda" eyebrow="Un espacio para tus citas, tus pacientes y tu equipo."><button className="btn btn-primary" onClick={() => createAt({ date })}><Plus size={18} aria-hidden />Nueva cita</button></PageHeader>
    <section className="glass calendar-window" aria-label="Agenda de citas">
      <header className="calendar-toolbar">
        <div className="flex items-center gap-4"><div><h2 className="whitespace-nowrap text-xl capitalize tracking-tight sm:text-2xl"><span className="font-semibold">{month}</span> <span className="font-light text-muted">{date.slice(0, 4)}</span></h2><p className="mt-1 text-xs capitalize text-muted">{periodLabel}</p></div><label className="relative grid h-9 w-9 place-items-center rounded-full bg-white/5"><CalendarDays size={16} className="text-gold" aria-hidden /><span className="sr-only">Elegir fecha de la agenda</span><input aria-label="Fecha de la agenda" type="date" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={date} onChange={e => { if (e.target.value) setDate(e.target.value) }} /></label></div>
        <div className="calendar-navigation" aria-label="Cambiar período"><button className="calendar-arrow" onClick={() => move(-1)} aria-label="Período anterior"><ChevronLeft size={17} /></button><button className="min-h-8 rounded-full px-3 text-xs font-medium text-gold-soft hover:bg-white/5" onClick={() => setDate(todayISO())}>Hoy</button><button className="calendar-arrow" onClick={() => move(1)} aria-label="Período siguiente"><ChevronRight size={17} /></button></div>
        <div className="calendar-segments" role="group" aria-label="Vista de agenda">{VIEWS.map(mode => <button key={mode.id} className="calendar-segment" aria-pressed={activeView === mode.id} onClick={() => chooseView(mode.id)}>{mode.id === 'list' && <List size={13} aria-hidden />}{mode.label}</button>)}</div>
      </header>
      <div className="calendar-filters">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="group" aria-label="Filtrar citas por estado">{FILTERS.map(f => <button key={f.id} className="filter-chip min-h-8 px-2.5 py-1.5 text-[0.7rem]" aria-pressed={selected.id === f.id} onClick={() => { setView('list'); setParam('vista', f.id === 'todas' ? undefined : f.id) }}>{f.label}<span className="filter-count h-[19px] min-w-[19px] text-[0.6rem]">{appts.filter(a => !f.statuses || (f.statuses as readonly string[]).includes(a.status)).length}</span></button>)}</div>
        <label className="relative w-full sm:w-44"><Search size={14} className="absolute left-3 top-3 text-muted" aria-hidden /><span className="sr-only">Buscar paciente en las citas</span><input className="field min-h-9 rounded-full border-white/10 bg-black/10 py-2 pl-9 text-xs" placeholder="Buscar paciente…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      </div>
      {activeView !== 'list' && <>
        {role !== 'odontologo' && <div className="flex justify-end border-b border-white/7 px-4 py-2 xl:hidden"><label className="flex items-center gap-2 text-xs text-muted"><SlidersHorizontal size={13} aria-hidden /><span className="sr-only">Filtrar por profesional</span><select aria-label="Profesional" className="rounded-lg bg-transparent p-1.5 text-xs text-bone" value={dentist} onChange={e => setDentist(e.target.value)}><option value="">Todo el equipo</option>{db.users.filter(u => u.role !== 'recepcion').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label></div>}
        <ClinicCalendar db={db} date={date} view={activeView} appointments={searched} dentist={dentist} onDentistChange={setDentist} onDateChange={setDate} onOpenDay={day => { setDate(day); chooseView('day') }} onSelect={setDetails} onCreate={createAt} />
      </>}
      {activeView === 'list' && <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3"><p className="text-xs text-muted">{date.split('-').reverse().join('/')} · {filtered.length} citas</p>{role !== 'odontologo' && <label className="flex items-center gap-2 text-xs text-muted"><span className="sr-only">Filtrar por profesional</span><select aria-label="Profesional" className="rounded-lg bg-transparent p-1.5 text-xs text-bone" value={dentist} onChange={e => setDentist(e.target.value)}><option value="">Todo el equipo</option>{db.users.filter(u => u.role !== 'recepcion').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}</div>}
      {activeView === 'list' && <div>
        <div className="hidden grid-cols-[70px_minmax(0,1.7fr)_minmax(120px,1fr)_minmax(120px,1fr)_140px] gap-4 border-y border-white/6 bg-white/2 px-6 py-3 text-[0.65rem] font-medium uppercase tracking-wider text-muted xl:grid"><span>Hora</span><span>Paciente</span><span>Profesional</span><span>Estado</span><span className="text-right">Acciones</span></div>
        {filtered.map(a => {
          const p = byId(db.patients, a.patientId)
          return <article key={a.id} className={`appointment-row ${['cancelada', 'no_asistio'].includes(a.status) ? 'opacity-60' : ''}`} aria-label={`Cita de ${p?.name} a las ${a.start}`}>
            <div className="self-start pt-1 sm:self-center sm:pt-0"><p className="num text-sm font-semibold">{a.start}</p><p className="mt-1 text-[0.65rem] text-muted">{a.duration} min</p></div>
            <Link href={`/pacientes/${a.patientId}`} className="flex min-w-0 items-center gap-3"><span className="hidden sm:block"><Avatar name={p?.name ?? ''} size={42} /></span><span className="min-w-0"><span className="block text-sm font-medium sm:truncate">{p?.name}</span><span className="mt-1 block truncate text-xs text-muted">{byId(db.procedures, a.procedureId)?.name}</span><span className="mt-1.5 block xl:hidden"><StatusBadge status={a.status} /></span></span></Link>
            <div className="appointment-detail min-w-0"><p className="truncate text-xs">{byId(db.users, a.dentistId)?.name}</p><p className="mt-1 text-xs text-muted">{byId(db.cabinets, a.cabinetId)?.name}</p></div>
            <div className="appointment-detail"><StatusBadge status={a.status} /></div>
            <div className="appointment-actions flex items-center justify-end gap-1 sm:gap-2">{action(a)}<button className="btn btn-ghost min-h-10 px-1.5 py-2" onClick={() => setEdit(a)} aria-label={`Editar cita de ${p?.name}`}><MoreHorizontal size={18} /></button></div>
          </article>
        })}
        {!filtered.length && <div className="empty-state"><span className="icon-tile"><CalendarDays size={24} aria-hidden /></span><h3 className="font-semibold">{query ? 'No encontramos esa cita' : selected.id === 'espera' ? 'La sala de espera está vacía' : 'No hay citas en esta vista'}</h3><p className="max-w-sm text-sm leading-relaxed text-muted">{query ? 'Prueba con otro nombre o cambia los filtros.' : selected.id === 'espera' ? 'Los pacientes aparecerán aquí cuando completen su ficha de llegada.' : 'Puedes elegir otro día, cambiar el filtro o agendar una nueva cita.'}</p><button className="btn btn-secondary mt-1 text-xs" onClick={() => selected.id !== 'todas' ? setParam('vista') : setCreate({ date })}>{selected.id !== 'todas' ? 'Ver todas las citas' : 'Agendar una cita'}</button></div>}
      </div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/2 px-5 py-3 text-[0.65rem] text-muted"><p className="flex items-center gap-1.5"><Clock3 size={12} aria-hidden />08:00–20:00 · La Paz{activeView !== 'list' && <span className="hidden sm:inline"> · Selecciona una cita o un horario libre</span>}</p>{role === 'admin' && <label className="flex items-center gap-2">Consultorios<select className="rounded-md bg-white/5 px-2 py-1 text-xs text-bone" value={db.cabinets.length} onChange={e => setCabinetCount(+e.target.value)}>{[2,3,4,5].map(n => <option key={n}>{n}</option>)}</select></label>}</footer>
    </section>
    <Modal open={!!details} onClose={() => setDetails(null)} title="Detalle de la cita">
      {details && detailPatient && <>
        <div className="mb-5 flex items-center gap-3"><Avatar name={detailPatient.name} size={52} /><div><h3 className="text-lg font-semibold">{detailPatient.name}</h3><p className="mt-1 text-sm text-muted">{byId(db.procedures, details.procedureId)?.name}</p></div></div>
        <StatusBadge status={details.status} />
        <div className="my-5 space-y-3 rounded-2xl border border-white/10 bg-white/3 p-4 text-sm"><p className="flex items-center gap-3"><CalendarDays size={17} className="text-gold" aria-hidden />{details.date.split('-').reverse().join('/')}</p><p className="flex items-center gap-3"><Clock3 size={17} className="text-gold" aria-hidden />{details.start} · {details.duration} minutos</p><p className="flex items-center gap-3"><MapPin size={17} className="text-gold" aria-hidden />{byId(db.cabinets, details.cabinetId)?.name}</p><p className="flex items-center gap-3"><Stethoscope size={17} className="text-gold" aria-hidden />{byId(db.users, details.dentistId)?.name}</p></div>
        <div className="flex flex-wrap gap-2">{action(details)}<button className="btn btn-secondary text-xs" onClick={() => { setEdit(details); setDetails(null) }}><Pencil size={14} aria-hidden />Editar cita</button><Link className="btn btn-ghost text-xs" href={`/pacientes/${details.patientId}`}>Ficha del paciente<ArrowRight size={14} aria-hidden /></Link></div>
      </>}
    </Modal>
    <AppointmentModal open={!!edit} appt={edit ?? undefined} onClose={() => setEdit(null)} />
    <AppointmentModal open={!!create} preset={create ?? undefined} onClose={() => setCreate(null)} />
    <ReceptionDialog appointmentId={receive?.id} onClose={() => setParam('recibir')} />
  </div>
}
