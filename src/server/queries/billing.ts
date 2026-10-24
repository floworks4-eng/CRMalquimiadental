import 'server-only'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { dayBoundsUtc } from '@/lib/domain/time'
import { INVOICE_SELECT, mapInvoices, type InvoiceSummary } from './clinical'
import type { PaymentMethod } from '@/lib/domain/clinical'

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
  const [{ data: open }, { data: tx }, { data: pending }, { data: recent }] = await Promise.all([
    supabase.from('cash_sessions').select(SESSION_SELECT).eq('status', 'open').maybeSingle(),
    supabase.from('transactions')
      .select('id, kind, category, concept, amount_cents, method, created_at, payment_id, by:profiles(full_name), patient:patients(id, full_name), payment:payments(status)')
      .gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }),
    supabase.from('invoices').select(INVOICE_SELECT).in('status', ['issued', 'partially_paid']).order('issued_at', { ascending: false }).limit(100),
    supabase.from('cash_sessions').select(SESSION_SELECT).eq('status', 'closed').order('closed_at', { ascending: false }).limit(10),
  ])
  const session = open ? toSession(open as unknown as SessionRow) : null
  let expectedCashCents: number | null = null
  if (session) {
    const { data } = await supabase.rpc('cash_expected', { p_session: session.id })
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
