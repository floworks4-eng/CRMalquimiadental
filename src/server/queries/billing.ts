import 'server-only'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { dayBoundsUtc, localDate, todayLaPaz } from '@/lib/domain/time'
import { INVOICE_SELECT, mapInvoices, type InvoiceSummary } from './clinical'
import type { PaymentMethod } from '@/lib/domain/clinical'
import { summarizeCashMovements } from '@/lib/domain/cash-report'
import { readPages } from './read-pages'

export type CashMonth = {
  month: string
  billedCents: number
  collectedCents: number
  otherIncomeCents: number
  expensesCents: number
  netCents: number
  pendingCents: number
  aging: { recent: number; middle: number; old: number }
  byMethod: Record<PaymentMethod, number>
  byCategory: { name: string; kind: string; cents: number }[]
  receivables: { id: string; number: string; patient: string; issuedAt: string; days: number; balanceCents: number }[]
  movements: { id: string; at: string; kind: string; category: string; concept: string; amountCents: number; method: PaymentMethod; patient: string | null; document: string | null }[]
}

export function validCashMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= todayLaPaz().slice(0, 7)
}

/** Reporte de gestión completo del mes: todas las páginas, sin truncar el libro de movimientos. */
export async function getCashMonth(month: string): Promise<CashMonth> {
  await requireCapability('cash.read')
  if (!validCashMonth(month)) throw new Error('Mes no válido')
  const supabase = await createClient()
  const start = `${month}-01`
  const [year, number] = month.split('-').map(Number)
  const end = `${year + (number === 12 ? 1 : 0)}-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}-01`
  const [from] = dayBoundsUtc(start)
  const [to] = dayBoundsUtc(end)
  type TxRow = {
    id: string; kind: string; category: string; concept: string; amount_cents: number; method: PaymentMethod; created_at: string
    patient: { full_name: string } | null; invoice: { number: string } | null
  }
  type InvRow = { total_cents: number; issued_at: string }
  type PendingRow = { id: string; number: string; total_cents: number; paid_cents: number; issued_at: string; patient: { full_name: string } | null }
  const message = 'No pudimos cargar el reporte de caja'
  const [tx, invoices, pending] = await Promise.all([
    readPages<TxRow>((a, b) => supabase.from('transactions')
      .select('id, kind, category, concept, amount_cents, method, created_at, patient:patients(full_name), invoice:invoices(number)')
      .gte('created_at', from).lt('created_at', to).order('created_at').order('id').range(a, b), message),
    readPages<InvRow>((a, b) => supabase.from('invoices').select('total_cents, issued_at')
      .in('status', ['issued', 'partially_paid', 'paid']).gte('issued_at', from).lt('issued_at', to).order('issued_at').order('id').range(a, b), message),
    readPages<PendingRow>((a, b) => supabase.from('invoices').select('id, number, total_cents, paid_cents, issued_at, patient:patients(full_name)')
      .in('status', ['issued', 'partially_paid']).order('issued_at').order('id').range(a, b), message),
  ])
  const summary = summarizeCashMovements(tx)
  const today = todayLaPaz()
  const aging = { recent: 0, middle: 0, old: 0 }
  const receivables: CashMonth['receivables'] = []
  let pendingCents = 0
  for (const row of pending) {
    const balance = row.total_cents - row.paid_cents
    pendingCents += balance
    const days = Math.max(0, Math.floor((Date.parse(today + 'T12:00:00Z') - Date.parse(localDate(row.issued_at) + 'T12:00:00Z')) / 86400000))
    receivables.push({ id: row.id, number: row.number, patient: row.patient?.full_name ?? '—', issuedAt: row.issued_at, days, balanceCents: balance })
    if (days <= 30) aging.recent += balance
    else if (days <= 60) aging.middle += balance
    else aging.old += balance
  }
  return {
    month,
    billedCents: invoices.reduce((n, x) => n + x.total_cents, 0),
    ...summary, pendingCents, aging,
    receivables: receivables.sort((a, b) => b.days - a.days || a.number.localeCompare(b.number)),
    movements: tx.map((x) => ({ id: x.id, at: x.created_at, kind: x.kind, category: x.category, concept: x.concept, amountCents: x.amount_cents, method: x.method, patient: x.patient?.full_name ?? null, document: x.invoice?.number ?? null })).reverse(),
  }
}

export type CashSession = {
  id: string; status: 'open' | 'closed'; openedAt: string; openedBy: string; openingFloatCents: number
  closedAt: string | null; closedBy: string | null; expectedCents: number | null; countedCents: number | null; differenceCents: number | null; notes: string | null
}
export type CashMovement = {
  id: string; kind: 'income' | 'expense' | 'adjustment'; category: string; concept: string; amountCents: number; method: PaymentMethod
  createdAt: string; by: string; patient: { id: string; fullName: string } | null; paymentId: string | null; paymentVoided: boolean
}
export type CashDay = {
  date: string
  session: CashSession | null
  expectedCashCents: number | null
  movements: CashMovement[]
  byMethod: Record<PaymentMethod, number>
  incomeCents: number
  expenseCents: number
  pending: InvoiceSummary[]
  recentSessions: CashSession[]
}

