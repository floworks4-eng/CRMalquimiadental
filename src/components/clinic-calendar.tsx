'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react'
import { addDays, byId, nowHM, todayISO, toHM, toMin, STATUS_LABEL, type Appointment, type DB } from '@/lib/data'

export type CalendarView = 'day' | 'week' | 'month'
const START = 8 * 60
const END = 20 * 60
const HOUR_HEIGHT = 104
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const TONES = ['#d7b56d', '#afb9d2', '#c6adbf', '#c2c3c9']
const dateObject = (iso: string) => new Date(iso + 'T12:00:00Z')
const format = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-BO', { ...options, timeZone: 'UTC' }).format(dateObject(date))
export const startOfWeek = (date: string) => addDays(date, -((dateObject(date).getUTCDay() + 6) % 7))
export function moveMonth(date: string, amount: number) {
  const d = dateObject(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + amount)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}
export function monthDates(date: string) {
  const first = date.slice(0, 7) + '-01'
  const firstCell = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(firstCell, i))
}

// Assign separate lanes to simultaneous appointments, including appointments that overlap only partially.
function eventLanes(appointments: Appointment[]) {
  const result = new Map<string, { lane: number; lanes: number }>()
  const sorted = [...appointments].sort((a, b) => toMin(a.start) - toMin(b.start) || b.duration - a.duration)
  let group: Appointment[] = []
  let end = 0
  const flush = () => {
    const laneEnds: number[] = []
    const placed = group.map(a => {
      let lane = laneEnds.findIndex(value => value <= toMin(a.start))
      if (lane < 0) lane = laneEnds.length
      laneEnds[lane] = toMin(a.start) + a.duration
      return { id: a.id, lane }
    })
    placed.forEach(a => result.set(a.id, { lane: a.lane, lanes: laneEnds.length }))
    group = []
  }
  for (const a of sorted) {
    const start = toMin(a.start)
    if (group.length && start >= end) flush()
    if (!group.length) end = start + a.duration
    else end = Math.max(end, start + a.duration)
    group.push(a)
  }
  flush()
  return result
}

