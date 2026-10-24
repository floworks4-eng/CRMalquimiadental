'use client'
import { useRouter } from 'next/navigation'
import { Fragment, useState, useTransition } from 'react'
import { AlertTriangle, ChevronDown, PackagePlus, Pencil, Plus } from 'lucide-react'
import { Field, Modal, PageHeader } from '../ui'
import { adjustStock, createSupplier, receiveStock, saveSupplyItem } from '@/server/actions/inventory'
import { STOCK_REASON_LABEL, parseBs } from '@/lib/domain/clinical'
import { formatBs } from '@/lib/domain/money'
import { formatDate, formatDateTime } from '@/lib/domain/time'
import type { Inventory, StockItem, StockLot } from '@/server/queries/inventory'
import type { ActionResult } from '@/server/errors'

type Dialog = { kind: 'item'; item?: StockItem } | { kind: 'receive'; item?: StockItem } | { kind: 'adjust'; item: StockItem; lot: StockLot } | { kind: 'supplier' } | null

const qtyText = (n: number) => String(Math.round(n * 1000) / 1000)
const soon = (date: string | null) => !!date && new Date(date).getTime() - Date.now() < 60 * 86_400_000

export function InventoryView({ data, canManage }: { data: Inventory; canManage: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const items = data.items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
  const low = data.items.filter((i) => i.active && i.minStock > 0 && i.onHand <= i.minStock).length
  return (
    <div className="fade-in">
      <PageHeader eyebrow={low ? `${low} insumos con stock bajo` : 'Stock al día'} title="Inventario">
        {canManage && (
          <>
            <button className="btn btn-secondary" onClick={() => setDialog({ kind: 'item' })}><Plus size={16} aria-hidden />Nuevo insumo</button>
            <button className="btn btn-primary" onClick={() => setDialog({ kind: 'receive' })} disabled={!data.items.length}><PackagePlus size={16} aria-hidden />Registrar ingreso</button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="glass p-5">
          <label className="sr-only" htmlFor="inv-q">Buscar insumo</label>
          <input id="inv-q" className="field mb-3" placeholder="Buscar insumo…" value={q} onChange={(e) => setQ(e.target.value)} />
          {data.items.length === 0 ? (
            <p className="text-sm text-muted">{canManage ? 'Todavía no hay insumos. Crea el primero con «Nuevo insumo» y luego registra su ingreso.' : 'Todavía no hay insumos cargados.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-2 font-normal">Insumo</th><th className="py-2 text-right font-normal">Stock</th><th className="py-2 text-right font-normal">Mínimo</th>
                    <th className="py-2 pl-3 font-normal">Vence</th><th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const isLow = i.minStock > 0 && i.onHand <= i.minStock
                    return (
                      <Fragment key={i.id}>
                        <tr className={`border-t border-white/6 ${i.active ? '' : 'opacity-50'}`}>
                          <td className="py-2.5">
                            <button className="flex items-center gap-1.5 text-left text-bone" aria-expanded={open === i.id} onClick={() => setOpen(open === i.id ? null : i.id)}>
                              <ChevronDown size={14} className={`text-muted transition-transform ${open === i.id ? 'rotate-180' : ''}`} aria-hidden />{i.name}
                            </button>
                            {i.sku && <span className="num ml-5 text-xs text-muted">{i.sku}</span>}
                          </td>
                          <td className={`num py-2.5 text-right ${isLow ? 'text-warn' : 'text-bone'}`}>{isLow && <AlertTriangle size={13} className="mr-1 inline" aria-label="Stock bajo" />}{qtyText(i.onHand)} {i.unit}</td>
                          <td className="num py-2.5 text-right text-muted">{qtyText(i.minStock)}</td>
                          <td className={`num py-2.5 pl-3 ${soon(i.nextExpiry) ? 'text-warn' : 'text-muted'}`}>{i.nextExpiry ? formatDate(i.nextExpiry) : '—'}</td>
                          <td className="py-2.5 text-right">
                            {canManage && (
                              <span className="flex justify-end gap-1">
                                <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setDialog({ kind: 'receive', item: i })}>Ingreso</button>
                                <button className="btn btn-ghost p-1.5" aria-label={`Editar ${i.name}`} onClick={() => setDialog({ kind: 'item', item: i })}><Pencil size={14} /></button>
                              </span>
                            )}
                          </td>
                        </tr>
                        {open === i.id && (
                          <tr>
                            <td colSpan={5} className="pb-3">
                              {i.lots.length === 0 ? <p className="pl-5 text-xs text-muted">Sin lotes con stock.</p> : (
                                <ul className="space-y-1 pl-5 text-xs">
                                  {i.lots.map((l) => (
                                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/15 px-3 py-1.5">
                                      <span className="text-muted">
                                        Lote <span className="text-bone">{l.lotCode ?? 's/n'}</span> · vence <span className="num">{l.expiresOn ? formatDate(l.expiresOn) : '—'}</span>
                                        {l.supplier && ` · ${l.supplier}`}{l.unitCostCents !== null && ` · ${formatBs(l.unitCostCents)} c/u`} · recibido {formatDate(l.receivedAt)}
                                      </span>
                                      <span className="flex items-center gap-2">
                                        <span className="num text-bone">{qtyText(l.qty)} {i.unit}</span>
                                        {canManage && <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => setDialog({ kind: 'adjust', item: i, lot: l })}>Ajustar</button>}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Al finalizar una atención se descuentan los insumos de la receta de cada tratamiento, primero del lote que vence antes.</p>
        </section>

        <section className="glass p-5">
          <h2 className="title-gold mb-3 text-lg">Últimos movimientos</h2>
          {data.moves.length === 0 ? <p className="text-sm text-muted">Sin movimientos todavía.</p> : (
            <ul className="space-y-1.5 text-sm">
              {data.moves.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-2 border-b border-white/6 pb-1.5 last:border-0">
                  <span className="min-w-0">
                    <span className="text-bone">{m.item}</span>
                    <span className="block text-xs text-muted">{STOCK_REASON_LABEL[m.reason]} · {formatDateTime(m.createdAt)} · {m.by}{m.note && ` · ${m.note}`}</span>
                  </span>
                  <span className={`num shrink-0 ${m.delta < 0 ? 'text-bad' : 'text-ok'}`}>{m.delta > 0 ? '+' : ''}{qtyText(m.delta)} {m.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal open={!!dialog} onClose={() => setDialog(null)}
        title={dialog?.kind === 'item' ? (dialog.item ? 'Editar insumo' : 'Nuevo insumo') : dialog?.kind === 'receive' ? 'Registrar ingreso' : dialog?.kind === 'adjust' ? 'Ajustar lote' : 'Nuevo proveedor'}>
        {dialog && <DialogBody key={dialog.kind + ('item' in dialog ? dialog.item?.id : '')} dialog={dialog} data={data} onDone={() => setDialog(null)} onSupplier={() => setDialog({ kind: 'supplier' })} />}
      </Modal>
    </div>
  )
}

function DialogBody({ dialog, data, onDone, onSupplier }: { dialog: NonNullable<Dialog>; data: Inventory; onDone: () => void; onSupplier: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const item = dialog.kind === 'supplier' ? undefined : dialog.item
  const [f, setF] = useState({
    name: item?.name ?? '', unit: item?.unit ?? 'u.', sku: item?.sku ?? '', minStock: item ? qtyText(item.minStock) : '0', active: item?.active ?? true,
    itemId: item?.id ?? '', qty: '', lotCode: '', expiresOn: '', cost: '', supplierId: '', delta: '', reason: 'adjustment' as 'adjustment' | 'waste' | 'return', note: '',
    phone: '', notes: '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value })
  const num = (v: string) => Number(v.replace(',', '.'))
  const send = (fn: () => Promise<ActionResult<unknown>>) => start(async () => {
    setError('')
    setFields({})
    const r = await fn()
    if (!r.ok) {
      setError(r.error.message)
      return setFields(r.error.fields ?? {})
    }
    router.refresh()
    onDone()
  })
  const footer = (label: string, onClick: () => void) => (
    <>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={onClick}>{pending ? 'Guardando…' : label}</button>
      </div>
    </>
  )

  if (dialog.kind === 'item') {
    return (
      <div className="space-y-3">
        <Field label="Nombre" error={fields.name}>{(id) => <input id={id} className="field" value={f.name} onChange={set('name')} autoFocus />}</Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Unidad" error={fields.unit} hint="u., caja, ml, par…">{(id) => <input id={id} className="field" value={f.unit} onChange={set('unit')} />}</Field>
          <Field label="Stock mínimo" error={fields.minStock}>{(id) => <input id={id} inputMode="decimal" className="field num" value={f.minStock} onChange={set('minStock')} />}</Field>
          <Field label="Código (opcional)">{(id) => <input id={id} className="field" value={f.sku} onChange={set('sku')} />}</Field>
        </div>
        {item && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-[#c9a961]" checked={f.active} onChange={set('active')} />Activo</label>}
        {footer('Guardar', () => send(() => saveSupplyItem({ id: item?.id, name: f.name, unit: f.unit, sku: f.sku, minStock: num(f.minStock || '0'), active: f.active })))}
      </div>
    )
  }
  if (dialog.kind === 'receive') {
    return (
      <div className="space-y-3">
        <Field label="Insumo" error={fields.itemId}>
          {(id) => (
            <select id={id} className="field" value={f.itemId} onChange={set('itemId')}>
              <option value="">Elige…</option>
              {data.items.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cantidad" error={fields.qty}>{(id) => <input id={id} inputMode="decimal" className="field num" value={f.qty} onChange={set('qty')} autoFocus />}</Field>
          <Field label="Costo unitario (Bs.)" error={fields.unitCostCents} hint="Opcional.">{(id) => <input id={id} inputMode="decimal" className="field num" value={f.cost} onChange={set('cost')} />}</Field>
          <Field label="Lote (opcional)">{(id) => <input id={id} className="field" value={f.lotCode} onChange={set('lotCode')} />}</Field>
          <Field label="Vencimiento (opcional)" error={fields.expiresOn}>{(id) => <input id={id} type="date" className="field" value={f.expiresOn} onChange={set('expiresOn')} />}</Field>
        </div>
        <Field label="Proveedor (opcional)">
          {(id) => (
            <div className="flex gap-2">
              <select id={id} className="field" value={f.supplierId} onChange={set('supplierId')}>
                <option value="">—</option>
                {data.suppliers.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
              <button type="button" className="btn btn-ghost shrink-0 text-xs" onClick={onSupplier}>+ Proveedor</button>
            </div>
          )}
        </Field>
        {footer('Registrar ingreso', () => {
          const cost = f.cost ? parseBs(f.cost) : undefined
          if (cost === null) return setFields({ unitCostCents: 'Costo no válido.' })
          send(() => receiveStock({ itemId: f.itemId, qty: num(f.qty), lotCode: f.lotCode, expiresOn: f.expiresOn, unitCostCents: cost, supplierId: f.supplierId }))
        })}
      </div>
    )
  }
  if (dialog.kind === 'adjust') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">{dialog.item.name} · lote {dialog.lot.lotCode ?? 's/n'} · hay <span className="num text-bone">{qtyText(dialog.lot.qty)} {dialog.item.unit}</span></p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cantidad (+ suma, − resta)" error={fields.delta}>{(id) => <input id={id} inputMode="decimal" className="field num" placeholder="-2" value={f.delta} onChange={set('delta')} autoFocus />}</Field>
          <Field label="Tipo">
            {(id) => (
              <select id={id} className="field" value={f.reason} onChange={set('reason')}>
                <option value="adjustment">Ajuste (conteo)</option><option value="waste">Merma (vencido, dañado)</option><option value="return">Devolución</option>
              </select>
            )}
          </Field>
        </div>
        <Field label="Motivo" error={fields.note}>{(id) => <input id={id} className="field" maxLength={300} value={f.note} onChange={set('note')} />}</Field>
        {footer('Guardar ajuste', () => send(() => adjustStock({ lotId: dialog.lot.id, delta: num(f.delta), reason: f.reason, note: f.note })))}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Field label="Nombre" error={fields.name}>{(id) => <input id={id} className="field" value={f.name} onChange={set('name')} autoFocus />}</Field>
      <Field label="Teléfono (opcional)">{(id) => <input id={id} className="field" value={f.phone} onChange={set('phone')} />}</Field>
      <Field label="Notas (opcional)">{(id) => <input id={id} className="field" value={f.notes} onChange={set('notes')} />}</Field>
      {footer('Guardar proveedor', () => send(() => createSupplier({ name: f.name, phone: f.phone, notes: f.notes })))}
    </div>
  )
}
