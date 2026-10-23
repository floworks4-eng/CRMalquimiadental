'use client'
import { useState, type FormEvent } from 'react'
import { Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useDB, todayISO, fechaLarga, bs, addTransaction, METHOD_LABEL, type PayMethod } from '@/lib/data'
import { PageHeader, Card, Stat, Modal, Field } from '@/components/ui'

export default function Caja() {
  const db = useDB()
  const [method, setMethod] = useState<PayMethod | ''>('')
  const [open, setOpen] = useState(false)
  const today = todayISO()
  const tx = db.transactions.filter((t) => t.date === today)
  const income = tx.filter((t) => t.kind === 'ingreso').reduce((s, t) => s + t.amount, 0)
  const out = tx.filter((t) => t.kind === 'egreso').reduce((s, t) => s + t.amount, 0)
  const by = (m: PayMethod) => tx.filter((t) => t.kind === 'ingreso' && t.method === m).reduce((s, t) => s + t.amount, 0)
  const list = tx.filter((t) => !method || t.method === method).sort((a, b) => b.time.localeCompare(a.time))

  return (
    <div className="fade-in">
      <PageHeader eyebrow={`Finanzas · ${fechaLarga(today)}`} title="Caja del día">
        <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} aria-hidden />Registrar movimiento</button>
      </PageHeader>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Ingresos" value={bs(income)} />
        <Stat label="Egresos" value={bs(out)} />
        <div className="halo relative col-span-2 lg:col-span-1"><Stat label="Neto" value={<span className="text-gold">{bs(income - out)}</span>} /></div>
        {(['qr', 'transferencia', 'efectivo'] as const).map((m) => <Stat key={m} label={METHOD_LABEL[m]} value={bs(by(m))} />)}
      </div>
      <Card
        title="Movimientos de hoy"
        action={
          <label className="flex items-center gap-2 text-sm text-muted">Método
            <select className="field w-auto" value={method} onChange={(e) => setMethod(e.target.value as PayMethod | '')}>
              <option value="">Todos</option>
              {(['qr', 'transferencia', 'efectivo'] as const).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          </label>
        }
      >
        <ul>
          {list.map((t) => (
            <li key={t.id} className={`flex items-center gap-3 border-b border-white/6 py-3 last:border-0`}>
              <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${t.kind === 'ingreso' ? 'border-ok/40 text-ok' : 'border-bad/40 text-bad'}`}>
                {t.kind === 'ingreso' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-bone">{t.concept}</span>
                <span className="text-xs text-muted"><span className="num">{t.time}</span> · {METHOD_LABEL[t.method]} · {t.kind === 'ingreso' ? 'Ingreso' : 'Egreso'}{t.appointmentId && ' · desde consulta'}</span>
              </span>
              <span className={`num shrink-0 ${t.kind === 'ingreso' ? 'text-bone' : 'text-bad'}`}>{t.kind === 'egreso' ? '−' : '+'}{bs(t.amount)}</span>
            </li>
          ))}
          {!list.length && <li className="py-4 text-sm text-muted">Sin movimientos.</li>}
        </ul>
        <p className="mt-3 text-xs text-muted">Los cobros de cada consulta finalizada entran aquí solos, con el método elegido. Sin pagos reales en la demo.</p>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar movimiento">
        {open && <NewTx onDone={() => setOpen(false)} />}
      </Modal>
    </div>
  )
}

function NewTx({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ kind: 'ingreso' as 'ingreso' | 'egreso', concept: '', amount: '', method: 'qr' as PayMethod })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    const amount = Number(f.amount)
    if (f.concept.trim().length < 3) err.concept = 'Describe el movimiento.'
    if (!(amount > 0) || amount > 100000) err.amount = 'Monto en Bs. mayor a 0.'
    setErrors(err)
    if (Object.keys(err).length) return
    addTransaction({ kind: f.kind, concept: f.concept.trim(), amount: Math.round(amount), method: f.method })
    onDone()
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <fieldset>
        <legend className="label">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['ingreso', 'egreso'] as const).map((k) => (
            <label key={k} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm capitalize ${f.kind === k ? 'border-gold/60 bg-gold/10' : 'border-white/10 text-muted'}`}>
              <input type="radio" name="kind" className="accent-[#c9a961]" checked={f.kind === k} onChange={() => setF({ ...f, kind: k })} />{k}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Concepto" error={errors.concept}>
        {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.concept} className="field" value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto (Bs.)" error={errors.amount}>
          {(id, d) => <input id={id} type="number" min={1} inputMode="decimal" aria-describedby={d} aria-invalid={!!errors.amount} className="field num" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
        </Field>
        <Field label="Método">
          {(id) => (
            <select id={id} className="field" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PayMethod })}>
              {(['qr', 'transferencia', 'efectivo'] as const).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button className="btn btn-primary">Guardar</button>
      </div>
    </form>
  )
}
