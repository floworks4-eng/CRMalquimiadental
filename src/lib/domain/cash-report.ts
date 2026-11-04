import type { PaymentMethod } from './clinical'

export type ReportMovement = { kind: string; category: string; amount_cents: number; method: PaymentMethod }

/** Flujo de caja: una anulación revierte un cobro, nunca se presenta como gasto operativo. */
export function summarizeCashMovements(rows: ReportMovement[]) {
  const byMethod: Record<PaymentMethod, number> = { cash: 0, qr: 0, transfer: 0, card: 0 }
  const categories = new Map<string, { name: string; kind: string; cents: number }>()
  let collectedCents = 0, otherIncomeCents = 0, expensesCents = 0, netCents = 0
  for (const row of rows) {
    netCents += row.amount_cents
    byMethod[row.method] += row.amount_cents
    if (row.kind === 'expense') expensesCents += -row.amount_cents
    else if (row.kind === 'adjustment') collectedCents += row.amount_cents
    else if (row.category === 'tratamiento') collectedCents += row.amount_cents
    else otherIncomeCents += row.amount_cents
    const key = `${row.kind}|${row.category}`
    const item = categories.get(key) ?? { kind: row.kind, name: row.category, cents: 0 }
    item.cents += row.amount_cents
    categories.set(key, item)
  }
  return { collectedCents, otherIncomeCents, expensesCents, netCents, byMethod,
    byCategory: [...categories.values()].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents)) }
}
