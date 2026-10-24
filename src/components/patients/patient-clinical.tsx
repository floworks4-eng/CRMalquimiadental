'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Odontogram, type ToothMark } from '../odontogram'
import { CONDITION_LABEL, INVOICE_STATUS_LABEL } from '@/lib/domain/clinical'
import { formatBs } from '@/lib/domain/money'
import { formatDate } from '@/lib/domain/time'
import type { InvoiceSummary, PatientClinical } from '@/server/queries/clinical'

/** Historia clínica en la ficha: odontograma acumulado, plan pendiente y atenciones. Solo admin y su odontólogo. */
export function PatientClinicalView({ data, child }: { data: PatientClinical; child: boolean }) {
  const [selected, setSelected] = useState<number>()
  const marks = useMemo(() => {
    const m: Record<number, ToothMark> = {}
    for (const f of data.findings) m[f.tooth] = { condition: f.condition, today: false }
    return m
  }, [data.findings])
  const history = selected ? data.findings.filter((f) => f.tooth === selected) : []
  const pendingTotal = data.pending.reduce((s, i) => s + i.priceCents, 0)
  return (
    <>
      <section className="glass p-5">
        <h2 className="title-gold mb-3 text-lg">Odontograma</h2>
        <Odontogram marks={marks} selected={selected} onSelect={setSelected} initialDentition={child ? 'temporal' : 'permanente'} />
        {selected && (
          <div className="mt-3 rounded-xl border border-white/8 bg-black/15 p-3 text-sm" aria-live="polite">
            <p className="eyebrow mb-1">Pieza {selected}</p>
            {history.length === 0 ? <p className="text-muted">Sin hallazgos registrados.</p> : (
              <ul className="space-y-0.5">{history.map((f) => <li key={f.recordedAt}><span className="num text-muted">{formatDate(f.recordedAt)}</span> · <span className="text-bone">{CONDITION_LABEL[f.condition]}</span>{f.surfaces.length > 0 && ` (${f.surfaces.join('')})`}</li>)}</ul>
            )}
          </div>
        )}
      </section>
      <section className="glass p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="title-gold text-lg">Plan pendiente</h2>
          {data.pending.length > 0 && <span className="num text-sm text-muted">{formatBs(pendingTotal)}</span>}
        </div>
        {data.pending.length === 0 ? <p className="text-sm text-muted">Nada pendiente.</p> : (
          <ul className="space-y-1 text-sm">
            {data.pending.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span className="text-bone">{i.treatmentName}{i.tooth ? <span className="text-muted"> · pieza {i.tooth}</span> : ''}</span>
                <span className="num">{formatBs(i.priceCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="glass p-5">
        <h2 className="title-gold mb-2 text-lg">Atenciones</h2>
        {data.history.length === 0 ? <p className="text-sm text-muted">Todavía no hay atenciones registradas.</p> : (
          <ul>
            {data.history.map((h) => (
              <li key={h.id} className="border-b border-white/6 py-2.5 text-sm last:border-0">
                <Link href={`/consulta/${h.appointmentId}`} className="hover:underline">
                  <span className="num text-gold-soft">{formatDate(h.startedAt)}</span> · <span className="text-bone">{h.chiefComplaint ?? 'Atención'}</span> · <span className="text-muted">{h.dentist}</span>
                </Link>
                <span className="block text-xs text-muted">
                  {h.status === 'in_progress' ? 'En curso' : h.items.join(', ') || 'Sin tratamientos'}
                  {h.invoice && ` · ${h.invoice.number} ${formatBs(h.invoice.totalCents)}`}
                  {h.addenda > 0 && ` · ${h.addenda} addenda${h.addenda > 1 ? 's' : ''}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export function PatientInvoices({ invoices, canCharge }: { invoices: InvoiceSummary[]; canCharge: boolean }) {
  const balance = invoices.filter((i) => i.status !== 'voided').reduce((s, i) => s + i.totalCents - i.paidCents, 0)
  return (
    <section className="glass p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="title-gold text-lg">Cuenta</h2>
        <span className={`num text-sm ${balance ? 'text-warn' : 'text-ok'}`}>{balance ? `Saldo ${formatBs(balance)}` : 'Al día'}</span>
      </div>
      {invoices.length === 0 ? <p className="text-sm text-muted">Sin facturas.</p> : (
        <ul>
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 py-2 text-sm last:border-0">
              <span><span className="num text-bone">{i.number}</span> <span className="text-xs text-muted">· {formatDate(i.issuedAt)} · {INVOICE_STATUS_LABEL[i.status]}</span></span>
              <span className="num">{formatBs(i.paidCents)} / {formatBs(i.totalCents)}</span>
            </li>
          ))}
        </ul>
      )}
      {balance > 0 && canCharge && <Link href="/caja" className="btn btn-secondary mt-3 text-xs">Cobrar en Caja</Link>}
    </section>
  )
}
