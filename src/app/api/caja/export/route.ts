import { getCashMonth, validCashMonth } from '@/server/queries/billing'
import { METHOD_LABEL } from '@/lib/domain/clinical'

export const dynamic = 'force-dynamic'

const cell = (value: string | number | null) => {
  const raw = String(value ?? '')
  const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get('mes') ?? ''
  if (!validCashMonth(month)) return new Response('Mes no válido', { status: 400 })
  const report = await getCashMonth(month) // valida rol y RLS antes de leer datos
  const balances = new URL(request.url).searchParams.get('tipo') === 'saldos'
  if (balances) {
    const rows = [
      ['Paciente', 'Comprobante interno', 'Emitida (La Paz)', 'Días pendientes', 'Saldo Bs', 'ID factura'],
      ...report.receivables.map((i) => [i.patient, i.number, new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz', dateStyle: 'short' }).format(new Date(i.issuedAt)), i.days, i.balanceCents / 100, i.id]),
    ]
    return new Response('\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n'), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="saldos-actuales.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  }
  const rows = [
    ['Fecha (La Paz)', 'Tipo', 'Categoría', 'Concepto', 'Paciente', 'Comprobante interno', 'Método', 'Importe Bs', 'ID movimiento'],
    ...report.movements.map((m) => [
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date(m.at)),
      m.kind, m.category, m.concept, m.patient, m.document, METHOD_LABEL[m.method], m.amountCents / 100, m.id,
    ]),
  ]
  return new Response('\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="caja-${month}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
