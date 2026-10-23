'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  useDB, visibleAppointments, todayISO, addDays, fechaLarga, byId, toMin, toHM, nowHM, setCabinetCount, type Appointment,
} from '@/lib/data'
import { PageHeader, SourceChip, StatusBadge } from '@/components/ui'
import { AppointmentModal } from '@/components/appointment-modal'

const OPEN = 8 * 60
const CLOSE = 20 * 60
const ROW = 58 // px por 30 min

export default function Agenda() {
  const db = useDB()
  const [date, setDate] = useState(todayISO())
  const [edit, setEdit] = useState<Appointment | null>(null)
  const [create, setCreate] = useState<Partial<Appointment> | null>(null)
  const [cab, setCab] = useState(db.cabinets[0].id)
  const appts = visibleAppointments(db, date)
  const isToday = date === todayISO()
  const now = toMin(nowHM())
  const rows = Array.from({ length: (CLOSE - OPEN) / 30 }, (_, i) => OPEN + i * 30)

  const item = (a: Appointment, style?: React.CSSProperties) => {
    const p = byId(db.patients, a.patientId)
    return (
      <button
        key={a.id}
        onClick={() => setEdit(a)}
        style={style}
        aria-label={`${a.start}, ${p?.name}, ${byId(db.procedures, a.procedureId)?.name}. Editar o mover`}
        className={`glass w-full overflow-hidden rounded-xl px-3 py-1.5 text-left transition-shadow duration-150 hover:ring-1 hover:ring-gold/50 ${
          a.status === 'en_espera' ? 'ring-1 ring-warn/50' : a.status === 'en_atencion' ? 'ring-1 ring-azure/60' : ''
        } ${['cancelada', 'no_asistio'].includes(a.status) ? 'opacity-55' : ''} ${style ? 'absolute inset-x-1.5' : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="num text-xs text-gold-soft">{a.start}–{toHM(toMin(a.start) + a.duration)}</span>
          <SourceChip source={a.source} campaign={byId(db.campaigns, a.campaignId)?.name} />
        </div>
        <p className="mt-0.5 truncate text-sm font-medium text-bone">{p?.name}</p>
        {(a.duration >= 40 || !style) && (
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate text-xs text-muted">{byId(db.procedures, a.procedureId)?.name}</span>
            <StatusBadge status={a.status} />
          </div>
        )}
      </button>
    )
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Agenda y gabinetes" title={fechaLarga(date)}>
        <div className="flex items-center gap-1">
          <button className="btn btn-secondary p-2" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior"><ChevronLeft size={18} /></button>
          <label className="sr-only" htmlFor="agenda-date">Fecha</label>
          <input id="agenda-date" type="date" className="field w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button className="btn btn-secondary p-2" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente"><ChevronRight size={18} /></button>
          {!isToday && <button className="btn btn-ghost text-xs" onClick={() => setDate(todayISO())}>Hoy</button>}
        </div>
        {db.session!.role === 'admin' && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Gabinetes
            <select className="field w-auto" value={db.cabinets.length} onChange={(e) => setCabinetCount(+e.target.value)}>
              {[2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        )}
        <button className="btn btn-primary" onClick={() => setCreate({ date })}><Plus size={16} aria-hidden />Nueva cita</button>
      </PageHeader>

      {/* Laptop: vista del día por sillón */}
      <div className="glass hidden overflow-x-auto p-4 md:block">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `56px repeat(${db.cabinets.length}, minmax(0,1fr))` }}>
          <div />
          {db.cabinets.map((c) => (
            <div key={c.id} className="pb-3 text-center">
              <p className="title-gold text-base">{c.name}</p>
              <p className="text-xs text-muted">{appts.filter((a) => a.cabinetId === c.id && a.status !== 'cancelada').length} citas</p>
            </div>
          ))}
          <div className="relative">
            {rows.map((m) => (
              <div key={m} style={{ height: ROW }} className="num -mt-2 pr-2 text-right text-[0.7rem] text-muted">{m % 60 === 0 ? toHM(m) : ''}</div>
            ))}
          </div>
          {db.cabinets.map((c) => (
            <div key={c.id} className="relative border-l border-white/6" style={{ height: rows.length * ROW }}>
              {rows.map((m) => (
                <button
                  key={m}
                  tabIndex={-1}
                  aria-hidden
                  onClick={() => setCreate({ date, cabinetId: c.id, start: toHM(m) })}
                  className={`block w-full border-t ${m % 60 === 0 ? 'border-white/8' : 'border-white/[0.03]'} hover:bg-white/[0.03]`}
                  style={{ height: ROW }}
                />
              ))}
              {appts.filter((a) => a.cabinetId === c.id).map((a) => (
                item(a, { top: ((toMin(a.start) - OPEN) / 30) * ROW + 2, height: (a.duration / 30) * ROW - 4 })
              ))}
              {isToday && now > OPEN && now < CLOSE && (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 border-t border-azure shadow-[0_0_8px_#2f7bff]" style={{ top: ((now - OPEN) / 30) * ROW }} />
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Haz clic en un espacio libre para crear una cita, o en una cita para moverla. El chip indica el origen (WhatsApp, Web o Campaña).</p>
      </div>

      {/* Celular: un gabinete a la vez */}
      <div className="md:hidden">
        <div role="tablist" aria-label="Gabinetes" className="glass mb-4 flex gap-1 p-1">
          {db.cabinets.map((c) => (
            <button key={c.id} role="tab" aria-selected={cab === c.id} onClick={() => setCab(c.id)}
              className={`flex-1 rounded-xl px-2 py-2 text-sm ${cab === c.id ? 'bg-white/10 text-gold ring-1 ring-gold/40' : 'text-muted'}`}>
              {c.name.replace('Gabinete', 'Gab.')}
            </button>
          ))}
        </div>
        <ul className="space-y-2" role="tabpanel">
          {appts.filter((a) => a.cabinetId === cab).map((a) => <li key={a.id}>{item(a)}</li>)}
          {!appts.some((a) => a.cabinetId === cab) && <li className="glass p-4 text-sm text-muted">Sin citas en este gabinete.</li>}
        </ul>
      </div>

      <AppointmentModal open={!!edit} appt={edit ?? undefined} onClose={() => setEdit(null)} />
      <AppointmentModal open={!!create} preset={create ?? undefined} onClose={() => setCreate(null)} />
    </div>
  )
}
