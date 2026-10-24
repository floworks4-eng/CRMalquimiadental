import { z } from 'zod'
import { CONDITIONS, METHODS, SURFACES } from '@/lib/domain/clinical'

// Esquemas de consulta, caja, inventario y configuracion. Los montos viajan en centavos enteros.
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Máximo ${max} caracteres.`).optional())
const reason = z.string().trim().min(3, 'Escribe el motivo (mínimo 3 letras).').max(300)
const cents = z.number().int('Monto no válido.').min(0, 'Monto no válido.').max(100_000_000, 'Monto demasiado grande.')
const positiveCents = cents.min(1, 'El monto debe ser mayor a cero.')
const method = z.enum(METHODS as [string, ...string[]])
const tooth = z.number().int().refine((n) => /^[1-4][1-8]$|^[5-8][1-5]$/.test(String(n)), 'Pieza no válida.')
const idemKey = z.string().min(8).max(100)
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:MM).')

/* Consulta */
export const encounterNotesSchema = z.object({ encounterId: z.uuid(), chiefComplaint: optText(300), notes: optText(4000) })
export const findingSchema = z.object({
  encounterId: z.uuid(), patientId: z.uuid(), tooth,
  condition: z.enum(CONDITIONS as [string, ...string[]]),
  surfaces: z.array(z.enum(SURFACES)).max(6).default([]),
  notes: optText(300),
})
export const planItemSchema = z.object({
  patientId: z.uuid(), encounterId: z.preprocess(blank, z.uuid().optional()), treatmentId: z.uuid('Elige un tratamiento.'),
  tooth: tooth.optional(), surfaces: z.array(z.enum(SURFACES)).max(6).default([]), today: z.boolean(),
})
export const planStatusSchema = z.object({ id: z.uuid(), today: z.boolean() })
export const finishSchema = z.object({
  encounterId: z.uuid(), idempotencyKey: idemKey,
  amountCents: cents, method: method.optional(), reference: optText(80),
  discountCents: cents.default(0), discountReason: optText(300),
})
export const addendumSchema = z.object({ patientId: z.uuid(), encounterId: z.uuid(), reason, notes: z.string().trim().min(1, 'Escribe la corrección.').max(4000) })
export const anamnesisSchema = z.object({
  patientId: z.uuid(),
  allergies: optText(300), conditions: optText(300), medications: optText(500), reason: optText(300),
  emergencyContactName: optText(120), emergencyContactPhone: optText(40),
  pregnancy: z.boolean().default(false), anticoagulants: z.boolean().default(false), notes: optText(1000),
})

/* Caja */
export const paymentSchema = z.object({ invoiceId: z.uuid(), amountCents: positiveCents, method, reference: optText(80), idempotencyKey: idemKey })
export const voidPaymentSchema = z.object({ paymentId: z.uuid(), reason })
export const openCashSchema = z.object({ openingFloatCents: cents })
export const closeCashSchema = z.object({ countedCents: cents, notes: optText(300) })
export const cashMovementSchema = z.object({
  kind: z.enum(['income', 'expense']), amountCents: positiveCents, method,
  concept: z.string().trim().min(3, 'Escribe el concepto (mínimo 3 letras).').max(120), category: optText(40),
})

/* Inventario */
const qty = z.number().positive('La cantidad debe ser mayor a cero.').max(1_000_000)
export const supplyItemSchema = z.object({
  id: z.preprocess(blank, z.uuid().optional()),
  name: z.string().trim().min(2, 'Escribe el nombre.').max(120), unit: z.string().trim().min(1, 'Escribe la unidad (u., caja, ml…).').max(20),
  sku: optText(40), minStock: z.number().min(0).max(1_000_000), active: z.boolean().default(true),
})
export const receiveSchema = z.object({
  itemId: z.uuid('Elige un insumo.'), qty, lotCode: optText(40), expiresOn: z.preprocess(blank, z.iso.date('Fecha no válida.').optional()),
  unitCostCents: cents.optional(), supplierId: z.preprocess(blank, z.uuid().optional()),
})
export const adjustSchema = z.object({
  lotId: z.uuid(), delta: z.number().refine((n) => n !== 0 && Math.abs(n) <= 1_000_000, 'La cantidad no puede ser cero.'),
  reason: z.enum(['adjustment', 'waste', 'return']), note: reason,
})
export const supplierSchema = z.object({ name: z.string().trim().min(2, 'Escribe el nombre.').max(120), phone: optText(40), notes: optText(300) })

/* Configuracion */
export const clinicSchema = z.object({
  name: z.string().trim().min(3, 'Escribe el nombre.').max(80), legalName: optText(120), nit: optText(30),
  phone: optText(40), whatsappNumber: optText(40), address: optText(200),
})
export const hoursSchema = z.object({
  days: z.array(z.object({ weekday: z.number().int().min(0).max(6), closed: z.boolean(), opens: hhmm.optional(), closes: hhmm.optional() }))
    .length(7)
    .refine((d) => d.every((x) => x.closed || (x.opens && x.closes && x.closes > x.opens)), 'Cada día abierto necesita apertura y cierre (cierre después de apertura).'),
})
export const holidaySchema = z.object({ date: z.iso.date('Fecha no válida.'), name: z.string().trim().min(2, 'Escribe el motivo.').max(80) })
export const cabinetSchema = z.object({ id: z.preprocess(blank, z.uuid().optional()), name: z.string().trim().min(2, 'Escribe el nombre.').max(40), active: z.boolean().default(true) })
export const treatmentSchema = z.object({
  id: z.preprocess(blank, z.uuid().optional()),
  name: z.string().trim().min(3, 'Escribe el nombre.').max(120),
  code: z.preprocess(blank, z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,30}$/, 'Solo minúsculas, números, - y _.').optional()),
  categoryId: z.preprocess(blank, z.uuid().optional()),
  durationMin: z.number().int().min(15).max(240).refine((n) => n % 15 === 0, 'Múltiplos de 15 minutos.'),
  priceCents: cents, requiresTooth: z.boolean().default(false), active: z.boolean().default(true),
})
export const recipeSchema = z.object({
  treatmentId: z.uuid(),
  lines: z.array(z.object({ supplyItemId: z.uuid(), qty })).max(30)
    .refine((l) => new Set(l.map((x) => x.supplyItemId)).size === l.length, 'Un insumo aparece dos veces.'),
})
export const categorySchema = z.object({ name: z.string().trim().min(2, 'Escribe el nombre.').max(60) })
export const memberSchema = z.object({
  memberId: z.uuid(), role: z.enum(['clinic_admin', 'dentist', 'reception']), title: optText(60), active: z.boolean(),
})
export const scheduleSchema = z.object({
  dentistId: z.uuid(),
  days: z.array(z.object({ weekday: z.number().int().min(0).max(6), starts: hhmm, ends: hhmm }))
    .max(14).refine((d) => d.every((x) => x.ends > x.starts), 'La salida debe ser después de la entrada.'),
})
