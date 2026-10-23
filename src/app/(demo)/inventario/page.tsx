'use client'
import { useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, PackagePlus } from 'lucide-react'
import { useDB, byId, adjustStock, type InventoryItem } from '@/lib/data'
import { PageHeader, Card, Stat, Bar, Modal, Field } from '@/components/ui'

export default function Inventario() {
  const db = useDB()
  const admin = db.session!.role === 'admin'
  const [proc, setProc] = useState('resina2')
  const [restock, setRestock] = useState<InventoryItem | null>(null)
  const low = db.inventory.filter((i) => i.stock <= i.min)
  const moved = db.inventory.filter((i) => i.lastChange).sort((a, b) => b.lastChange!.at.localeCompare(a.lastChange!.at))
  const recipe = db.procedureSupplies.filter((s) => s.procedureId === proc)

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Insumos" title="Inventario" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Insumos" value={db.inventory.length} hint="controlados por receta" />
        <Stat label="Stock bajo" value={<span className={low.length ? 'text-warn' : ''}>{low.length}</span>} hint={low.map((i) => i.name).join(', ') || 'todo en orden'} />
        <Stat label="Último movimiento" value={moved[0] ? `${moved[0].lastChange!.qty > 0 ? '+' : ''}${moved[0].lastChange!.qty}` : '—'} hint={moved[0] ? `${moved[0].name} · ${moved[0].lastChange!.note} · ${moved[0].lastChange!.at}` : 'sin movimientos hoy'} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Stock por insumo">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-medium">Insumo</th>
                  <th className="py-2 pr-3 font-medium">Stock</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 font-medium">Último movimiento</th>
                  {admin && <th className="py-2 font-medium"><span className="sr-only">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {db.inventory.map((i) => {
                  const isLow = i.stock <= i.min
                  return (
                    <tr key={i.id} className={`border-b border-white/6 last:border-0 ${i.lastChange ? 'bg-azure/[0.05]' : ''}`}>
                      <td className="py-2.5 pr-3 text-bone">{i.name}</td>
                      <td className="w-40 py-2.5 pr-3">
                        <span className="num">{i.stock}</span> <span className="text-xs text-muted">{i.unit} · mín. {i.min}</span>
                        <Bar value={i.stock} max={i.min * 3} color={isLow ? '#f2b84b' : '#c9a961'} label={`${i.stock} de ${i.min * 3}`} />
                      </td>
                      <td className="py-2.5 pr-3">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 text-xs text-warn"><AlertTriangle size={13} aria-hidden />Stock bajo</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-ok"><CheckCircle2 size={13} aria-hidden />OK</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted">
                        {i.lastChange ? <><span className={`num ${i.lastChange.qty < 0 ? 'text-bad' : 'text-ok'}`}>{i.lastChange.qty > 0 ? '+' : ''}{i.lastChange.qty}</span> · {i.lastChange.note} · <span className="num">{i.lastChange.at}</span></> : '—'}
                      </td>
                      {admin && (
                        <td className="py-2.5 text-right">
                          <button className="btn btn-ghost p-1.5" aria-label={`Registrar ingreso de ${i.name}`} onClick={() => setRestock(i)}><PackagePlus size={16} /></button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Receta por procedimiento">
          <label className="label" htmlFor="recipe">Procedimiento</label>
          <select id="recipe" className="field" value={proc} onChange={(e) => setProc(e.target.value)}>
            {db.procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ul className="mt-4 space-y-2 text-sm">
            {recipe.map((r) => {
              const item = byId(db.inventory, r.itemId)!
              return (
                <li key={r.itemId} className="flex justify-between gap-2 border-b border-white/6 pb-2 last:border-0">
                  <span className="text-muted">{item.name}</span>
                  <span className="num text-bone">{r.qty} <span className="text-xs text-muted">{item.unit}</span></span>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs text-muted">Cada atención finalizada descuenta esta receta automáticamente. Así se sabe cuánto gasta cada tratamiento. Cantidades [ejemplo] a validar con la clínica.</p>
        </Card>
      </div>

      <Modal open={!!restock} onClose={() => setRestock(null)} title={`Ingreso de ${restock?.name ?? ''}`}>
        {restock && <Restock item={restock} onDone={() => setRestock(null)} />}
      </Modal>
    </div>
  )
}

function Restock({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const [qty, setQty] = useState('')
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(qty)
    if (!Number.isInteger(n) || n <= 0 || n > 10000) return setError('Ingresa una cantidad entera mayor a 0.')
    adjustStock(item.id, n, 'Compra / ingreso')
    onDone()
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label={`Cantidad (${item.unit})`} error={error} hint={`Stock actual: ${item.stock}`}>
        {(id, d) => <input id={id} type="number" min={1} inputMode="numeric" aria-describedby={d} aria-invalid={!!error} className="field" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />}
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button className="btn btn-primary">Registrar ingreso</button>
      </div>
    </form>
  )
}
