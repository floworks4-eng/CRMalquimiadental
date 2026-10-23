import { describe, expect, it } from 'vitest'
import { patientSchema } from './patients'
import { createAppointmentSchema, statusSchema } from './agenda'

const ok = { fullName: 'Juan Carlos Quispe', phone: '7123 4567' }

describe('paciente', () => {
  it('normaliza el telefono y rellena el origen', () => {
    const r = patientSchema.parse(ok)
    expect(r.phone).toBe('+59171234567')
    expect(r.firstSource).toBe('phone')
  })
  it('los campos vacios opcionales quedan sin valor', () => {
    const r = patientSchema.parse({ ...ok, email: '', birthDate: '', zone: '  ', sex: '' })
    expect([r.email, r.birthDate, r.zone, r.sex]).toEqual([undefined, undefined, undefined, undefined])
  })
  it.each([
    [{ ...ok, fullName: 'Juan' }, 'fullName'],
    [{ ...ok, fullName: 'Jo' }, 'fullName'],
    [{ ...ok, phone: '12345' }, 'phone'],
    [{ ...ok, email: 'no-es-correo' }, 'email'],
    [{ ...ok, birthDate: '2999-01-01' }, 'birthDate'],
    [{ ...ok, birthDate: '1800-01-01' }, 'birthDate'],
    [{ ...ok, birthDate: '12/03/1990' }, 'birthDate'],
  ])('rechaza %j', (input, field) => {
    const r = patientSchema.safeParse(input)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain(field)
  })
  it('acepta una fecha de nacimiento valida', () => expect(patientSchema.parse({ ...ok, birthDate: '1990-04-12' }).birthDate).toBe('1990-04-12'))
})

describe('agenda', () => {
  const id = '00000000-0000-4000-8000-000000000101'
  const base = { patientId: id, treatmentId: id, dentistId: id, cabinetId: id, startsAt: '2026-10-26T12:30:00+00:00' }
  it('acepta el instante que devuelve PostgREST', () => expect(createAppointmentSchema.safeParse(base).success).toBe(true))
  it('rechaza ids y fechas mal formados', () => {
    expect(createAppointmentSchema.safeParse({ ...base, patientId: 'abc' }).success).toBe(false)
    expect(createAppointmentSchema.safeParse({ ...base, startsAt: '2026-10-26 08:30' }).success).toBe(false)
  })
  it('el origen "historical" no se puede elegir al agendar', () => expect(createAppointmentSchema.safeParse({ ...base, source: 'historical' }).success).toBe(false))
  it('estados que se pueden pedir desde la UI', () => {
    const s = { id, expectedUpdatedAt: '2026-10-26T12:30:00.123456+00:00' }
    expect(statusSchema.safeParse({ ...s, to: 'cancelled' }).success).toBe(true)
    expect(statusSchema.safeParse({ ...s, to: 'completed' }).success).toBe(false)
    expect(statusSchema.safeParse({ ...s, to: 'in_progress' }).success).toBe(false)
  })
})
