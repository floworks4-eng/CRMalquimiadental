import Link from 'next/link'
import { Download } from 'lucide-react'
import { requireCapability } from '@/server/auth/guards'
import { getCashMonth, validCashMonth } from '@/server/queries/billing'
import { METHOD_LABEL, METHODS } from '@/lib/domain/clinical'
import { formatBs } from '@/lib/domain/money'
import { formatDateTime, todayLaPaz } from '@/lib/domain/time'

export const metadata = { title: 'Resumen de caja · Alquimia Dental' }

function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, number - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default async function CashSummaryPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireCapability('cash.read')
  const requested = (await searchParams).mes ?? ''
  const month = validCashMonth(requested) ? requested : todayLaPaz().slice(0, 7)
  const d = await getCashMonth(month)
  const title = new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`))
  const next = shiftMonth(month, 1)
  const lastMonth = todayLaPaz().slice(0, 7)
  const cards = [
    ['Facturado (interno)', d.billedCents],
    ['Cobrado por tratamientos', d.collectedCents],
    ['Otros ingresos', d.otherIncomeCents],
    ['Gastos pagados', d.expensesCents],
    ['Flujo neto del mes', d.netCents],
    ['Por cobrar hoy', d.pendingCents],
  ] as const
  return <div className="fade-in space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><Link href="/caja" className="text-xs text-gold hover:underline">← Caja diaria</Link><p className="eyebrow mt-3">Control de la clínica</p><h1 className="title-gold mt-1 text-3xl">Resumen de {title}</h1></div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/caja/resumen?mes=${shiftMonth(month, -1)}`} className="btn btn-secondary" aria-label="Mes anterior">←</Link>
        {next <= lastMonth && <Link href={`/caja/resumen?mes=${next}`} className="btn btn-secondary" aria-label="Mes siguiente">→</Link>}
        <a href={`/api/caja/export?mes=${month}`} className="btn btn-primary"><Download size={16} aria-hidden />Exportar movimientos CSV</a>
        <a href={`/api/caja/export?mes=${month}&tipo=saldos`} className="btn btn-secondary"><Download size={16} aria-hidden />Exportar saldos CSV</a>
      </div>
    </div>
    <p className="text-sm text-muted">Facturado = atenciones emitidas este mes. Cobrado y gastos = movimientos registrados este mes. «Por cobrar» es el saldo abierto actual, incluso de meses anteriores. Las anulaciones reducen lo cobrado.</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{cards.map(([label, cents]) => <div key={label} className="glass p-4"><p className="text-xs text-muted">{label}</p><p className="num mt-2 text-xl font-semibold text-bone sm:text-2xl">{formatBs(cents)}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="glass p-5"><h2 className="title-gold text-lg">Flujo por método</h2><ul className="mt-3 space-y-2 text-sm">{METHODS.map((method) => <li key={method} className="flex justify-between gap-2"><span className="text-muted">{METHOD_LABEL[method]}</span><span className="num">{formatBs(d.byMethod[method])}</span></li>)}</ul><p className="mt-3 text-xs text-muted">Importes netos, incluidas anulaciones y gastos.</p></section>
      <section className="glass p-5"><h2 className="title-gold text-lg">En qué se movió el dinero</h2>{d.byCategory.length ? <ul className="mt-3 space-y-2 text-sm">{d.byCategory.map((c) => <li key={`${c.kind}-${c.name}`} className="flex justify-between gap-2"><span className="truncate text-muted">{c.kind === 'expense' ? 'Gasto' : c.kind === 'adjustment' ? 'Anulación' : 'Ingreso'} · {c.name}</span><span className="num shrink-0">{formatBs(c.cents)}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted">Sin movimientos este mes.</p>}</section>
      <section className="glass p-5"><h2 className="title-gold text-lg">Saldos pendientes hoy</h2><p className="mt-1 text-xs text-muted">Antigüedad desde la emisión</p><ul className="mt-3 space-y-2 text-sm"><li className="flex justify-between"><span>0 a 30 días</span><span className="num">{formatBs(d.aging.recent)}</span></li><li className="flex justify-between"><span>31 a 60 días</span><span className="num">{formatBs(d.aging.middle)}</span></li><li className="flex justify-between"><span>Más de 60 días</span><span className="num">{formatBs(d.aging.old)}</span></li></ul></section>
    </div>
    <section className="glass overflow-hidden p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="title-gold text-lg">Libro de movimientos</h2><span className="text-xs text-muted">{d.movements.length} en el mes · CSV completo</span></div>
      {d.movements.length === 0 ? <p className="mt-3 text-sm text-muted">No hay movimientos en este mes.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-muted"><tr><th className="pb-2 pr-3">Fecha</th><th className="pb-2 pr-3">Concepto</th><th className="pb-2 pr-3">Categoría</th><th className="pb-2 pr-3">Método</th><th className="pb-2 text-right">Importe</th></tr></thead><tbody>{d.movements.slice(0, 100).map((m) => <tr key={m.id} className="border-b border-white/6"><td className="whitespace-nowrap py-2 pr-3 num text-muted">{formatDateTime(m.at)}</td><td className="py-2 pr-3">{m.concept}<span className="block text-xs text-muted">{m.patient ?? m.document ?? ''}</span></td><td className="py-2 pr-3 text-muted">{m.category}</td><td className="py-2 pr-3 text-muted">{METHOD_LABEL[m.method]}</td><td className={`py-2 text-right num ${m.amountCents < 0 ? 'text-bad' : 'text-ok'}`}>{formatBs(m.amountCents)}</td></tr>)}</tbody></table>{d.movements.length > 100 && <p className="mt-3 text-xs text-muted">Se muestran 100 movimientos. Exporta el CSV para revisar todos.</p>}</div>}
    </section>
    <section className="glass overflow-hidden p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="title-gold text-lg">Facturas internas por cobrar</h2><span className="text-xs text-muted">{d.receivables.length} saldos abiertos hoy</span></div>
      {d.receivables.length === 0 ? <p className="mt-3 text-sm text-muted">No hay saldos pendientes.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-muted"><tr><th className="pb-2 pr-3">Paciente</th><th className="pb-2 pr-3">Comprobante</th><th className="pb-2 pr-3">Emitida</th><th className="pb-2 pr-3">Antigüedad</th><th className="pb-2 text-right">Saldo</th></tr></thead><tbody>{d.receivables.slice(0, 100).map((i) => <tr key={i.id} className="border-b border-white/6"><td className="py-2 pr-3">{i.patient}</td><td className="py-2 pr-3 num">{i.number}</td><td className="py-2 pr-3 num text-muted">{formatDateTime(i.issuedAt)}</td><td className="py-2 pr-3 text-muted">{i.days} días</td><td className="py-2 text-right num text-warn">{formatBs(i.balanceCents)}</td></tr>)}</tbody></table>{d.receivables.length > 100 && <p className="mt-3 text-xs text-muted">Se muestran 100 saldos. El CSV incluye todos.</p>}</div>}
    </section>
    <p className="text-xs text-muted">Este es un control administrativo. Las facturas internas no son documentos fiscales del SIN y este resumen no presenta declaraciones tributarias.</p>
  </div>
}