export function ClinicCalendar({ db, date, view, appointments, dentist, onDentistChange, onDateChange, onOpenDay, onSelect, onCreate }: {
  db: DB
  date: string
  view: CalendarView
  appointments: Appointment[]
  dentist: string
  onDentistChange: (id: string) => void
  onDateChange: (date: string) => void
  onOpenDay: (date: string) => void
  onSelect: (appointment: Appointment) => void
  onCreate: (preset: Partial<Appointment>) => void
}) {
  const providers = db.users.filter(u => u.role !== 'recepcion' && (db.session?.role !== 'odontologo' || u.id === db.session.userId))
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i))
  const days = view === 'week' ? week : [date]
  const today = todayISO()
  const now = toMin(nowHM())
  const dayAppointments = appointments.filter(a => a.date === date)
  const colorOf = (a: Appointment) => TONES[Math.max(0, db.users.filter(u => u.role !== 'recepcion').findIndex(u => u.id === a.dentistId)) % TONES.length]
  const columns = view === 'week'
    ? days.map(day => ({ key: day, date: day, name: format(day, { weekday: 'short' }), cabinet: undefined as string | undefined }))
    : db.cabinets.map(c => ({ key: c.id, date, name: c.name, cabinet: c.id as string | undefined }))

  return <div className="calendar-layout">
    <aside className="calendar-sidebar" aria-label="Navegación del calendario">
      <MiniMonth date={date} onSelect={onDateChange} />
      <div className="mt-7 border-t border-white/10 pt-5">
        <p className="mb-3 text-[0.65rem] font-semibold tracking-widest text-muted">CALENDARIOS DEL EQUIPO</p>
        <button className="calendar-provider" aria-pressed={!dentist} onClick={() => onDentistChange('')}><span className="calendar-check" aria-hidden>{!dentist ? '✓' : ''}</span><span>Todo el equipo</span></button>
        {providers.map((u, i) => <button key={u.id} className="calendar-provider" aria-pressed={dentist === u.id} onClick={() => onDentistChange(dentist === u.id ? '' : u.id)}><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONES[i % TONES.length] }} aria-hidden /><span className="truncate">{u.name}</span></button>)}
      </div>
      <div className="calendar-day-note mt-auto">
        <span className="mb-3 inline-grid h-9 w-9 place-items-center rounded-xl bg-gold/12 text-gold"><CalendarDays size={18} aria-hidden /></span>
        <p className="text-sm font-medium">{dayAppointments.length} citas para este día</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">Selecciona una cita para ver sus detalles o un horario libre para agendar.</p>
      </div>
    </aside>
    {view === 'month' ? <div className="calendar-month-wrap">
      <div className="calendar-month-weekdays">{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => <div key={day}><span className="hidden sm:inline">{day}</span><span className="sm:hidden">{day.slice(0, 1)}</span></div>)}</div>
      <div className="calendar-month-grid">
        {monthDates(date).map(day => {
          const events = appointments.filter(a => a.date === day)
          const outside = day.slice(0, 7) !== date.slice(0, 7)
          return <div key={day} className={`calendar-month-cell ${outside ? 'is-outside' : ''} ${day === today ? 'is-today' : ''}`}>
            <div className="mb-2 flex items-center justify-between"><button className={`calendar-day-number ${day === today ? 'is-today' : ''} ${day === date ? 'is-selected' : ''}`} aria-label={`Ver día ${format(day, { dateStyle: 'long' })}`} onClick={() => onOpenDay(day)}>{+day.slice(8)}</button><button className="calendar-month-add" aria-label={`Nueva cita el ${format(day, { dateStyle: 'long' })}`} onClick={() => onCreate({ date: day })}><Plus size={13} /></button></div>
            <div className="space-y-1">{events.slice(0, 3).map(a => <button key={a.id} className="calendar-month-event" style={{ '--event-color': colorOf(a) } as CSSProperties} onClick={() => onSelect(a)} aria-label={`${a.start}, ${byId(db.patients, a.patientId)?.name}`}><span>{a.start}</span><span className="hidden truncate sm:inline">{byId(db.patients, a.patientId)?.name}</span><span className="truncate sm:hidden">{byId(db.patients, a.patientId)?.name.split(' ')[0]}</span></button>)}{events.length > 3 && <button onClick={() => onOpenDay(day)} className="pl-1 text-[0.65rem] text-gold">+{events.length - 3} citas</button>}</div>
          </div>
        })}
      </div>
    </div> : <div className="calendar-timeline-scroll" aria-label={view === 'week' ? 'Calendario semanal' : 'Calendario del día'}>
      <div className={`calendar-timeline ${view === 'week' ? 'is-week' : ''}`} style={{ '--calendar-columns': columns.length } as CSSProperties}>
        <div className="calendar-columns-header">
          <div className="calendar-timezone">GMT−4</div>
          {columns.map((column, i) => <div key={column.key} className={`calendar-column-heading ${column.date === today ? 'is-today' : ''}`}>
            {view === 'week' ? <button className="flex flex-col items-center gap-1.5" onClick={() => onOpenDay(column.date)} aria-label={`Ver día ${format(column.date, { dateStyle: 'long' })}`}><span className="text-[0.65rem] capitalize text-muted">{column.name.replace('.', '')}</span><span className={`calendar-header-date ${column.date === today ? 'is-today' : ''}`}>{+column.date.slice(8)}</span></button> : <><span className="mb-1.5 h-1.5 w-1.5 rounded-full" style={{ background: TONES[i % TONES.length] }} aria-hidden /><h3 className="text-xs font-semibold">{column.name}</h3><p className="mt-1 text-[0.65rem] text-muted">{dayAppointments.filter(a => a.cabinetId === column.cabinet).length} citas</p></>}
          </div>)}
        </div>
        <div className="calendar-columns-body">
          <div className="calendar-hours" style={{ height: (END - START) / 60 * HOUR_HEIGHT }}>{Array.from({ length: 13 }, (_, i) => <span key={i} style={{ top: i * HOUR_HEIGHT }}>{toHM(START + i * 60)}</span>)}</div>
          {columns.map(column => {
            const events = appointments.filter(a => a.date === column.date && (!column.cabinet || a.cabinetId === column.cabinet))
            const lanes = eventLanes(events)
            return <div key={column.key} className="calendar-day-column" style={{ height: (END - START) / 60 * HOUR_HEIGHT }}>
              {Array.from({ length: (END - START) / 30 }, (_, i) => <button key={i} className={`calendar-time-slot ${i % 2 ? 'is-half' : ''}`} style={{ height: HOUR_HEIGHT / 2 }} aria-label={`Agendar el ${format(column.date, { day: 'numeric', month: 'long' })} a las ${toHM(START + i * 30)}${column.cabinet ? `, ${column.name}` : ''}`} onClick={() => onCreate({ date: column.date, start: toHM(START + i * 30), ...(column.cabinet ? { cabinetId: column.cabinet } : {}) })} />)}
              {events.map(a => {
                const lane = lanes.get(a.id)!
                const duration = Math.min(a.duration, END - toMin(a.start))
                if (duration <= 0 || toMin(a.start) < START) return null
                return <button key={a.id} className={`calendar-event ${a.status === 'atendida' ? 'is-finished' : ''} ${['cancelada', 'no_asistio'].includes(a.status) ? 'is-cancelled' : ''}`} onClick={() => onSelect(a)} title={`${a.start} · ${byId(db.patients, a.patientId)?.name} · ${STATUS_LABEL[a.status]}`} aria-label={`Cita de ${byId(db.patients, a.patientId)?.name} a las ${a.start}, ${STATUS_LABEL[a.status]}`} style={{ '--event-color': colorOf(a), top: (toMin(a.start) - START) / 60 * HOUR_HEIGHT + 3, height: Math.max(26, duration / 60 * HOUR_HEIGHT - 6), left: `calc(${lane.lane / lane.lanes * 100}% + 5px)`, width: `calc(${100 / lane.lanes}% - 10px)` } as CSSProperties}>
                  <span className="calendar-event-time">{a.start}–{toHM(toMin(a.start) + a.duration)}{a.status === 'atendida' && <span className="ml-1" aria-label="Atendida">✓</span>}</span>
                  <span className="calendar-event-name">{byId(db.patients, a.patientId)?.name}</span>
                  {a.duration >= 45 && <span className="calendar-event-procedure">{byId(db.procedures, a.procedureId)?.name}</span>}
                  {a.duration >= 75 && <span className="calendar-event-provider">{byId(db.users, a.dentistId)?.name}</span>}
                </button>
              })}
              {column.date === today && now >= START && now < END && <div className="calendar-now" style={{ top: (now - START) / 60 * HOUR_HEIGHT }}><span>{nowHM()}</span></div>}
            </div>
          })}
        </div>
      </div>
    </div>}
  </div>
}

