import { describe, expect, it } from 'vitest'
import { addDays, dayBoundsUtc, formatDayLong, formatTime, localDate, minutesOfDay, zonedToUtcIso } from './time'
import { formatBs } from './money'
import { formatPhone, normalizeBoPhone } from './phone'
import { normalizeName, searchTerm } from './text'
import { allowedTransitions, type AppointmentStatus } from './status'
import { rpcError, RPC_CODES } from '@/server/errors-rpc'

describe('tiempo (America/La_Paz = UTC-4)', () => {
  it('hora local -> UTC y de vuelta', () => {
    expect(zonedToUtcIso('2026-10-26', '08:30')).toBe('2026-10-26T12:30:00.000Z')
    expect(formatTime('2026-10-26T12:30:00.000Z')).toBe('08:30')
    expect(localDate('2026-10-26T02:00:00.000Z')).toBe('2026-10-25') // 22:00 del dia anterior en La Paz
  })
  it('limites del dia local', () => {
    expect(dayBoundsUtc('2026-10-26')).toEqual(['2026-10-26T04:00:00.000Z', '2026-10-27T04:00:00.000Z'])
  })
  it('addDays cruza mes y anio', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('minutos del dia y nombre del dia', () => {
    expect(minutesOfDay('2026-10-26T12:30:00.000Z')).toBe(8 * 60 + 30)
    expect(formatDayLong('2026-10-26')).toBe('Lunes 26/10/2026')
  })
})

describe('dinero en centavos', () => {
  it('formato boliviano', () => {
    expect(formatBs(0)).toBe('Bs. 0')
    expect(formatBs(120000)).toBe('Bs. 1.200')
    expect(formatBs(153000)).toBe('Bs. 1.530')
    expect(formatBs(123456789)).toBe('Bs. 1.234.567,89')
    expect(formatBs(15050)).toBe('Bs. 150,50')
    expect(formatBs(-5000)).toBe('−Bs. 50')
  })
})

describe('telefono boliviano', () => {
  it.each([
    ['71234567', '+59171234567'],
    ['7123 4567', '+59171234567'],
    ['+591 7123-4567', '+59171234567'],
    ['00591 61234567', '+59161234567'],
    ['(591) 71234567', '+59171234567'],
  ])('%s -> %s', (raw, e164) => expect(normalizeBoPhone(raw)).toBe(e164))
  it.each(['', '12345678', '8123456', '+5917123456', '+54911234567', '591712345678', 'abc'])('rechaza %s', (raw) => expect(normalizeBoPhone(raw)).toBeNull())
  it('formatea para mostrar', () => expect(formatPhone('+59171234567')).toBe('+591 7123 4567'))
})

describe('busqueda', () => {
  it('normaliza acentos y mayusculas', () => expect(normalizeName('  José  PÉREZ ')).toBe('jose perez'))
  it('searchTerm no deja pasar caracteres de filtro de PostgREST', () => {
    expect(searchTerm('a,b).or(x.eq.1)%_')).toBe('aborxeq1') // sin comas, puntos, parentesis ni comodines
  })
})

describe('transiciones que ofrece la UI', () => {
  const t = (s: AppointmentStatus, r: Parameters<typeof allowedTransitions>[1]) => allowedTransitions(s, r).sort()
  it('recepcion', () => {
    expect(t('scheduled', 'reception')).toEqual(['cancelled', 'checked_in', 'confirmed', 'no_show'])
    expect(t('confirmed', 'reception')).toEqual(['cancelled', 'checked_in', 'no_show'])
    expect(t('checked_in', 'reception')).toEqual(['cancelled'])
    expect(t('cancelled', 'reception')).toEqual([])
  })
  it('solo el admin reabre', () => {
    expect(t('cancelled', 'clinic_admin')).toEqual(['scheduled'])
    expect(t('no_show', 'clinic_admin')).toEqual(['scheduled'])
  })
  it('el odontologo no cambia estados; lo terminado no cambia', () => {
    for (const s of ['scheduled', 'confirmed', 'checked_in', 'cancelled'] as const) expect(t(s, 'dentist')).toEqual([])
    for (const r of ['clinic_admin', 'reception', 'dentist'] as const) for (const s of ['in_progress', 'completed'] as const) expect(t(s, r)).toEqual([])
  })
})

describe('errores de RPC', () => {
  it('cada codigo conocido tiene mensaje y ninguno es INTERNAL', () => {
    for (const c of RPC_CODES) {
      const r = rpcError(c)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code, c).not.toBe('INTERNAL')
    }
  })
  it('lo desconocido no se muestra tal cual', () => {
    const r = rpcError('relation "secret_table" does not exist')
    expect(r.ok === false && r.error.message).toBe('Algo salió mal. Intenta de nuevo.')
  })
  it('violacion de unicidad', () => expect(rpcError('duplicate key', '23505')).toMatchObject({ ok: false, error: { code: 'CONFLICT' } }))
})
