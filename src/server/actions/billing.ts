'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { rpcError } from '../errors-rpc'
import { cashMovementSchema, closeCashSchema, openCashSchema, paymentSchema, voidPaymentSchema } from '../schemas/operations'

// Caja y cobros. Todo pasa por RPC: montos, saldo, sesion de caja y auditoria se resuelven en una transaccion.
const done = () => {
  revalidatePath('/caja')
  revalidatePath('/inicio')
}

export async function recordPayment(input: unknown): Promise<ActionResult<{ balanceCents: number }>> {
  const p = paymentSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el cobro.', fieldErrors(p.error.issues))
  await requireCapability('billing.charge')
  const { data, error } = await (await createClient()).rpc('record_payment', {
    p_invoice: p.data.invoiceId, p_amount_cents: p.data.amountCents, p_method: p.data.method, p_idempotency_key: p.data.idempotencyKey, p_reference: p.data.reference ?? null,
  })
  if (error) return rpcError(error.message, error.code, error.details)
  done()
  return ok({ balanceCents: (data as { balance_cents: number }).balance_cents })
}

export async function voidPayment(input: unknown): Promise<ActionResult> {
  const p = voidPaymentSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Escribe el motivo.', fieldErrors(p.error.issues))
  await requireCapability('billing.void')
  const { error } = await (await createClient()).rpc('void_payment', { p_payment: p.data.paymentId, p_reason: p.data.reason })
  if (error) return rpcError(error.message, error.code)
  done()
  return ok(undefined)
}

export async function openCash(input: unknown): Promise<ActionResult> {
  const p = openCashSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el fondo inicial.', fieldErrors(p.error.issues))
  await requireCapability('cash.open')
  const { error } = await (await createClient()).rpc('open_cash_session', { p_opening_float_cents: p.data.openingFloatCents })
  if (error) return rpcError(error.message, error.code)
  done()
  return ok(undefined)
}

export async function closeCash(input: unknown): Promise<ActionResult<{ expectedCents: number; countedCents: number; differenceCents: number }>> {
  const p = closeCashSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el arqueo.', fieldErrors(p.error.issues))
  await requireCapability('cash.close')
  const { data, error } = await (await createClient()).rpc('close_cash_session', { p_counted_cents: p.data.countedCents, p_notes: p.data.notes ?? null })
  if (error) {
    const r = rpcError(error.message, error.code)
    return !r.ok && error.message === 'REASON_REQUIRED' ? fail('VALIDATION', 'Hay diferencia: explica el motivo.', { notes: 'Explica la diferencia.' }) : r
  }
  done()
  const r = data as { expected_cents: number; counted_cents: number; difference_cents: number }
  return ok({ expectedCents: r.expected_cents, countedCents: r.counted_cents, differenceCents: r.difference_cents })
}

export async function addCashMovement(input: unknown): Promise<ActionResult> {
  const p = cashMovementSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el movimiento.', fieldErrors(p.error.issues))
  await requireCapability('cash.open')
  const { error } = await (await createClient()).rpc('add_cash_movement', {
    p_kind: p.data.kind, p_amount_cents: p.data.amountCents, p_method: p.data.method, p_concept: p.data.concept, p_category: p.data.category ?? null,
  })
  if (error) return rpcError(error.message, error.code, error.details)
  done()
  return ok(undefined)
}