function MiniMonth({ date, onSelect }: { date: string; onSelect: (date: string) => void }) {
  const [cursor, setCursor] = useState(date)
  useEffect(() => { setCursor(date) }, [date])
  return <section aria-label="Elegir día del mes">
    <div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-semibold capitalize">{format(cursor, { month: 'long', year: 'numeric' })}</h3><div className="flex"><button className="calendar-mini-arrow" onClick={() => setCursor(moveMonth(cursor, -1))} aria-label="Mes anterior en calendario pequeño"><ChevronLeft size={14} /></button><button className="calendar-mini-arrow" onClick={() => setCursor(moveMonth(cursor, 1))} aria-label="Mes siguiente en calendario pequeño"><ChevronRight size={14} /></button></div></div>
    <div className="calendar-mini-grid">{WEEKDAYS.map((day, i) => <span key={i} className="py-1 text-[0.6rem] text-muted">{day}</span>)}{monthDates(cursor).map(day => <button key={day} className={`calendar-mini-date ${day === date ? 'is-selected' : ''} ${day === todayISO() ? 'is-today' : ''} ${day.slice(0, 7) !== cursor.slice(0, 7) ? 'is-outside' : ''}`} aria-label={`Elegir ${format(day, { dateStyle: 'long' })}`} aria-pressed={day === date} onClick={() => onSelect(day)}>{+day.slice(8)}</button>)}</div>
  </section>
}
