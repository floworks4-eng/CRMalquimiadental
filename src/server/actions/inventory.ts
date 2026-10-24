'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import { fail, fieldErrors, ok, type ActionResult } from '../errors'
import { rpcError } from '../errors-rpc'
import { adjustSchema, receiveSchema, supplierSchema, supplyItemSchema } from '../schemas/operations'

// Inventario: el admin crea insumos, registra ingresos y ajustes. El stock solo cambia por movimientos (RPC).
const done = () => revalidatePath('/inventario')

export async function saveSupplyItem(input: unknown): Promise<ActionResult> {
  const p = supplyItemSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el insumo.', fieldErrors(p.error.issues))
  const s = await requireCapability('inventory.adjust')
  const d = p.data
  const row = { name: d.name, unit: d.unit, sku: d.sku ?? null, min_stock: d.minStock, active: d.active }
  const supabase = await createClient()
  const { error } = d.id
    ? await supabase.from('supply_items').update(row).eq('id', d.id)
    : await supabase.from('supply_items').insert({ ...row, clinic_id: s.member.clinicId })
  if (error) return error.code === '23505' ? fail('CONFLICT', 'Ya existe un insumo con ese nombre.', { name: 'Ya existe.' }) : fail('INTERNAL', 'No se pudo guardar el insumo.')
  done()
  return ok(undefined)
}

export async function receiveStock(input: unknown): Promise<ActionResult> {
  const p = receiveSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el ingreso.', fieldErrors(p.error.issues))
  await requireCapability('inventory.receive')
  const d = p.data
  const { error } = await (await createClient()).rpc('receive_stock', {
    p_item: d.itemId, p_qty: d.qty, p_lot_code: d.lotCode ?? null, p_expires_on: d.expiresOn ?? null,
    p_unit_cost_cents: d.unitCostCents ?? null, p_supplier: d.supplierId ?? null,
  })
  if (error) return rpcError(error.message, error.code, error.details)
  done()
  return ok(undefined)
}

export async function adjustStock(input: unknown): Promise<ActionResult> {
  const p = adjustSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el ajuste.', fieldErrors(p.error.issues))
  await requireCapability('inventory.adjust')
  const { error } = await (await createClient()).rpc('adjust_stock', { p_lot: p.data.lotId, p_delta: p.data.delta, p_reason: p.data.reason, p_note: p.data.note })
  if (error) {
    if (error.message === 'STOCK_SHORTAGE') return fail('VALIDATION', 'El lote no tiene tanto stock.', { delta: 'Supera lo que hay en el lote.' })
    return rpcError(error.message, error.code, error.details)
  }
  done()
  return ok(undefined)
}

export async function createSupplier(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = supplierSchema.safeParse(input)
  if (!p.success) return fail('VALIDATION', 'Revisa el proveedor.', fieldErrors(p.error.issues))
  const s = await requireCapability('inventory.receive')
  const { data, error } = await (await createClient()).from('suppliers')
    .insert({ clinic_id: s.member.clinicId, name: p.data.name, phone: p.data.phone ?? null, notes: p.data.notes ?? null }).select('id').single()
  if (error) return fail('INTERNAL', 'No se pudo guardar el proveedor.')
  done()
  return ok({ id: data.id as string })
}
