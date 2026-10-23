import { z } from 'zod'

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const instant = z.iso.datetime({ offset: true, message: 'Fecha y hora no válidas.' })

export const createAppointmentSchema = z.object({
  patientId: z.uuid('Elige un paciente.'),
  treatmentId: z.uuid('Elige un tratamiento.'),
  dentistId: z.uuid('Elige un odontólogo.'),
  cabinetId: z.uuid('Elige un gabinete.'),
  startsAt: instant,
  source: z.enum(['whatsapp', 'web', 'campaign', 'phone', 'walk_in', 'referral']).default('phone'),
  campaignId: z.preprocess(blank, z.uuid().optional()),
  notes: z.preprocess(blank, z.string().trim().max(500, 'Máximo 500 caracteres.').optional()),
})

export const rescheduleSchema = z.object({
  id: z.uuid(),
  startsAt: instant,
  cabinetId: z.uuid().optional(),
  dentistId: z.uuid().optional(),
  expectedUpdatedAt: z.string().min(1),
})

export const statusSchema = z.object({
  id: z.uuid(),
  to: z.enum(['scheduled', 'confirmed', 'checked_in', 'cancelled', 'no_show']),
  reason: z.preprocess(blank, z.string().trim().max(300).optional()),
  expectedUpdatedAt: z.string().min(1),
})

export const slotsSchema = z.object({
  treatmentId: z.uuid(),
  from: z.iso.date(),
  to: z.iso.date(),
  dentistId: z.uuid().optional(),
})
