import 'server-only'
import { createClient } from '../supabase/server'
import { requireCapability } from '../auth/guards'
import type { StockReason } from '@/lib/domain/clinical'
import { readPages } from './read-pages'

export type StockLot = { id: string; lotCode: string | null; expiresOn: string | null; qty: number; unitCostCents: number | null; receivedAt: string; supplier: string | null }
export type StockItem = {
  id: string; name: string; unit: string; sku: string | null; minStock: number; active: boolean; onHand: number; nextExpiry: string | null
  lots: StockLot[]
}
export type StockMove = { id: string; item: string; unit: string; delta: number; reason: StockReason; note: string | null; createdAt: string; by: string }
export type Inventory = { items: StockItem[]; moves: StockMove[]; suppliers: { id: string; name: string }[] }
export type PendingStockDeficit = {
  encounterId: string
  appointmentId: string | null
  patientName: string | null
  itemId: string
  itemName: string | null
  unit: string | null
  quantity: number
  createdAt: string
}

export async function getPendingStockDeficits(): Promise<PendingStockDeficit[] | null> {
  const { member } = await requireCapability('inventory.adjust')
  const supabase = await createClient()
  type Row = {
    encounter_id: string
    supply_item_id: string
    qty_missing: number | string
    created_at: string
    item: { name: string; unit: string } | null
    encounter: { appointment_id: string; patient: { full_name: string } | null } | null
  }
  const rows = await readPages<Row>(
    (start, end) => supabase.from('stock_consumption_deficits')
      .select('encounter_id, supply_item_id, qty_missing, created_at, item:supply_items(name, unit), encounter:encounters(appointment_id, patient:patients(full_name))')
      .eq('clinic_id', member.clinicId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .order('encounter_id')
      .order('supply_item_id')
      .range(start, end),
    'No pudimos cargar los insumos pendientes',
  ).catch(() => null)

  return rows?.map((row) => ({
    encounterId: row.encounter_id,
    appointmentId: row.encounter?.appointment_id ?? null,
    patientName: row.encounter?.patient?.full_name ?? null,
    itemId: row.supply_item_id,
    itemName: row.item?.name ?? null,
    unit: row.item?.unit ?? null,
    quantity: Number(row.qty_missing),
    createdAt: row.created_at,
  })) ?? null
}

export async function getInventory(): Promise<Inventory> {
  await requireCapability('inventory.read')
  const supabase = await createClient()
  const [{ data: items }, { data: stock }, { data: lots }, { data: moves }, { data: suppliers }] = await Promise.all([
    supabase.from('supply_items').select('id, name, unit, sku, min_stock, active').order('name'),
    supabase.from('v_stock').select('supply_item_id, on_hand, next_expiry'),
    supabase.from('supply_lots').select('id, supply_item_id, lot_code, expires_on, qty_on_hand, unit_cost_cents, received_at, supplier:suppliers(name)')
      .gt('qty_on_hand', 0).order('expires_on', { ascending: true, nullsFirst: false }).order('received_at'),
    supabase.from('stock_movements').select('id, delta, reason, note, created_at, item:supply_items(name, unit), by:profiles(full_name)').order('created_at', { ascending: false }).limit(40),
    supabase.from('suppliers').select('id, name').eq('active', true).order('name'),
  ])
  const st = new Map(((stock ?? []) as { supply_item_id: string; on_hand: number; next_expiry: string | null }[]).map((s) => [s.supply_item_id, s]))
  const lotRows = (lots ?? []) as unknown as {
    id: string; supply_item_id: string; lot_code: string | null; expires_on: string | null; qty_on_hand: number; unit_cost_cents: number | null; received_at: string
    supplier: { name: string } | null
  }[]
  return {
    items: ((items ?? []) as { id: string; name: string; unit: string; sku: string | null; min_stock: number; active: boolean }[]).map((i) => ({
      id: i.id, name: i.name, unit: i.unit, sku: i.sku, minStock: Number(i.min_stock), active: i.active,
      onHand: Number(st.get(i.id)?.on_hand ?? 0), nextExpiry: st.get(i.id)?.next_expiry ?? null,
      lots: lotRows.filter((l) => l.supply_item_id === i.id).map((l) => ({
        id: l.id, lotCode: l.lot_code, expiresOn: l.expires_on, qty: Number(l.qty_on_hand), unitCostCents: l.unit_cost_cents, receivedAt: l.received_at, supplier: l.supplier?.name ?? null,
      })),
    })),
    moves: ((moves ?? []) as unknown as { id: string; delta: number; reason: StockReason; note: string | null; created_at: string; item: { name: string; unit: string } | null; by: { full_name: string } | null }[])
      .map((m) => ({ id: m.id, item: m.item?.name ?? '—', unit: m.item?.unit ?? '', delta: Number(m.delta), reason: m.reason, note: m.note, createdAt: m.created_at, by: m.by?.full_name ?? '—' })),
    suppliers: (suppliers ?? []) as { id: string; name: string }[],
  }
}
