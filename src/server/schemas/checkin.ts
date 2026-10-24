import { z } from 'zod'
import { TOKEN_RE_SOURCE } from './token'

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max)
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

export const ALLERGY_OPTIONS = ['Ninguna', 'Penicilina', 'Látex', 'Anestésicos locales', 'AINE (ibuprofeno)'] as const
export const CONDITION_OPTIONS = ['Ninguno', 'Diabetes', 'Hipertensión', 'Cardiopatía', 'Asma', 'Epilepsia'] as const

export const checkinSchema = z.object({
  token: z.string().regex(new RegExp(TOKEN_RE_SOURCE)),
  birthDate: z.preprocess(blank, z.iso.date('Fecha no válida.').optional()),
  emergencyContactName: text(3, 120, 'Indica un contacto de emergencia.'),
  emergencyContactPhone: z.string().trim().min(6, 'Escribe un celular de contacto.').max(30),
  allergies: z.array(z.string().max(60)).max(10),
  allergyOther: z.preprocess(blank, z.string().trim().max(200).optional()),
  conditions: z.array(z.string().max(60)).max(10).min(1, 'Marca «Ninguno» o tus antecedentes.'),
  medications: z.preprocess(blank, z.string().trim().max(300).optional()),
  pregnancy: z.boolean().default(false),
  anticoagulants: z.boolean().default(false),
  reason: text(3, 300, 'Cuéntanos el motivo de tu visita.'),
  consentClinical: z.literal(true, { error: 'Necesitamos tu consentimiento para atenderte.' }),
  consentData: z.literal(true, { error: 'Necesitamos tu autorización para guardar tus datos.' }),
  consentWhatsapp: z.boolean().default(false),
  signatureName: text(5, 120, 'Escribe tu nombre completo como firma.'),
  signature: z.string().min(50, 'Dibuja tu firma.').max(250_000),
}).refine((v) => v.allergies.length > 0 || !!v.allergyOther, { path: ['allergies'], message: 'Marca «Ninguna» o indica tu alergia.' })
export type CheckinInput = z.input<typeof checkinSchema>
