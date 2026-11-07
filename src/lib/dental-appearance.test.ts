import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { findingGeometry } from './dental-appearance'
import { CONDITION_COLOR } from './dental-colors'
import { CONDITIONS } from './domain/clinical'

describe('visual findings', () => {
  it('distinguishes every finding and uses yellow for caries', () => {
    expect(new Set(CONDITIONS.map((c) => CONDITION_COLOR[c])).size).toBe(CONDITIONS.length)
    expect(CONDITION_COLOR.caries).toBe('#f4c430')
  })
  it.each([true, false])('breaks only the crown, restores anatomy and never mutates the source (upper=%s)', (upper) => {
    const original = new THREE.BoxGeometry(1, 2, 1)
    const saved = Array.from(original.getAttribute('position').array)
    const broken = findingGeometry(original, 'fractura', false, upper)
    expect(broken.boundingBox!.max.y - broken.boundingBox!.min.y).toBeLessThan(1.4)
    expect(Array.from(original.getAttribute('position').array)).toEqual(saved)
    const root = findingGeometry(original, 'fractura', true, upper)
    const restored = findingGeometry(original, 'sano', false, upper)
    expect(Array.from(root.getAttribute('position').array)).toEqual(saved)
    expect(Array.from(restored.getAttribute('position').array)).toEqual(saved)
    ;[original, broken, root, restored].forEach((g) => g.dispose())
  })
  it('reshapes implant roots while retaining a finite pickable geometry', () => {
    const original = new THREE.SphereGeometry(1, 16, 16)
    const implant = findingGeometry(original, 'implante', true, false)
    expect(Array.from(implant.getAttribute('position').array)).not.toEqual(Array.from(original.getAttribute('position').array))
    expect(Array.from(implant.getAttribute('position').array).every(Number.isFinite)).toBe(true)
    expect(implant.boundingSphere!.radius).toBeGreaterThan(0)
    original.dispose(); implant.dispose()
  })
})
