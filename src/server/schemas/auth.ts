import { z } from 'zod'

export const email = z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido.'))
// 72 = limite de bcrypt en Supabase Auth.
export const password = z.string().min(12, 'Usa al menos 12 caracteres.').max(72, 'Máximo 72 caracteres.')
export const fullName = z.string().trim().min(3, 'Escribe tu nombre completo.').max(120)

export const signInSchema = z.object({ email, password: z.string().min(1, 'Escribe tu contraseña.') })
export const resetRequestSchema = z.object({ email })
export const newPasswordSchema = z.object({ password })
export const createMemberSchema = z.object({
  fullName, email, password, role: z.enum(['clinic_admin', 'dentist', 'reception'], 'Elige el rol.'),
  title: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? undefined : v), z.string().trim().max(60).optional()),
})
export const memberPasswordSchema = z.object({ memberId: z.uuid(), password })
export const setupSchema = z
  .object({ fullName, email, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden.' })
