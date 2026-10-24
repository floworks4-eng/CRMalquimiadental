import { z } from 'zod'

export const email = z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido.'))
// 72 = limite de bcrypt en Supabase Auth.
export const password = z.string().min(12, 'Usa al menos 12 caracteres.').max(72, 'Máximo 72 caracteres.')
export const fullName = z.string().trim().min(3, 'Escribe tu nombre completo.').max(120)

export const signInSchema = z.object({ email, password: z.string().min(1, 'Escribe tu contraseña.') })
export const resetRequestSchema = z.object({ email })
export const newPasswordSchema = z.object({ password })
export const inviteSchema = z.object({ email, role: z.enum(['clinic_admin', 'dentist', 'reception']) })
export const acceptInviteSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), fullName, password })
export const setupSchema = z
  .object({ clinicName: z.string().trim().min(3, 'Escribe el nombre de la clínica.').max(80), fullName, email, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden.' })
