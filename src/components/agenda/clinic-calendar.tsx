'use client'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react'
import { addDays, formatTime, todayLaPaz, hm } from '@/lib/domain/time'
import { STATUS_LABEL } from '@/lib/domain/status'
import {
  calendarDateLabel as format,
  eventLanes,
  minuteOfTime,
  monthDates,
  moveMonth,
  startOfWeek,
  type CalendarView,
  type CalendarEvent,
  type CalendarCreateSlot,
  type CalendarDay,
} from '@/lib/domain/calendar'

const HOUR_HEIGHT = 104
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const TONES = ['#d7b56d', '#afb9d2', '#c6adbf', '#c2c3c9']

export function ClinicCalendar({
  cabinets,
  providers,
  daysInfo,
  date,
  view,
  appointments,
  dentist,
  canCreate,
  onDentistChange,
  onDateChange,
  onOpenDay,
  onSelect,
  onCreate,
}: {
  cabinets: { id: string; name: string }[]
  providers: { id: string; fullName: string }[]
  daysInfo: CalendarDay[]
  date: string
  view: CalendarView
  appointments: CalendarEvent[]
  dentist: string
  canCreate: boolean
  onDentistChange: (id: string) => void
  onDateChange: (date: string) => void
  onOpenDay: (date: string) => void
  onSelect: (appointment: CalendarEvent) => void
  onCreate: (preset: CalendarCreateSlot) => void
}) {
  const [clock, setClock] = useState(() => formatTime(new Date().toISOString()))
  const [pos, setPos] = useState({ c: 0, r: 0 })
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const timer = setInterval(() => setClock(formatTime(new Date().toISOString())), 60_000)
    return () => clearInterval(timer)
  }, [])
  const START = Math.min(8 * 60, ...daysInfo.filter((day) => day.hours).map((day) => Math.floor(minuteOfTime(day.hours!.opens) / 60) * 60))
  const END = Math.max(20 * 60, ...daysInfo.filter((day) => day.hours).map((day) => Math.ceil(minuteOfTime(day.hours!.closes) / 60) * 60))
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i))
  const days = view === 'week' ? week : [date]
  const today = todayLaPaz()
  const now = minuteOfTime(clock)
  const dayAppointments = appointments.filter((a) => a.date === date)
  const colorOf = (a: CalendarEvent) =>
    TONES[
      Math.max(
        0,
        providers.findIndex((u) => u.id === a.dentistId),
      ) % TONES.length
    ]
  const columns =
    view === 'week'
      ? days.map((day) => ({ key: day, date: day, name: format(day, { weekday: 'short' }), cabinet: undefined as string | undefined }))
      : cabinets.map((c) => ({ key: c.id, date, name: c.name, cabinet: c.id as string | undefined }))

  const canBookDate = (day: string) => canCreate && day >= today && !!daysInfo.find((info) => info.date === day)?.hours
  const moveGrid = (e: KeyboardEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cell]')
    if (!cell) return
    const arrows: Record<string, [number, number]> = { ArrowDown: [0, 1], ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowLeft: [-1, 0] }
    const delta = arrows[e.key]
    if (!delta && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const [c, r] = cell.dataset.cell!.split('-').map(Number)
    const rowCount = (END - START) / 30
    const next = {
      c: Math.min(columns.length - 1, Math.max(0, c + (delta?.[0] ?? 0))),
      r: e.key === 'Home' ? 0 : e.key === 'End' ? rowCount - 1 : Math.min(rowCount - 1, Math.max(0, r + (delta?.[1] ?? 0))),
    }
    setPos(next)
    grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${next.c}-${next.r}"]`)?.focus()
  }

  return (
    <div className="calendar-layout">
      <aside className="calendar-sidebar" aria-label="Navegación del calendario">
        <MiniMonth key={date} date={date} onSelect={onDateChange} />
        <div className="mt-7 border-t border-white/10 pt-5">
          <p className="mb-3 text-[0.65rem] font-semibold tracking-widest text-muted">CALENDARIOS DEL EQUIPO</p>
          <button className="calendar-provider" aria-pressed={!dentist} onClick={() => onDentistChange('')}>
            <span className="calendar-check" aria-hidden>
              {!dentist ? '✓' : ''}
            </span>
            <span>Todo el equipo</span>
          </button>
          {providers.map((u, i) => (
            <button
              key={u.id}
              className="calendar-provider"
              aria-pressed={dentist === u.id}
              onClick={() => onDentistChange(dentist === u.id ? '' : u.id)}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONES[i % TONES.length] }} aria-hidden />
              <span className="truncate">{u.fullName}</span>
            </button>
          ))}
        </div>
        <div className="calendar-day-note mt-auto">
          <span className="mb-3 inline-grid h-9 w-9 place-items-center rounded-xl bg-gold/12 text-gold">
            <CalendarDays size={18} aria-hidden />
          </span>
          <p className="text-sm font-medium">{dayAppointments.length} citas para este día</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Selecciona una cita para ver sus detalles o un horario libre para agendar.
          </p>
        </div>
      </aside>
      {view === 'month' ? (
        <div className="calendar-month-wrap">
          <div className="calendar-month-weekdays">
            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((day) => (
              <div key={day}>
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day.slice(0, 1)}</span>
              </div>
            ))}
          </div>
          <div className="calendar-month-grid">
            {monthDates(date).map((day) => {
              const events = appointments.filter((a) => a.date === day)
              const outside = day.slice(0, 7) !== date.slice(0, 7)
              return (
                <div key={day} className={`calendar-month-cell ${outside ? 'is-outside' : ''} ${day === today ? 'is-today' : ''}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      className={`calendar-day-number ${day === today ? 'is-today' : ''} ${day === date ? 'is-selected' : ''}`}
                      aria-label={`Ver día ${format(day, { dateStyle: 'long' })}`}
                      onClick={() => onOpenDay(day)}
                    >
                      {+day.slice(8)}
                    </button>
                    <button
                      disabled={!canBookDate(day)}
                      className="calendar-month-add"
                      aria-label={`Nueva cita el ${format(day, { dateStyle: 'long' })}`}
                      onClick={() => onCreate({ date: day })}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 3).map((a) => (
                      <button
                        key={a.id}
                        className="calendar-month-event"
                        style={{ '--event-color': colorOf(a) } as CSSProperties}
                        onClick={() => onSelect(a)}
                        aria-label={`${a.start}, ${a.patientName}`}
                      >
                        <span>{a.start}</span>
                        <span className="hidden truncate sm:inline">{a.patientName}</span>
                        <span className="truncate sm:hidden">{a.patientName.split(' ')[0]}</span>
                      </button>
                    ))}
                    {events.length > 3 && (
                      <button onClick={() => onOpenDay(day)} className="pl-1 text-[0.65rem] text-gold">
                        +{events.length - 3} citas
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="calendar-timeline-scroll" aria-label={view === 'week' ? 'Calendario semanal' : 'Calendario del día'}>
          <div
            ref={grid}
            onKeyDown={moveGrid}
            className={`calendar-timeline ${view === 'week' ? 'is-week' : ''}`}
            style={{ '--calendar-columns': columns.length } as CSSProperties}
          >
            <div className="calendar-columns-header">
              <div className="calendar-timezone">GMT−4</div>
              {columns.map((column, i) => (
                <div key={column.key} className={`calendar-column-heading ${column.date === today ? 'is-today' : ''}`}>
                  {view === 'week' ? (
                    <button
                      className="flex flex-col items-center gap-1.5"
                      onClick={() => onOpenDay(column.date)}
                      aria-label={`Ver día ${format(column.date, { dateStyle: 'long' })}`}
                    >
                      <span className="text-[0.65rem] capitalize text-muted">{column.name.replace('.', '')}</span>
                      <span className={`calendar-header-date ${column.date === today ? 'is-today' : ''}`}>{+column.date.slice(8)}</span>
                    </button>
                  ) : (
                    <>
                      <span className="mb-1.5 h-1.5 w-1.5 rounded-full" style={{ background: TONES[i % TONES.length] }} aria-hidden />
                      <h3 className="text-xs font-semibold">{column.name}</h3>
                      <p className="mt-1 text-[0.65rem] text-muted">
                        {dayAppointments.filter((a) => a.cabinetId === column.cabinet).length} citas
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="calendar-columns-body">
              <div className="calendar-hours" style={{ height: ((END - START) / 60) * HOUR_HEIGHT }}>
                {Array.from({ length: 13 }, (_, i) => (
                  <span key={i} style={{ top: i * HOUR_HEIGHT }}>
                    {hm(START + i * 60)}
                  </span>
                ))}
              </div>
              {columns.map((column, columnIndex) => {
                const events = appointments.filter((a) => a.date === column.date && (!column.cabinet || a.cabinetId === column.cabinet))
                const lanes = eventLanes(events)
                const info = daysInfo.find((day) => day.date === column.date)
                const canBookTime = (minutes: number) =>
                  canBookDate(column.date) &&
                  !!info?.hours &&
                  minutes >= minuteOfTime(info.hours.opens) &&
                  minutes + 30 <= minuteOfTime(info.hours.closes)
                return (
                  <div key={column.key} className="calendar-day-column" style={{ height: ((END - START) / 60) * HOUR_HEIGHT }}>
                    {Array.from({ length: (END - START) / 30 }, (_, i) => {
                      const minutes = START + i * 30
                      const available = canBookTime(minutes)
                      return (
                        <button
                          key={i}
                          className={`calendar-time-slot ${i % 2 ? 'is-half' : ''} ${!available ? 'is-unavailable' : ''}`}
                          style={{ height: HOUR_HEIGHT / 2 }}
                          data-cell={`${columnIndex}-${i}`}
                          tabIndex={pos.c === columnIndex && pos.r === i ? 0 : -1}
                          disabled={!canCreate}
                          aria-disabled={!available}
                          onFocus={() => setPos({ c: columnIndex, r: i })}
                          aria-label={`${available ? 'Agendar' : 'Fuera de horario'} el ${format(column.date, { day: 'numeric', month: 'long' })} a las ${hm(minutes)}${column.cabinet ? `, ${column.name}` : ''}`}
                          onClick={() => {
                            if (available)
                              onCreate({ date: column.date, start: hm(minutes), ...(column.cabinet ? { cabinetId: column.cabinet } : {}) })
                          }}
                        />
                      )
                    })}
                    {events.map((a) => {
                      const lane = lanes.get(a.id)!
                      const duration = Math.min(a.duration, END - minuteOfTime(a.start))
                      if (duration <= 0 || minuteOfTime(a.start) < START) return null
                      return (
                        <button
                          key={a.id}
                          className={`calendar-event ${a.status === 'completed' ? 'is-finished' : ''} ${['cancelled', 'no_show'].includes(a.status) ? 'is-cancelled' : ''}`}
                          onClick={() => onSelect(a)}
                          title={`${a.start} · ${a.patientName} · ${STATUS_LABEL[a.status]}`}
                          aria-label={`Cita de ${a.patientName} a las ${a.start}, ${STATUS_LABEL[a.status]}`}
                          style={
                            {
                              '--event-color': colorOf(a),
                              top: ((minuteOfTime(a.start) - START) / 60) * HOUR_HEIGHT + 3,
                              height: Math.max(26, (duration / 60) * HOUR_HEIGHT - 6),
                              left: `calc(${(lane.lane / lane.lanes) * 100}% + 5px)`,
                              width: `calc(${100 / lane.lanes}% - 10px)`,
                            } as CSSProperties
                          }
                        >
                          <span className="calendar-event-time">
                            {a.start}–{hm(minuteOfTime(a.start) + a.duration)}
                            {a.status === 'completed' && (
                              <span className="ml-1" aria-label="Atendida">
                                ✓
                              </span>
                            )}
                          </span>
                          <span className="calendar-event-name">{a.patientName}</span>
                          {a.duration >= 45 && <span className="calendar-event-procedure">{a.treatmentName}</span>}
                          {a.duration >= 75 && <span className="calendar-event-provider">{a.dentistName}</span>}
                        </button>
                      )
                    })}
                    {column.date === today && now >= START && now < END && (
                      <div className="calendar-now" style={{ top: ((now - START) / 60) * HOUR_HEIGHT }}>
                        <span>{clock}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniMonth({ date, onSelect }: { date: string; onSelect: (date: string) => void }) {
  const [cursor, setCursor] = useState(date)
  return (
    <section aria-label="Elegir día del mes">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold capitalize">{format(cursor, { month: 'long', year: 'numeric' })}</h3>
        <div className="flex">
          <button
            className="calendar-mini-arrow"
            onClick={() => setCursor(moveMonth(cursor, -1))}
            aria-label="Mes anterior en calendario pequeño"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            className="calendar-mini-arrow"
            onClick={() => setCursor(moveMonth(cursor, 1))}
            aria-label="Mes siguiente en calendario pequeño"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="calendar-mini-grid">
        {WEEKDAYS.map((day, i) => (
          <span key={i} className="py-1 text-[0.6rem] text-muted">
            {day}
          </span>
        ))}
        {monthDates(cursor).map((day) => (
          <button
            key={day}
            className={`calendar-mini-date ${day === date ? 'is-selected' : ''} ${day === todayLaPaz() ? 'is-today' : ''} ${day.slice(0, 7) !== cursor.slice(0, 7) ? 'is-outside' : ''}`}
            aria-label={`Elegir ${format(day, { dateStyle: 'long' })}`}
            aria-pressed={day === date}
            onClick={() => onSelect(day)}
          >
            {+day.slice(8)}
          </button>
        ))}
      </div>
    </section>
  )
}
