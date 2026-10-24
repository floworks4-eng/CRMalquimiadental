'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Wallet } from 'lucide-react'
import { Field, Modal, PageHeader, Stat } from '../ui'
import { addCashMovement, closeCash, openCash, recordPayment, voidPayment } from '@/server/actions/billing'
import { INVOICE_STATUS_LABEL, METHOD_LABEL, METHODS, parseBs, type PaymentMethod } from '@/lib/domain/clinical'
import { formatBs } from '@/lib/domain/money'
import { addDays, formatDate, formatDateTime, formatDayLong, formatTime, todayLaPaz } from '@/lib/domain/time'
import type { CashDay } from '@/server/queries/billing'
import type { InvoiceSummary } from '@/server/queries/clinical'
import type { ActionResult } from '@/server/errors'

type Dialog = { kind: 'open' } | { kind: 'close' } | { kind: 'movement'; type: 'income' | 'expense' } | { kind: 'pay'; invoice: InvoiceSummary } | { kind: 'void'; paymentId: string; concept: string } | null

export function CajaView({ day, canVoid }: { day: CashDay; canVoid: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)
  const s = day.session
  const isToday = day.date === todayLaPaz()
  return (
    <div className="fade-in">
      <PageHeader eyebrow={formatDayLong(day.date)} title="Caja">
        <Link href={`/caja?date=${addDays(day.date, -1)}`} className="btn btn-ghost" aria-label="Día anterior">←</Link>
        <Link href="/caja" className="btn btn-secondary">Hoy</Link>
        {!isToday && <Link href={`/caja?date=${addDays(day.date, 1)}`} className="btn btn-ghost" aria-label="Día siguiente">→</Link>}
      </PageHeader>

      <section className={`glass relative mb-5 p-5 ${s ? 'halo' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">{s ? 'Caja abierta' : 'Caja cerrada'}</p>
            {s ? (
              <p className="mt-1 text-sm text-muted">
                Desde {formatDateTime(s.openedAt)} por {s.openedBy} · fondo <span className="num text-bone">{formatBs(s.openingFloatCents)}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Ábrela al empezar el día con el efectivo que hay en el cajón. Si entra efectivo sin caja abierta, se abre sola con fondo 0.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {s && day.expectedCashCents !== null && (
              <span className="text-right"><span className="eyebrow block">Efectivo esperado</span><span className="num text-2xl text-gold">{formatBs(day.expectedCashCents)}</span></span>
            )}
            {s ? (
              <button className="btn btn-primary" onClick={() => setDialog({ kind: 'close' })}><Lock size={16} aria-hidden />Cerrar caja (arqueo)</button>
            ) : (
              <button className="btn btn-primary" onClick={() => setDialog({ kind: 'open' })}><Unlock size={16} aria-hidden />Abrir caja</button>
            )}
          </div>
        </div>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Entradas" value={formatBs(day.incomeCents)} />
        <Stat label="Salidas" value={formatBs(day.expenseCents)} />
        {METHODS.map((m) => <Stat key={m} label={METHOD_LABEL[m]} value={formatBs(day.byMethod[m])} />)}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="glass p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="title-gold text-lg">Movimientos del día</h2>
            <span className="flex gap-2">
              <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setDialog({ kind: 'movement', type: 'expense' })}><ArrowUpCircle size={14} aria-hidden />Gasto</button>
              <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setDialog({ kind: 'movement', type: 'income' })}><ArrowDownCircle size={14} aria-hidden />Otro ingreso</button>
            </span>
          </div>
          {day.movements.length === 0 ? <p className="text-sm text-muted">Sin movimientos.</p> : (
            <ul>
              {day.movements.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 py-2.5 text-sm last:border-0">
                  <span className="min-w-0">
                    <span className="num text-muted">{formatTime(m.createdAt)}</span> <span className={m.paymentVoided ? 'text-muted line-through' : 'text-bone'}>{m.concept}</span>
                    <span className="block text-xs text-muted">
                      {METHOD_LABEL[m.method]} · {m.category} · {m.by}
                      {m.patient && <> · <Link href={`/pacientes/${m.patient.id}`} className="hover:underline">{m.patient.fullName}</Link></>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`num ${m.amountCents < 0 ? 'text-bad' : 'text-ok'}`}>{m.amountCents > 0 ? '+' : ''}{formatBs(m.amountCents)}</span>
                    {canVoid && m.paymentId && !m.paymentVoided && (
                      <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setDialog({ kind: 'void', paymentId: m.paymentId!, concept: m.concept })}>Anular</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          <section className="glass p-5">
            <h2 className="title-gold mb-3 text-lg">Por cobrar <span className="num text-sm text-muted">({day.pending.length})</span></h2>
            {day.pending.length === 0 ? <p className="text-sm text-muted">No hay saldos pendientes.</p> : (
              <ul>
                {day.pending.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 py-2.5 text-sm last:border-0">
                    <span className="min-w-0">
                      <span className="text-bone">{i.patient?.fullName ?? '—'}</span>
                      <span className="block text-xs text-muted"><span className="num">{i.number}</span> · {formatDate(i.issuedAt)} · {INVOICE_STATUS_LABEL[i.status]}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="num text-warn">{formatBs(i.totalCents - i.paidCents)}</span>
                      <button className="btn btn-primary px-3 py-1 text-xs" onClick={() => setDialog({ kind: 'pay', invoice: i })}><Wallet size={13} aria-hidden />Cobrar</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="glass p-5">
            <h2 className="title-gold mb-3 text-lg">Cierres anteriores</h2>
            {day.recentSessions.length === 0 ? <p className="text-sm text-muted">Todavía no hay cierres.</p> : (
              <ul className="space-y-1.5 text-sm">
                {day.recentSessions.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted">{c.closedAt ? formatDateTime(c.closedAt) : '—'} · {c.closedBy}</span>
                    <span className="num">
                      {formatBs(c.countedCents ?? 0)}
                      {c.differenceCents ? <span className={`ml-2 ${c.differenceCents < 0 ? 'text-bad' : 'text-warn'}`} title={c.notes ?? undefined}>({c.differenceCents > 0 ? '+' : ''}{formatBs(c.differenceCents)})</span> : <span className="ml-2 text-ok">cuadró</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Modal open={!!dialog} onClose={close}
        title={dialog?.kind === 'open' ? 'Abrir caja' : dialog?.kind === 'close' ? 'Cerrar caja' : dialog?.kind === 'pay' ? 'Cobrar saldo' : dialog?.kind === 'void' ? 'Anular cobro' : dialog?.kind === 'movement' ? (dialog.type === 'expense' ? 'Registrar gasto' : 'Registrar otro ingreso') : ''}>
        {dialog && <DialogBody key={dialog.kind} dialog={dialog} expected={day.expectedCashCents} onDone={close} />}
      </Modal>
    </div>
  )
}

function DialogBody({ dialog, expected, onDone }: { dialog: NonNullable<Dialog>; expected: number | null; onDone: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [amount, setAmount] = useState(dialog.kind === 'pay' ? String((dialog.invoice.totalCents - dialog.invoice.paidCents) / 100) : '')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [key] = useState(() => crypto.randomUUID())
  const [closed, setClosed] = useState<{ expectedCents: number; countedCents: number; differenceCents: number } | null>(null)

  const send = (fn: () => Promise<ActionResult<unknown>>, keepOpen = false) => start(async () => {
    setError('')
    setFields({})
    const r = await fn()
    if (!r.ok) {
      setError(r.error.message)
      return setFields(r.error.fields ?? {})
    }
    router.refresh()
    if (!keepOpen) onDone()
  })
  const cents = () => {
    const c = parseBs(amount)
    if (c === null) setFields({ amount: 'Escribe un monto válido (ej. 150 o 150,50).' })
    return c
  }
  const methodPicker = (
    <fieldset>
      <legend className="label">Método</legend>
      <div className="grid grid-cols-4 gap-2">
        {METHODS.map((m) => (
          <label key={m} className={`flex cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-sm ${method === m ? 'border-gold/60 bg-gold/10 text-bone' : 'border-white/10 text-muted'}`}>
            <input type="radio" name="method" className="sr-only" checked={method === m} onChange={() => setMethod(m)} />{METHOD_LABEL[m]}
          </label>
        ))}
      </div>
    </fieldset>
  )
  const amountField = (label: string, hint?: string) => (
    <Field label={label} error={fields.amount} hint={hint}>{(id) => <input id={id} inputMode="decimal" className="field num" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />}</Field>
  )
  const footer = (label: string, onClick: () => void) => (
    <>
      {error && !Object.keys(fields).length && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={onClick}>{pending ? 'Guardando…' : label}</button>
      </div>
    </>
  )

  if (dialog.kind === 'open') {
    return <div className="space-y-4">{amountField('Fondo inicial en efectivo (Bs.)', 'Lo que hay en el cajón al empezar. Puede ser 0.')}{footer('Abrir caja', () => { const c = cents(); if (c !== null) send(() => openCash({ openingFloatCents: c })) })}</div>
  }
  if (dialog.kind === 'close') {
    if (closed) {
      return (
        <div className="space-y-3 text-center" role="status">
          <p className="title-gold text-2xl">Caja cerrada</p>
          <p className="text-sm">Esperado <span className="num">{formatBs(closed.expectedCents)}</span> · contado <span className="num">{formatBs(closed.countedCents)}</span></p>
          <p className={`num text-xl ${closed.differenceCents ? 'text-warn' : 'text-ok'}`}>{closed.differenceCents ? `Diferencia ${formatBs(closed.differenceCents)}` : 'Cuadró exacto'}</p>
          <button className="btn btn-primary" onClick={onDone}>Listo</button>
        </div>
      )
    }
    const c = parseBs(amount)
    const diff = c !== null && expected !== null ? c - expected : null
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Cuenta el efectivo del cajón. El sistema compara con lo esperado: <span className="num text-bone">{formatBs(expected ?? 0)}</span>.</p>
        {amountField('Efectivo contado (Bs.)')}
        {diff !== null && diff !== 0 && <p className={`text-sm ${diff < 0 ? 'text-bad' : 'text-warn'}`}>Diferencia: <span className="num">{formatBs(diff)}</span>. Explica el motivo.</p>}
        <Field label="Notas del cierre" error={fields.notes}>{(id) => <textarea id={id} rows={2} className="field" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        {footer('Cerrar caja', () => {
          const v = cents()
          if (v === null) return
          start(async () => {
            const r = await closeCash({ countedCents: v, notes: text || undefined })
            if (!r.ok) { setError(r.error.message); setFields(r.error.fields ?? {}); return }
            setClosed(r.data)
            router.refresh()
          })
        })}
      </div>
    )
  }
  if (dialog.kind === 'pay') {
    const i = dialog.invoice
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">{i.patient?.fullName} · <span className="num">{i.number}</span> · saldo <span className="num text-warn">{formatBs(i.totalCents - i.paidCents)}</span></p>
        {amountField('Monto (Bs.)')}
        {methodPicker}
        <Field label="Referencia (opcional)">{(id) => <input id={id} className="field" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        {footer('Registrar cobro', () => { const c = cents(); if (c !== null) send(() => recordPayment({ invoiceId: i.id, amountCents: c, method, reference: text || undefined, idempotencyKey: key })) })}
      </div>
    )
  }
  if (dialog.kind === 'void') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">«{dialog.concept}». El cobro no se borra: queda anulado con un movimiento en negativo y la factura vuelve a tener saldo.</p>
        <Field label="Motivo" error={fields.reason}>{(id) => <input id={id} className="field" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} autoFocus />}</Field>
        {footer('Anular cobro', () => send(() => voidPayment({ paymentId: dialog.paymentId, reason: text })))}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {amountField('Monto (Bs.)')}
      {methodPicker}
      <Field label="Concepto" error={fields.concept}>{(id) => <input id={id} className="field" maxLength={120} placeholder={dialog.type === 'expense' ? 'Ej. compra de agua, pasajes' : 'Ej. venta de cepillo'} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
      <Field label="Categoría (opcional)">{(id) => <input id={id} className="field" maxLength={40} placeholder={dialog.type === 'expense' ? 'gasto' : 'otro ingreso'} value={category} onChange={(e) => setCategory(e.target.value)} />}</Field>
      {footer('Registrar', () => { const c = cents(); if (c !== null) send(() => addCashMovement({ kind: dialog.type, amountCents: c, method, concept: text, category: category || undefined })) })}
    </div>
  )
}