type SessionRow = {
  id: string; status: 'open' | 'closed'; opened_at: string; opening_float_cents: number; closed_at: string | null; expected_cents: number | null
  counted_cents: number | null; difference_cents: number | null; notes: string | null
  opener: { full_name: string } | null; closer: { full_name: string } | null
}
const SESSION_SELECT = 'id, status, opened_at, opening_float_cents, closed_at, expected_cents, counted_cents, difference_cents, notes, opener:profiles!cash_sessions_opened_by_fkey(full_name), closer:profiles!cash_sessions_closed_by_fkey(full_name)'
const toSession = (r: SessionRow): CashSession => ({
  id: r.id, status: r.status, openedAt: r.opened_at, openedBy: r.opener?.full_name ?? '—', openingFloatCents: r.opening_float_cents,
  closedAt: r.closed_at, closedBy: r.closer?.full_name ?? null, expectedCents: r.expected_cents, countedCents: r.counted_cents,
  differenceCents: r.difference_cents, notes: r.notes,
})

/** Caja del dia (hora de La Paz): sesion abierta, movimientos, totales por metodo y cuentas por cobrar. */
export async function getCashDay(date: string): Promise<CashDay> {
  await requireCapability('cash.read')
  const supabase = await createClient()
  const [from, to] = dayBoundsUtc(date)
  const message = 'No pudimos cargar la caja del día'
  const [openResult, tx, pending, recentResult] = await Promise.all([
    supabase.from('cash_sessions').select(SESSION_SELECT).eq('status', 'open').maybeSingle(),
    readPages((a, b) => supabase.from('transactions')
      .select('id, kind, category, concept, amount_cents, method, created_at, payment_id, by:profiles(full_name), patient:patients(id, full_name), payment:payments(status)')
      .gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }).order('id').range(a, b), message),
    readPages((a, b) => supabase.from('invoices').select(INVOICE_SELECT).in('status', ['issued', 'partially_paid'])
      .order('issued_at', { ascending: false }).order('id').range(a, b), message),
    supabase.from('cash_sessions').select(SESSION_SELECT).eq('status', 'closed').order('closed_at', { ascending: false }).limit(10),
  ])
  if (openResult.error || recentResult.error) throw new Error(message)
  const open = openResult.data
  const recent = recentResult.data
  const session = open ? toSession(open as unknown as SessionRow) : null
  let expectedCashCents: number | null = null
  if (session) {
    const { data, error } = await supabase.rpc('cash_expected', { p_session: session.id })
    if (error) throw new Error(message)
    expectedCashCents = (data as number | null) ?? null
  }
  const movements = ((tx ?? []) as unknown as {
    id: string; kind: CashMovement['kind']; category: string; concept: string; amount_cents: number; method: PaymentMethod; created_at: string
    payment_id: string | null; by: { full_name: string } | null; patient: { id: string; full_name: string } | null; payment: { status: string } | null
  }[]).map((m) => ({
    id: m.id, kind: m.kind, category: m.category, concept: m.concept, amountCents: m.amount_cents, method: m.method, createdAt: m.created_at,
    by: m.by?.full_name ?? '—', patient: m.patient ? { id: m.patient.id, fullName: m.patient.full_name } : null,
    paymentId: m.kind === 'income' ? m.payment_id : null, paymentVoided: m.payment?.status === 'voided',
  }))
  const byMethod: Record<PaymentMethod, number> = { cash: 0, qr: 0, transfer: 0, card: 0 }
  let incomeCents = 0
  let expenseCents = 0
  for (const m of movements) {
    byMethod[m.method] += m.amountCents
    if (m.amountCents > 0) incomeCents += m.amountCents
    else expenseCents += -m.amountCents
  }
  return {
    date, session, expectedCashCents, movements, byMethod, incomeCents, expenseCents,
    pending: mapInvoices(pending), recentSessions: ((recent ?? []) as unknown as SessionRow[]).map(toSession),
  }
}

export type InvoiceDetail = InvoiceSummary & {
  discountReason: string | null
  items: { description: string; totalCents: number }[]
  payments: { id: string; amountCents: number; method: PaymentMethod; receivedAt: string; status: 'confirmed' | 'voided'; voidReason: string | null; reference: string | null }[]
}

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  await requireCapability('billing.read')
  const supabase = await createClient()
  const { data } = await supabase.from('invoices').select(`${INVOICE_SELECT}, discount_reason, invoice_items(description, total_cents), payments(id, amount_cents, method, received_at, status, void_reason, reference)`).eq('id', id).maybeSingle()
  if (!data) return null
  const r = data as unknown as Record<string, unknown>
  const [base] = mapInvoices([r])
  return {
    ...base,
    discountReason: (r.discount_reason as string | null) ?? null,
    items: ((r.invoice_items ?? []) as { description: string; total_cents: number }[]).map((i) => ({ description: i.description, totalCents: i.total_cents })),
    payments: ((r.payments ?? []) as { id: string; amount_cents: number; method: PaymentMethod; received_at: string; status: 'confirmed' | 'voided'; void_reason: string | null; reference: string | null }[])
      .sort((a, b) => a.received_at.localeCompare(b.received_at))
      .map((p) => ({ id: p.id, amountCents: p.amount_cents, method: p.method, receivedAt: p.received_at, status: p.status, voidReason: p.void_reason, reference: p.reference })),
  }
}
