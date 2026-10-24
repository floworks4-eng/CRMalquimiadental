import { z } from 'zod'
import { phoneField } from './patients'

const utmValue = z.string().trim().max(100).optional()
export const utmSchema = z.object({
  utm_source: utmValue, utm_medium: utmValue, utm_campaign: utmValue, utm_content: utmValue, utm_term: utmValue,
  referrer: z.string().trim().max(300).optional(), landing_path: z.string().trim().max(200).optional(),
})

export const bookingSchema = z.object({
  treatmentId: z.uuid('Elige un tratamiento.'),
  startsAt: z.iso.datetime({ offset: true, message: 'Elige un horario.' }),
  name: z.string().trim().min(3, 'Escribe tu nombre completo.').max(120).refine((v) => v.split(/\s+/).length >= 2, 'Escribe nombre y apellido.'),
  phone: phoneField,
  consentData: z.literal(true, { error: 'Necesitamos tu autorización para agendar.' }),
  consentWhatsapp: z.boolean().default(false),
  utm: utmSchema.default({}),
})
export const publicSlotsSchema = z.object({ treatmentId: z.uuid(), from: z.iso.date(), to: z.iso.date() })
