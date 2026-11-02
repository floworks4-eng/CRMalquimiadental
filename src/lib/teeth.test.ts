import { describe, expect, it } from 'vitest'
import {
  dentitionForTooth,
  getToothInfo,
  isUpper,
  kind,
  side,
  teethQuadrants,
  teethRows,
  TOOTH_3D_COORDS,
} from './teeth'

describe('numeración FDI y anatomía dental (src/lib/teeth.ts)', () => {
  it('verifica nombres anatómicos y orientación de paciente en los 4 cuadrantes permanentes', () => {
    const t16 = getToothInfo(16)
    expect(t16.name).toBe('Primer molar superior derecho')
    expect(t16.labelWithNumber).toBe('Primer molar superior derecho · pieza 16')
    expect(t16.zoneLabel).toBe('Arriba derecha')
    expect(t16.patientSideLabel).toBe('Lado derecho del paciente')
    expect(t16.in3DModel).toBe(true)

    const t21 = getToothInfo(21)
    expect(t21.name).toBe('Incisivo central superior izquierdo')
    expect(t21.zoneLabel).toBe('Arriba izquierda')
    expect(t21.in3DModel).toBe(true)

    const t33 = getToothInfo(33)
    expect(t33.name).toBe('Canino inferior izquierdo')
    expect(t33.zoneLabel).toBe('Abajo izquierda')
    expect(t33.in3DModel).toBe(true)

    const t44 = getToothInfo(44)
    expect(t44.name).toBe('Primer premolar inferior derecho')
    expect(t44.zoneLabel).toBe('Abajo derecha')
    expect(t44.in3DModel).toBe(true)
  })

  it('declara explícitamente terceros molares (18, 28, 38, 48) y dentición temporal (51–85) fuera del modelo 3D permanente', () => {
    expect(Object.keys(TOOTH_3D_COORDS)).toHaveLength(28)

    for (const thirdMolar of [18, 28, 38, 48]) {
      const info = getToothInfo(thirdMolar)
      expect(info.in3DModel).toBe(false)
      expect(info.missing3DReason).toContain('terceros molares')
    }

    const t54 = getToothInfo(54)
    expect(t54.name).toBe('Primer molar superior derecho temporal')
    expect(t54.kind).toBe('molar')
    expect(t54.dentition).toBe('temporal')
    expect(t54.in3DModel).toBe(false)
    expect(t54.missing3DReason).toContain('no incluye dentición temporal infantil')
  })

  it('organiza correctamente las filas y cuadrantes para dentición permanente y temporal', () => {
    const perm = teethQuadrants('permanente')
    expect(perm.upperRight.teeth).toEqual([18, 17, 16, 15, 14, 13, 12, 11])
    expect(perm.upperLeft.teeth).toEqual([21, 22, 23, 24, 25, 26, 27, 28])
    expect(perm.lowerRight.teeth).toEqual([48, 47, 46, 45, 44, 43, 42, 41])
    expect(perm.lowerLeft.teeth).toEqual([31, 32, 33, 34, 35, 36, 37, 38])

    const temp = teethRows('temporal')
    expect(temp.upper).toHaveLength(10)
    expect(temp.lower).toHaveLength(10)
    expect(dentitionForTooth(16)).toBe('permanente')
    expect(dentitionForTooth(75)).toBe('temporal')
    expect(isUpper(16)).toBe(true)
    expect(isUpper(46)).toBe(false)
    expect(side(16)).toBe(-1)
    expect(side(26)).toBe(1)
    expect(kind(14)).toBe('premolar')
    expect(kind(54)).toBe('molar')
  })
})
