'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Field, Modal, PageHeader } from '../ui'
import { ImportPatients } from './import-patients'
import { TeamTab } from './team-tab'
import {
  addHoliday, removeHoliday, saveCabinet, saveCategory, saveHours, saveRecipe, saveTreatment, updateClinic,
} from '@/server/actions/settings'
import { parseBs } from '@/lib/domain/clinical'
import { formatBs } from '@/lib/domain/money'
import { formatDayLong } from '@/lib/domain/time'
import type { SettingsData } from '@/server/queries/settings'
import { useSave, WEEKDAYS } from './use-save'

export const TABS = { clinica: 'Clínica', horarios: 'Horarios y gabinetes', tratamientos: 'Tratamientos y precios', equipo: 'Equipo', importar: 'Importar pacientes' } as const
export type Tab = keyof typeof TABS
export function SettingsView({ data, tab }: { data: SettingsData; tab: Tab }) {
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Solo administrador" title="Configuración" />
      <nav aria-label="Secciones" className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-black/15 p-1">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link key={t} href={`/configuracion?tab=${t}`} aria-current={tab === t ? 'page' : undefined}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${tab === t ? 'bg-white/10 text-gold ring-1 ring-gold/30' : 'text-muted hover:text-bone'}`}>
            {TABS[t]}
          </Link>
        ))}
      </nav>
      {tab === 'clinica' && <ClinicTab data={data} />}
      {tab === 'horarios' && <HoursTab data={data} />}
      {tab === 'tratamientos' && <TreatmentsTab data={data} />}
      {tab === 'equipo' && <TeamTab data={data} />}
      {tab === 'importar' && <ImportPatients />}
    </div>
  )
}

function ClinicTab({ data }: { data: SettingsData }) {
  const [f, setF] = useState(data.clinic)
  const { pending, fields, run, status } = useSave()
  const input = (k: keyof typeof f, label: string, hint?: string) => (
    <Field label={label} error={fields[k]} hint={hint}>{(id) => <input id={id} className="field" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>
  )
  return (
    <section className="glass max-w-2xl p-5">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => updateClinic(f)) }}>
        {input('name', 'Nombre de la clínica')}
        <div className="grid gap-3 sm:grid-cols-2">
          {input('legalName', 'Razón social')}
          {input('nit', 'NIT')}
          {input('phone', 'Teléfono')}
          {input('whatsappNumber', 'WhatsApp')}
        </div>
        {input('address', 'Dirección')}
        {status}
        <button className="btn btn-primary" disabled={pending}>Guardar</button>
      </form>
    </section>
  )
}

