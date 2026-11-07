import * as THREE from 'three'
import type { ToothCondition } from './domain/clinical'

/** Work from the original every time so changing/clearing a finding restores anatomy. */
export function findingGeometry(original: THREE.BufferGeometry, condition: ToothCondition | undefined, root: boolean, upper: boolean) {
  const geometry = original.clone()
  const positions = geometry.getAttribute('position')
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const height = box.max.y - box.min.y
  if (height === 0) return geometry
  if (condition === 'fractura' && !root) {
    const edge = upper ? box.min.y + height * 0.38 : box.max.y - height * 0.38
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
      const jagged = edge + Math.sin(x * 67 + z * 41) * height * 0.025
      positions.setY(i, upper ? Math.max(y, jagged) : Math.min(y, jagged))
    }
  } else if (condition === 'implante' && root) {
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2
    const radius = Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * 0.32
    for (let i = 0; i < positions.count; i++) {
      const theta = Math.atan2(positions.getZ(i) - cz, positions.getX(i) - cx)
      const y = positions.getY(i)
      const thread = radius * (0.87 + 0.13 * Math.cos((y - box.min.y) / height * Math.PI * 24))
      positions.setX(i, cx + Math.cos(theta) * thread)
      positions.setZ(i, cz + Math.sin(theta) * thread)
    }
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
