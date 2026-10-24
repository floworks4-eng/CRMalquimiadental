import { describe, expect, it } from 'vitest'
import { ageYears, parseBs } from './clinical'
import { initials } from './text'

describe('montos escritos a mano', () => {
  it.each([
    ['120', 12_000], ['120,50', 12_050], ['120.5', 12_050], ['1.200', 120_000], ['1.200,75', 120_075], ['Bs. 80', 8_000], ['0', 0],
  ])('%s -> %i centavos', (input, cents) => expect(parseBs(input)).toBe(cents))
  it.each(['', 'abc', '-5', '1,2,3', '12,345'])('rechaza %s', (input) => expect(parseBs(input)).toBeNull())
})

describe('edad e iniciales', () => {
  it('cumpleaños todavía no llegó', () => expect(ageYears('2000-12-31', new Date(2026, 9, 24))).toBe(25))
  it('cumpleaños hoy', () => expect(ageYears('2000-10-24', new Date(2026, 9, 24))).toBe(26))
  it('iniciales sin títulos', () => {
    expect(initials('Dra. Valeria Mamani')).toBe('VM')
    expect(initials('Doc')).toBe('D')
  })
})
