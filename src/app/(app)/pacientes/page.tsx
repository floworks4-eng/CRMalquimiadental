'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Search, FileUp, ArrowUpRight, CalendarDays, Users, X } from 'lucide-react'
import { useDB, visiblePatients, byId, todayISO, fecha, SOURCE_LABEL, PATIENT_STATUS, can, type PatientSource, type Patient } from '@/lib/data'
import { PageHeader, Avatar } from '@/components/ui'

const STATUS_COLORS: Record<Patient['status'], string> = { nuevo: 'bg-[#b9b1ea]/10 text-[#d1c9f4]', activo: 'bg-ok/10 text-ok', en_tratamiento: 'bg-[#aacaed]/10 text-[#bed8f5]', inactivo: 'bg-white/5 text-muted' }
const FILTERS: { status: Patient['status'] | ''; label: string }[] = [ { status: '', label: 'Todos' }, { status: 'en_tratamiento', label: 'En tratamiento' }, { status: 'nuevo', label: 'Nuevos' }, { status: 'activo', label: 'Activos' }, { status: 'inactivo', label: 'Inactivos' } ]

export default function Pacientes() {
  const db = useDB()
  const [q, setQ] = useState('')
  const [source, setSource] = useState<PatientSource | ''>('')
  const [status, setStatus] = useState<Patient['status'] | ''>('')
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const patients = visiblePatients(db)
  const list = patients.filter(p => (!q || norm(p.name + p.phone).includes(norm(q))) && (!source || p.source === source) && (!status || p.status === status)).sort((a, b) => a.name.localeCompare(b.name))
  const next = (id: string) => db.appointments.filter(a => a.patientId === id && a.date >= todayISO() && !['atendida', 'cancelada', 'no_asistio'].includes(a.status)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0]
  return <div className="fade-in">
    <PageHeader title="Pacientes" eyebrow="Encuentra su ficha, sus citas y toda su información en un solo lugar.">{can(db.session!.role, 'ingesta') && <Link href="/ingesta" className="btn btn-secondary"><FileUp size={17} aria-hidden />Importar pacientes</Link>}</PageHeader>
    <section className="glass overflow-hidden" aria-label="Directorio de pacientes">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 p-4 sm:p-5">
        <label className="relative w-full sm:max-w-sm"><Search size={18} className="absolute left-3.5 top-3.5 text-muted" aria-hidden /><span className="sr-only">Buscar por nombre o teléfono</span><input className="field pl-11 pr-10" placeholder="Buscar por nombre o teléfono…" value={q} onChange={e => setQ(e.target.value)} />{q && <button onClick={() => setQ('')} className="absolute right-2 top-2 rounded-lg p-1.5 text-muted hover:text-bone" aria-label="Borrar búsqueda"><X size={16} /></button>}</label>
        <label className="flex items-center gap-2 text-xs text-muted">Origen<select className="field min-h-10 w-auto py-1 text-xs" value={source} onChange={e => setSource(e.target.value as PatientSource | '')}><option value="">Todos los orígenes</option>{(Object.keys(SOURCE_LABEL) as PatientSource[]).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select></label>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-3 sm:px-5" role="group" aria-label="Filtrar pacientes por estado">{FILTERS.map(f => <button key={f.label} className="filter-chip" aria-pressed={status === f.status} onClick={() => setStatus(f.status)}>{f.label}<span className="filter-count">{patients.filter(p => !f.status || p.status === f.status).length}</span></button>)}</div>
      <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(100px,0.8fr)_minmax(100px,1fr)_minmax(110px,0.9fr)_24px] gap-5 border-y border-white/6 bg-white/2 px-6 py-3 text-[0.65rem] font-medium uppercase tracking-wider text-muted lg:grid"><span>Paciente</span><span>Estado</span><span>Profesional</span><span>Próxima cita</span><span /></div>
      <ul>{list.map(p => { const appointment = next(p.id); return <li key={p.id} className="border-b border-white/7 last:border-0"><Link href={`/pacientes/${p.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-white/4 sm:px-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(100px,0.8fr)_minmax(100px,1fr)_minmax(110px,0.9fr)_24px]">
        <span className="flex min-w-0 items-center gap-3.5"><Avatar name={p.name} size={46} /><span className="min-w-0"><span className="block truncate text-sm font-medium group-hover:text-ok">{p.name}</span><span className="mt-1 block text-xs text-muted">{p.phone}</span><span className="mt-2 inline-block lg:hidden"><span className={`rounded-full px-2 py-1 text-[0.65rem] ${STATUS_COLORS[p.status]}`}>{PATIENT_STATUS[p.status]}</span></span></span></span>
        <span className="hidden lg:block"><span className={`inline-flex rounded-full px-2.5 py-1.5 text-[0.7rem] ${STATUS_COLORS[p.status]}`}>{PATIENT_STATUS[p.status]}</span></span>
        <span className="hidden text-xs text-muted lg:block">{byId(db.users, p.dentistId)?.name}</span>
        <span className="hidden sm:block">{appointment ? <><span className="flex items-center gap-1.5 text-xs"><CalendarDays size={13} className="text-ok" aria-hidden />{appointment.date === todayISO() ? 'Hoy' : fecha(appointment.date)} · {appointment.start}</span><span className="mt-1 block truncate text-[0.65rem] text-muted">{byId(db.procedures, appointment.procedureId)?.name}</span></> : <span className="text-xs text-muted">Sin cita programada</span>}</span>
        <ArrowUpRight size={18} className="text-muted transition-colors group-hover:text-ok sm:hidden lg:block" aria-hidden />
      </Link></li> })}</ul>
      {!list.length && <div className="empty-state"><span className="icon-tile"><Users size={24} aria-hidden /></span><h2 className="font-semibold">No encontramos pacientes</h2><p className="max-w-sm text-sm text-muted">Prueba con otro nombre, teléfono o estado.</p><button className="btn btn-secondary mt-1 text-xs" onClick={() => { setQ(''); setSource(''); setStatus('') }}>Limpiar filtros</button></div>}
      <p className="border-t border-white/8 px-5 py-4 text-xs text-muted" aria-live="polite">{list.length} de {patients.length} pacientes · Selecciona un nombre para abrir su ficha</p>
    </section>
  </div>
}
