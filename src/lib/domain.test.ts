import { describe, expect, it } from 'vitest'
import { addDays, bs, fecha, toHM, toMin } from '@/lib/data'
import { kind, teethRows } from '@/lib/teeth'

describe('formato boliviano', () => {
  it('Bs. con punto de miles y sin decimales', () => {
    expect(bs(0)).toBe('Bs. 0')
    expect(bs(1200)).toBe('Bs. 1.200')
    expect(bs(1530)).toBe('Bs. 1.530')
    expect(bs(1234567)).toBe('Bs. 1.234.567')
  })
  it('fechas dd/mm/aaaa', () => expect(fecha('2026-10-09')).toBe('09/10/2026'))
})

describe('tiempo', () => {
  it('toMin/toHM son inversas', () => {
    for (const hm of ['00:00', '08:30', '19:45', '23:59']) expect(toHM(toMin(hm))).toBe(hm)
  })
  it('addDays cruza mes y año', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('numeración FDI', () => {
  it('dentición permanente: 32 piezas, 11–48', () => {
    const { upper, lower } = teethRows('permanente')
    expect(upper).toEqual([18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28])
    expect(lower).toEqual([48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38])
  })
  it('dentición temporal: 20 piezas, 51–85', () => {
    const { upper, lower } = teethRows('temporal')
    expect(upper).toEqual([55, 54, 53, 52, 51, 61, 62, 63, 64, 65])
    expect(lower).toEqual([85, 84, 83, 82, 81, 71, 72, 73, 74, 75])
  })
  it('clasifica el tipo de pieza', () => {
    expect(kind(11)).toBe('incisivo')
    expect(kind(23)).toBe('canino')
    expect(kind(34)).toBe('premolar')
    expect(kind(46)).toBe('molar')
    expect(kind(54)).toBe('molar') // en temporales no hay premolares
    expect(kind(83)).toBe('canino')
  })
})
