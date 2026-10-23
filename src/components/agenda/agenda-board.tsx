'use client'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { SourceChip, StatusChip } from '../chips'
import { AppointmentDialog, type DialogPreset } from './appointment-dialog'
import { AppointmentPanel } from './appointment-panel'
import { addDays, formatDayLong, formatTime, hm, minutesOfDay, todayLaPaz, zonedToUtcIso } from '@/lib/domain/time'
import { can, type Role } from '@/server/auth/permissions'
import type { AppointmentCard, DayBoard } from '@/server/queries/types'

const STEP = 30 // minutos por fila
const ROW = 56 // px por fila

export function AgendaBoard({ board, role }: { board: DayBoard; role: Role }) {
  const router = useRouter()
  const [dentist, setDentist] = useState('')
  const [selected, setSelected] = useState<AppointmentCard | null>(null)
  const [creating, setCreating] = useState<DialogPreset | null>(null)
  const [tab, setTab] = useState(0)
  const [pos, setPos] = useState({ c: 0, r: 0 })
  const grid = useRef<HTMLDivElement>(null)
  const refresh = () => router.refresh()
  const canCreate = can(role, 'agenda.manage')
  const isToday = board.date === todayLaPaz()

  const appts = board.appointments.filter((a) => !dentist || a.dentist.id === dentist)
  const open = board.hours ? Number(board.hours.opens.slice(0, 2)) * 60 + Number(board.hours.opens.slice(3)) : 0
  const close = board.hours ? Number(board.hours.closes.slice(0, 2)) * 60 + Number(board.hours.closes.slice(3)) : 0
  const rows = board.hours ? Math.ceil((close - open) / STEP) : 0
  const goDay = (d: string) => router.push(`/agenda?date=${d}`)

  // Rejilla operable con teclado: flechas mueven entre celdas, Enter agenda en esa celda.
  const onGridKey = (e: React.KeyboardEvent) => {
    const d = { ArrowDown: [0, 1], ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowLeft: [-1, 0] }[e.key]
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      return focus({ c: pos.c, r: e.key === 'Home' ? 0 : rows - 1 })
    }
    if (!d) return
    e.preventDefault()
    focus({ c: Math.min(board.cabinets.length - 1, Math.max(0, pos.c + d[0])), r: Math.min(rows - 1, Math.max(0, pos.r + d[1])) })
  }
  const focus = (p: { c: number; r: number }) => {
    setPos(p)
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-cell="${p.c}-${p.r}"]`)?.focus())
  }
  const newAt = (r: number) => setCreating({ date: board.date, startsAt: zonedToUtcIso(board.date, hm(open + r * STEP)), dentistId: dentist || undefined })

  const item = (a: AppointmentCard, style?: React.CSSProperties) => (
    <button
      key={a.id}
      onClick={() => setSelected(a)}
      style={style}
      aria-label={`${formatTime(a.startsAt)}, ${a.patient?.fullName ?? 'Paciente'}, ${a.treatment?.name ?? 'sin tratamiento'}, ${a.dentist.fullName}. Ver detalle`}
      className={`glass flex w-full flex-col justify-start overflow-hidden rounded-xl px-3 py-1.5 text-left transition-shadow duration-150 hover:ring-1 hover:ring-gold/50 ${
        a.status === 'checked_in' ? 'ring-1 ring-warn/50' : a.status === 'in_progress' ? 'ring-1 ring-azure/60' : ''
      } ${['cancelled', 'no_show'].includes(a.status) ? 'opacity-55' : ''} ${style ? 'absolute inset-x-1.5' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="num text-xs text-gold-soft">{formatTime(a.startsAt)}–{formatTime(a.endsAt)}</span>
        <SourceChip source={a.source} campaign={a.campaignName} />
      </div>
      <p className="mt-0.5 truncate text-sm font-medium text-bone">{a.patient?.fullName ?? 'Paciente'}</p>
      {(!style || (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000 >= 40) && (
        <div className="mt-1 flex items-center gap-2">
          <span className="truncate text-xs text-muted">{a.treatment?.name ?? '—'}</span>
          <StatusChip status={a.status} />
        </div>
      )}
    </button>
  )

  const now = minutesOfDay(new Date().toISOString())
  const cabinet = board.cabinets[tab] ?? board.cabinets[0]

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Agenda y gabinetes</p>
          <h1 className="title-gold text-3xl md:text-4xl">{formatDayLong(board.date)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button className="btn btn-secondary p-2" onClick={() => goDay(addDays(board.date, -1))} aria-label="Día anterior"><ChevronLeft size={18} /></button>
            <label className="sr-only" htmlFor="agenda-date">Fecha</label>
            <input id="agenda-date" type="date" className="field w-auto" value={board.date} onChange={(e) => e.target.value && goDay(e.target.value)} />
            <button className="btn btn-secondary p-2" onClick={() => goDay(addDays(board.date, 1))} aria-label="Día siguiente"><ChevronRight size={18} /></button>
            {!isToday && <button className="btn btn-ghost text-xs" onClick={() => goDay(todayLaPaz())}>Hoy</button>}
          </div>
          {role !== 'dentist' && (
            <label className="flex items-center gap-2 text-sm text-muted">Odontólogo
              <select className="field w-auto" value={dentist} onChange={(e) => setDentist(e.target.value)}>
                <option value="">Todos</option>
                {board.dentists.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
              </select>
            </label>
          )}
          {canCreate && <button className="btn btn-primary" onClick={() => setCreating({ date: board.date, dentistId: dentist || undefined })}><Plus size={16} aria-hidden />Nueva cita</button>}
        </div>
      </div>

      {board.closedReason && <p role="status" className="glass mb-4 px-4 py-3 text-sm text-warn">{board.closedReason}</p>}

      {board.cabinets.length === 0 ? (
        <p className="glass p-8 text-center text-sm text-muted">No hay gabinetes activos. El administrador debe configurarlos.</p>
      ) : (
        <>
          {/* Laptop: vista del dia por gabinete */}
          {board.hours && (
            <div className="glass hidden overflow-x-auto p-4 md:block">
              <div ref={grid} role="group" aria-label={`Agenda del ${formatDayLong(board.date)}`} onKeyDown={onGridKey} className="grid min-w-[640px]" style={{ gridTemplateColumns: `56px repeat(${board.cabinets.length}, minmax(0,1fr))` }}>
                <div />
                {board.cabinets.map((c) => (
                  <div key={c.id} className="pb-3 text-center">
                    <p className="title-gold text-base">{c.name}</p>
                    <p className="text-xs text-muted">{appts.filter((a) => a.cabinet.id === c.id && a.status !== 'cancelled').length} citas</p>
                  </div>
                ))}
                <div>
                  {Array.from({ length: rows }, (_, r) => (
                    <div key={r} style={{ height: ROW }} className="num -mt-2 pr-2 text-right text-[0.7rem] text-muted">{(open + r * STEP) % 60 === 0 ? hm(open + r * STEP) : ''}</div>
                  ))}
                </div>
                {board.cabinets.map((c, ci) => (
                  <div key={c.id} role="group" aria-label={c.name} className="relative border-l border-white/6" style={{ height: rows * ROW }}>
                    {Array.from({ length: rows }, (_, r) => (
                      <button
                        key={r}
                        data-cell={`${ci}-${r}`}
                        tabIndex={pos.c === ci && pos.r === r ? 0 : -1}
                        disabled={!canCreate}
                        aria-label={`${c.name}, ${hm(open + r * STEP)}, libre${canCreate ? '. Enter para agendar' : ''}`}
                        onFocus={() => setPos({ c: ci, r })}
                        onClick={() => newAt(r)}
                        className={`block w-full border-t ${(open + r * STEP) % 60 === 0 ? 'border-white/8' : 'border-white/[0.03]'} hover:bg-white/[0.03] focus-visible:bg-white/[0.06]`}
                        style={{ height: ROW }}
                      />
                    ))}
                    {appts.filter((a) => a.cabinet.id === c.id).map((a) => {
                      const start = Math.max(open, minutesOfDay(a.startsAt))
                      const mins = (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000
                      return item(a, { top: ((start - open) / STEP) * ROW + 2, height: Math.max(ROW - 4, (mins / STEP) * ROW - 4) })
                    })}
                    {isToday && now > open && now < close && <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 border-t border-azure shadow-[0_0_8px_#2f7bff]" style={{ top: ((now - open) / STEP) * ROW }} />}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">Flechas para moverte por la rejilla, Enter en un espacio libre para agendar; Tab llega a cada cita.</p>
            </div>
          )}

          {/* Celular (y dias cerrados): un gabinete a la vez */}
          <div className={board.hours ? 'md:hidden' : ''}>
            <div role="tablist" aria-label="Gabinetes" className="glass mb-4 flex gap-1 p-1"
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                const n = (tab + (e.key === 'ArrowRight' ? 1 : -1) + board.cabinets.length) % board.cabinets.length
                setTab(n)
                requestAnimationFrame(() => document.getElementById(`tab-${n}`)?.focus())
              }}>
              {board.cabinets.map((c, i) => (
                <button key={c.id} id={`tab-${i}`} role="tab" aria-selected={tab === i} aria-controls="cabinet-panel" tabIndex={tab === i ? 0 : -1} onClick={() => setTab(i)}
                  className={`flex-1 rounded-xl px-2 py-2 text-sm ${tab === i ? 'bg-white/10 text-gold ring-1 ring-gold/40' : 'text-muted'}`}>{c.name.replace('Gabinete', 'Gab.')}</button>
              ))}
            </div>
            <ul id="cabinet-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-2">
              {appts.filter((a) => a.cabinet.id === cabinet?.id).map((a) => <li key={a.id}>{item(a)}</li>)}
              {!appts.some((a) => a.cabinet.id === cabinet?.id) && <li className="glass p-4 text-sm text-muted">Sin citas en este gabinete.</li>}
            </ul>
          </div>
        </>
      )}

      <AppointmentDialog open={!!creating} onClose={() => setCreating(null)} options={board} preset={creating ?? undefined} onCreated={() => { setCreating(null); refresh() }} />
      <AppointmentPanel appointment={selected} role={role} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); refresh() }} />
    </>
  )
}
