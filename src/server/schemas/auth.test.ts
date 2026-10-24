import { describe, expect, it } from 'vitest'
import { createMemberSchema, memberPasswordSchema, password, setupSchema, signInSchema } from './auth'

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
  it('configuracion inicial: sin nombre de clinica y las dos contrasenas deben coincidir', () => {
    const ok = { fullName: 'Dr. Ejemplo', email: 'doc@example.com', password: 'una-clave-larga', confirm: 'una-clave-larga' }
    expect(setupSchema.safeParse(ok).success).toBe(true)
    const bad = setupSchema.safeParse({ ...ok, confirm: 'otra-clave-larga' })
    expect(!bad.success && bad.error.issues[0].path).toEqual(['confirm'])
  })
  it('alta de una persona del equipo: rol valido y contrasena larga', () => {
    const base = { fullName: 'Paola Condori', email: 'paola@example.com', password: 'una-clave-larga', role: 'reception' }
    expect(createMemberSchema.safeParse(base).success).toBe(true)
    expect(createMemberSchema.safeParse({ ...base, role: 'superadmin' }).success).toBe(false)
    expect(createMemberSchema.safeParse({ ...base, password: 'corta' }).success).toBe(false)
    expect(createMemberSchema.parse({ ...base, title: '  ' }).title).toBeUndefined()
  })
  it('cambio de contrasena por el admin exige un miembro valido', () => {
    expect(memberPasswordSchema.safeParse({ memberId: 'x', password: 'una-clave-larga' }).success).toBe(false)
  })
})
