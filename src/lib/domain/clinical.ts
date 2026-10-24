// Etiquetas de los tipos clinicos y de cobro. Deben coincidir con los enums de supabase/migrations/0001.
export type ToothCondition = 'caries' | 'corona' | 'endodoncia' | 'ausente' | 'fractura' | 'sellante' | 'implante' | 'protesis' | 'otro'
export type PlanStatus = 'planned' | 'accepted' | 'in_progress' | 'done' | 'cancelled'
export type PaymentMethod = 'cash' | 'qr' | 'transfer' | 'card'
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'voided'
export type StockReason = 'purchase' | 'treatment' | 'adjustment' | 'waste' | 'return'

export const CONDITION_LABEL: Record<ToothCondition, string> = {
  caries: 'Caries', corona: 'Corona', endodoncia: 'Endodoncia', ausente: 'Ausente', fractura: 'Fractura',
  sellante: 'Sellante', implante: 'Implante', protesis: 'Prótesis', otro: 'Otro',
}
export const CONDITIONS = Object.keys(CONDITION_LABEL) as ToothCondition[]

export const SURFACES = ['M', 'D', 'V', 'L', 'O', 'I'] as const
export const SURFACE_LABEL: Record<(typeof SURFACES)[number], string> = { M: 'Mesial', D: 'Distal', V: 'Vestibular', L: 'Lingual/Palatina', O: 'Oclusal', I: 'Incisal' }

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Efectivo', qr: 'QR', transfer: 'Transferencia', card: 'Tarjeta' }
export const METHODS = Object.keys(METHOD_LABEL) as PaymentMethod[]

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Borrador', issued: 'Por cobrar', partially_paid: 'Pago parcial', paid: 'Pagada', voided: 'Anulada',
}
export const STOCK_REASON_LABEL: Record<StockReason, string> = {
  purchase: 'Ingreso', treatment: 'Tratamiento', adjustment: 'Ajuste', waste: 'Merma', return: 'Devolución',
}

/** Edad en años cumplidos a partir de 'YYYY-MM-DD'. */
export function ageYears(birth: string, today = new Date()) {
  const [y, m, d] = birth.split('-').map(Number)
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--
  return age
}

/** Bs. escritos por la persona ('120', '120,50', '1.200') -> centavos. null si no es un monto valido. */
export function parseBs(input: string): number | null {
  const s = input.trim().replace(/^bs\.?\s*/i, '').replace(/\s/g, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(s)) return null
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s
  const n = Math.round(Number(normalized) * 100)
  return Number.isFinite(n) ? n : null
}
