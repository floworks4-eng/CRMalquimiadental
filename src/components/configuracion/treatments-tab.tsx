'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Field, Modal } from '../ui'
import { saveCategory, saveRecipe, saveTreatment } from '@/server/actions/settings'
import { parseBs } from '@/lib/domain/clinical'
import { formatBs } from '@/lib/domain/money'
import type { SettingsData } from '@/server/queries/settings'
import { useSave } from './use-save'

type Treatment = SettingsData['treatments'][number]

export function TreatmentsTab({ data }: { data: SettingsData }) {
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

      {editing && <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo tratamiento' : 'Editar tratamiento'}>
        <TreatmentForm key={editing === 'new' ? 'new' : editing.id} t={editing === 'new' ? null : editing} categories={data.categories} onDone={() => setEditing(null)} />
      </Modal>}
      {recipeFor && <Modal open={!!recipeFor} onClose={() => setRecipeFor(null)} title={`Receta: ${recipeFor.name}`} wide>
        <RecipeForm key={recipeFor.id} t={recipeFor} supplies={data.supplies} onDone={() => setRecipeFor(null)} />
      </Modal>}
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
