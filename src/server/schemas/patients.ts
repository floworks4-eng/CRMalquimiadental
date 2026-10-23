import { z } from 'zod'
import { normalizeBoPhone } from '@/lib/domain/phone'
import { todayLaPaz } from '@/lib/domain/time'

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Máximo ${max} caracteres.`).optional())

export const phoneField = z.string().trim().transform((v, ctx) => {
  const p = normalizeBoPhone(v)
  if (!p) {
    ctx.addIssue({ code: 'custom', message: 'Formato: +591 7XXXXXXX (8 dígitos que empiezan con 6 o 7).' })
    return z.NEVER
  }
  return p
})

export const patientSchema = z.object({
  fullName: z.string().trim().min(3, 'Escribe el nombre completo.').max(120, 'Máximo 120 caracteres.')
    .refine((v) => v.split(/\s+/).length >= 2, 'Escribe nombre y apellido.'),
  phone: phoneField,
  email: z.preprocess(blank, z.string().trim().toLowerCase().pipe(z.email('Correo no válido.')).optional()),
  birthDate: z.preprocess(blank, z.iso.date('Fecha no válida.').optional())
    .refine((v) => !v || v <= todayLaPaz(), 'La fecha no puede ser futura.')
    .refine((v) => !v || v >= `${Number(todayLaPaz().slice(0, 4)) - 120}-01-01`, 'Revisa la fecha de nacimiento.'),
  sex: z.preprocess(blank, z.enum(['F', 'M', 'X']).optional()),
  zone: text(80),
  address: text(200),
  primaryDentistId: z.preprocess(blank, z.uuid().optional()),
  firstSource: z.enum(['whatsapp', 'web', 'campaign', 'phone', 'walk_in', 'referral', 'historical']).default('phone'),
  campaignId: z.preprocess(blank, z.uuid().optional()),
})
export type PatientInput = z.input<typeof patientSchema>

export const updatePatientSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.string().min(1),
  data: patientSchema.omit({ firstSource: true, campaignId: true }),
})
