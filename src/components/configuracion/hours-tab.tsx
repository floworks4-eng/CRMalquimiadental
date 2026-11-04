'use client'
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { addHoliday, removeHoliday, saveCabinet, saveHours } from '@/server/actions/settings'
import { formatDayLong } from '@/lib/domain/time'
import type { SettingsData } from '@/server/queries/settings'
import { useSave, WEEKDAYS } from './use-save'

export function HoursTab({ data }: { data: SettingsData }) {
  const [days, setDays] = useState(data.hours)
  const [holiday, setHoliday] = useState({ date: '', name: '' })
  const [cabinet, setCabinet] = useState('')
  const hours = useSave()
  const hol = useSave()
  const cab = useSave()
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <section className="glass p-5">
        <h2 className="title-gold mb-1 text-lg">Horario de atención</h2>
        <p className="mb-3 text-xs text-muted">La agenda solo permite citas dentro de este horario.</p>
        <ul className="space-y-2">
          {order.map((w) => {
            const d = days[w]
            const upd = (patch: Partial<typeof d>) => setDays(days.map((x) => (x.weekday === w ? { ...x, ...patch } : x)))
            return (
              <li key={w} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-sm text-bone">{WEEKDAYS[w]}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" className="accent-[#c9a961]" checked={!d.closed} onChange={(e) => upd({ closed: !e.target.checked })} />Abre</label>
                {!d.closed && (
                  <>
                    <input type="time" step={900} aria-label={`${WEEKDAYS[w]} apertura`} className="field w-auto py-1.5" value={d.opens} onChange={(e) => upd({ opens: e.target.value })} />
                    <span className="text-muted">a</span>
                    <input type="time" step={900} aria-label={`${WEEKDAYS[w]} cierre`} className="field w-auto py-1.5" value={d.closes} onChange={(e) => upd({ closes: e.target.value })} />
                  </>
                )}
              </li>
            )
          })}
        </ul>
        <div className="mt-4 space-y-2">
          {hours.status}
          <button className="btn btn-primary" disabled={hours.pending} onClick={() => hours.run(() => saveHours({ days: days.map((d) => ({ weekday: d.weekday, closed: d.closed, opens: d.opens, closes: d.closes })) }))}>Guardar horario</button>
        </div>
      </section>

      <div className="space-y-5">
        <section className="glass p-5">
          <h2 className="title-gold mb-3 text-lg">Gabinetes</h2>
          <ul className="space-y-1.5">
            {data.cabinets.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm">
                <span className={c.active ? 'text-bone' : 'text-muted line-through'}>{c.name}</span>
                <button className="btn btn-ghost px-2 py-1 text-xs" disabled={cab.pending} onClick={() => cab.run(() => saveCabinet({ id: c.id, name: c.name, active: !c.active }))}>
                  {c.active ? 'Desactivar' : 'Activar'}
                </button>
              </li>
            ))}
          </ul>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); cab.run(() => saveCabinet({ name: cabinet }), () => setCabinet('')) }}>
            <label className="sr-only" htmlFor="cab-new">Nuevo gabinete</label>
            <input id="cab-new" className="field" placeholder="Nuevo gabinete" value={cabinet} onChange={(e) => setCabinet(e.target.value)} />
            <button className="btn btn-secondary shrink-0" disabled={cab.pending || cabinet.trim().length < 2}><Plus size={16} aria-hidden />Agregar</button>
          </form>
          <div className="mt-2">{cab.status}</div>
        </section>

        <section className="glass p-5">
          <h2 className="title-gold mb-3 text-lg">Feriados y días sin atención</h2>
          {data.holidays.length === 0 ? <p className="text-sm text-muted">Ninguno próximo.</p> : (
            <ul className="space-y-1.5 text-sm">
              {data.holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2">
                  <span><span className="text-bone">{formatDayLong(h.date)}</span> · <span className="text-muted">{h.name}</span></span>
                  <button className="btn btn-ghost p-1.5" aria-label={`Quitar ${h.name}`} disabled={hol.pending} onClick={() => hol.run(() => removeHoliday(h.id))}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <form className="mt-3 grid grid-cols-[auto_1fr_auto] gap-2" onSubmit={(e) => { e.preventDefault(); hol.run(() => addHoliday(holiday), () => setHoliday({ date: '', name: '' })) }}>
            <input type="date" aria-label="Fecha" className="field w-auto" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} />
            <input aria-label="Motivo" className="field" placeholder="Motivo (ej. Año Nuevo)" value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} />
            <button className="btn btn-secondary" disabled={hol.pending || !holiday.date}>Agregar</button>
          </form>
          <div className="mt-2">{hol.status}</div>
        </section>
      </div>
    </div>
  )
}