function HoursTab({ data }: { data: SettingsData }) {
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

type Treatment = SettingsData['treatments'][number]

function TreatmentsTab({ data }: { data: SettingsData }) {
  const [editing, setEditing] = useState<Treatment | 'new' | null>(null)
  const [recipeFor, setRecipeFor] = useState<Treatment | null>(null)
  const [category, setCategory] = useState('')
  const cat = useSave()
  const catName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? 'Sin categoría'
  const groups = [...new Set(data.treatments.map((t) => t.categoryId))]
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
      <section className="glass p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="title-gold text-lg">Tratamientos <span className="num text-sm text-muted">({data.treatments.length})</span></h2>
          <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} aria-hidden />Nuevo tratamiento</button>
        </div>
        {data.treatments.length === 0 && <p className="text-sm text-muted">Carga tu lista de tratamientos con su duración y precio. Es lo que se agenda y lo que se cobra.</p>}
        {groups.map((g) => (
          <div key={g ?? 'none'} className="mb-4">
            <p className="eyebrow mb-1.5">{catName(g)}</p>
            <ul className="space-y-1.5">
              {data.treatments.filter((t) => t.categoryId === g).map((t) => (
                <li key={t.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm ${t.active ? '' : 'opacity-50'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="text-bone">{t.name}</span>
                    <span className="block text-xs text-muted">{t.durationMin} min{t.requiresTooth ? ' · por pieza' : ''} · {t.recipe.length ? `${t.recipe.length} insumos` : 'sin receta'}{!t.active && ' · inactivo'}</span>
                  </span>
                  <span className="num text-bone">{formatBs(t.priceCents)}</span>
                  <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setRecipeFor(t)}>Receta</button>
                  <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(t)}>Editar</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-muted">Cambiar un precio no altera facturas ni planes ya creados: el precio queda fijado al agregarlo al plan.</p>
      </section>
      <section className="glass h-fit p-5">
        <h2 className="title-gold mb-3 text-lg">Categorías</h2>
        <ul className="mb-3 space-y-1 text-sm text-bone">{data.categories.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); cat.run(() => saveCategory({ name: category }), () => setCategory('')) }}>
          <label className="sr-only" htmlFor="cat-new">Nueva categoría</label>
          <input id="cat-new" className="field" placeholder="Ej. Endodoncia" value={category} onChange={(e) => setCategory(e.target.value)} />
          <button className="btn btn-secondary shrink-0" disabled={cat.pending || category.trim().length < 2}>Agregar</button>
        </form>
        <div className="mt-2">{cat.status}</div>
      </section>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo tratamiento' : 'Editar tratamiento'}>
        {editing && <TreatmentForm key={editing === 'new' ? 'new' : editing.id} t={editing === 'new' ? null : editing} categories={data.categories} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!recipeFor} onClose={() => setRecipeFor(null)} title={`Receta: ${recipeFor?.name ?? ''}`} wide>
        {recipeFor && <RecipeForm key={recipeFor.id} t={recipeFor} supplies={data.supplies} onDone={() => setRecipeFor(null)} />}
      </Modal>
    </div>
  )
}

function TreatmentForm({ t, categories, onDone }: { t: Treatment | null; categories: SettingsData['categories']; onDone: () => void }) {
  const [f, setF] = useState({
    name: t?.name ?? '', categoryId: t?.categoryId ?? '', durationMin: String(t?.durationMin ?? 30), price: t ? String(t.priceCents / 100) : '',
    requiresTooth: t?.requiresTooth ?? false, active: t?.active ?? true,
  })
  const { pending, fields, run, status } = useSave()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const price = parseBs(f.price)
    run(async () => (price === null
      ? { ok: false as const, error: { code: 'VALIDATION' as const, message: 'Escribe el precio.', fields: { priceCents: 'Precio no válido.' } } }
      : saveTreatment({ id: t?.id, name: f.name, categoryId: f.categoryId, durationMin: Number(f.durationMin), priceCents: price, requiresTooth: f.requiresTooth, active: f.active })), onDone)
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <Field label="Nombre" error={fields.name}>{(id) => <input id={id} className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />}</Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Precio (Bs.)" error={fields.priceCents}>{(id) => <input id={id} inputMode="decimal" className="field num" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />}</Field>
        <Field label="Duración" error={fields.durationMin}>
          {(id) => (
            <select id={id} className="field" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })}>
              {Array.from({ length: 16 }, (_, i) => (i + 1) * 15).map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          )}
        </Field>
        <Field label="Categoría">
          {(id) => (
            <select id={id} className="field" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-[#c9a961]" checked={f.requiresTooth} onChange={(e) => setF({ ...f, requiresTooth: e.target.checked })} />Se aplica a una pieza (resina, endodoncia, corona…)</label>
      {t && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-[#c9a961]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Activo (se puede agendar y cobrar)</label>}
      {status}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button className="btn btn-primary" disabled={pending}>Guardar</button>
      </div>
    </form>
  )
}

function RecipeForm({ t, supplies, onDone }: { t: Treatment; supplies: SettingsData['supplies']; onDone: () => void }) {
  const [lines, setLines] = useState(t.recipe.map((r) => ({ supplyItemId: r.supplyItemId, qty: String(r.qty) })))
  const { pending, run, status } = useSave()
  const unit = (id: string) => supplies.find((s) => s.id === id)?.unit ?? ''
  if (!supplies.length) return <p className="text-sm text-muted">Primero carga insumos en <Link href="/inventario" className="text-gold-soft underline">Inventario</Link>.</p>
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Lo que se descuenta del inventario cada vez que se realiza este tratamiento.</p>
      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center gap-2">
            <select aria-label="Insumo" className="field" value={l.supplyItemId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, supplyItemId: e.target.value } : x)))}>
              <option value="">Elige…</option>
              {supplies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input aria-label="Cantidad" inputMode="decimal" className="field num w-24" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
            <span className="w-14 text-xs text-muted">{unit(l.supplyItemId)}</span>
            <button type="button" className="btn btn-ghost p-1.5" aria-label="Quitar" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost text-xs" onClick={() => setLines([...lines, { supplyItemId: '', qty: '1' }])}><Plus size={14} aria-hidden />Agregar insumo</button>
      {status}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending}
          onClick={() => run(() => saveRecipe({ treatmentId: t.id, lines: lines.filter((l) => l.supplyItemId).map((l) => ({ supplyItemId: l.supplyItemId, qty: Number(l.qty.replace(',', '.')) })) }), onDone)}>
          Guardar receta
        </button>
      </div>
    </div>
  )
}
