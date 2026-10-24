import { describe, expect, it } from 'vitest'
import { checkinSchema } from './checkin'
import { bookingSchema } from './booking'
import { decodePngDataUrl } from '../public/signature'
import { rpcError } from '../errors-rpc'

const TOKEN = 'A'.repeat(43)
const SIG = 'data:image/png;base64,' + 'A'.repeat(80)
const okCheckin = {
  token: TOKEN, emergencyContactName: 'Rosa Laura', emergencyContactPhone: '+59170009999', allergies: ['Ninguna'], conditions: ['Ninguno'],
  reason: 'Control', consentClinical: true, consentData: true, signatureName: 'Mariela Quispe', signature: SIG,
}

describe('check-in', () => {
  it('acepta un envio completo y rellena opcionales', () => {
    const r = checkinSchema.parse(okCheckin)
    expect(r).toMatchObject({ pregnancy: false, anticoagulants: false, consentWhatsapp: false })
  })
  it.each([
    ['token', { token: 'corto' }],
    ['allergies', { allergies: [], allergyOther: '' }],
    ['conditions', { conditions: [] }],
    ['reason', { reason: 'x' }],
    ['emergencyContactName', { emergencyContactName: '' }],
    ['consentClinical', { consentClinical: false }],
    ['consentData', { consentData: false }],
    ['signatureName', { signatureName: 'Ana' }],
    ['signature', { signature: '' }],
    ['birthDate', { birthDate: '12/03/1990' }],
  ])('rechaza %s invalido', (field, patch) => {
    const r = checkinSchema.safeParse({ ...okCheckin, ...patch })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain(field)
  })
  it('"otra alergia" sola tambien cuenta como respuesta', () => {
    expect(checkinSchema.safeParse({ ...okCheckin, allergies: [], allergyOther: 'Mariscos' }).success).toBe(true)
  })
})

describe('reserva publica', () => {
  const ok = { treatmentId: '00000000-0000-4000-8000-000000000101', startsAt: '2026-11-02T13:00:00+00:00', name: 'Mariela Quispe', phone: '7123 4567', consentData: true }
  it('normaliza el celular y deja utm vacio por defecto', () => {
    const r = bookingSchema.parse(ok)
    expect(r.phone).toBe('+59171234567')
    expect(r.utm).toEqual({})
  })
  it.each([
    ['name', { name: 'Mariela' }],
    ['phone', { phone: '12345' }],
    ['consentData', { consentData: false }],
    ['startsAt', { startsAt: 'mañana' }],
  ])('rechaza %s invalido', (field, patch) => {
    const r = bookingSchema.safeParse({ ...ok, ...patch })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain(field)
  })
  it('recorta parametros utm demasiado largos', () => {
    expect(bookingSchema.safeParse({ ...ok, utm: { utm_campaign: 'x'.repeat(101) } }).success).toBe(false)
  })
})

/** PNG minimo con la cabecera IHDR real (el resto se rellena: solo se valida forma y dimensiones). */
function png(width: number, height: number, size = 200) {
  const b = Buffer.alloc(size)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return 'data:image/png;base64,' + b.toString('base64')
}

describe('firma (PNG)', () => {
  it('acepta un PNG de tamano razonable', () => expect(decodePngDataUrl(png(600, 160))).not.toBeNull())
  it.each([
    ['no es PNG', 'data:image/jpeg;base64,' + Buffer.alloc(200).toString('base64')],
    ['firma de bytes falsa', 'data:image/png;base64,' + Buffer.alloc(200, 1).toString('base64')],
    ['dimensiones absurdas', png(50_000, 160)],
    ['demasiado pesado', png(600, 160, 200_000)],
    ['demasiado chico', png(600, 160, 50)],
    ['no es data URL', 'https://evil.example/firma.png'],
  ])('rechaza: %s', (_, url) => expect(decodePngDataUrl(url)).toBeNull())
})

describe('errores de las RPC publicas', () => {
  it('INVALID_PAYLOAD con detalle apunta al campo del formulario', () => {
    expect(rpcError('INVALID_PAYLOAD', 'P0001', 'emergency_contact')).toMatchObject({ ok: false, error: { code: 'VALIDATION', fields: { emergencyContactName: expect.any(String) } } })
    expect(rpcError('INVALID_PAYLOAD', 'P0001', 'phone')).toMatchObject({ ok: false, error: { fields: { phone: expect.stringContaining('+591') } } })
  })
  it('enlace no disponible y limite de intentos tienen mensaje propio', () => {
    expect(rpcError('NOT_AVAILABLE')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: expect.stringContaining('recepción') } })
    expect(rpcError('RATE_LIMITED')).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } })
  })
})
