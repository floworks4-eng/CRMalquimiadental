import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { acceptInviteSchema, inviteSchema, password, setupSchema, signInSchema } from './auth'

describe('schemas de auth', () => {
  it('normaliza el correo', () => {
    expect(signInSchema.parse({ email: '  Doc@Alquimia.TEST ', password: 'x' }).email).toBe('doc@alquimia.test')
    expect(signInSchema.safeParse({ email: 'no-es-correo', password: 'x' }).success).toBe(false)
  })
  it('contrasena entre 12 y 72 caracteres (limite de bcrypt)', () => {
    expect(password.safeParse('a'.repeat(11)).success).toBe(false)
    expect(password.safeParse('a'.repeat(12)).success).toBe(true)
    expect(password.safeParse('a'.repeat(73)).success).toBe(false)
  })
  it('configuracion inicial: las dos contrasenas deben coincidir', () => {
    const ok = { clinicName: 'Alquimia Dental', fullName: 'Dr. Ejemplo', email: 'doc@example.com', password: 'una-clave-larga', confirm: 'una-clave-larga' }
    expect(setupSchema.safeParse(ok).success).toBe(true)
    const bad = setupSchema.safeParse({ ...ok, confirm: 'otra-clave-larga' })
    expect(!bad.success && bad.error.issues[0].path).toEqual(['confirm'])
  })
  it('el rol de una invitacion es uno de los tres', () => {
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'superadmin' }).success).toBe(false)
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'reception' }).success).toBe(true)
  })
  it('el token generado por el servidor (32 bytes base64url) cumple el esquema', () => {
    const token = randomBytes(32).toString('base64url')
    expect(token).toHaveLength(43)
    const base = { fullName: 'Paola Condori', password: 'una-clave-larga-123' }
    expect(acceptInviteSchema.safeParse({ ...base, token }).success).toBe(true)
    expect(acceptInviteSchema.safeParse({ ...base, token: token.slice(1) }).success).toBe(false)
    expect(acceptInviteSchema.safeParse({ ...base, token: "'; drop table x; --" + token.slice(19) }).success).toBe(false)
  })
})
