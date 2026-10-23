'use client'
import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { kind, isUpper, side, type ToothKind } from '@/lib/teeth'
import type { ToothCondition } from '@/lib/data'

type Props = { upper: number[]; lower: number[]; marks: Record<number, ToothCondition>; selected?: number; onSelect: (n: number) => void }

const WIDTH: Record<ToothKind, number> = { incisivo: 0.78, canino: 0.8, premolar: 0.72, molar: 1 }
const SIZE: Record<ToothKind, [number, number]> = { incisivo: [0.95, 0.36], canino: [1.05, 0.55], premolar: [0.8, 0.72], molar: [0.72, 0.88] } // alto, fondo
const ABBR: Record<ToothCondition, string> = { caries: 'C', corona: 'Co', endodoncia: 'E', ausente: 'A' }

/** Ubica las piezas de una arcada sobre media elipse, repartidas por su ancho real (incisivos angostos, molares anchos). */
function layout(teeth: number[], temporal: boolean) {
  const a = temporal ? 1.9 : 2.5
  const b = temporal ? 2.6 : 3.5
  const zc = temporal ? -0.9 : -1.5
  // muestreo de la elipse para repartir por longitud de arco
  const N = 400
  const tMax = temporal ? 1.35 : 1.5
  const len = [0]
  for (let i = 1; i <= N; i++) {
    const t0 = ((i - 1) / N) * tMax
    const t1 = (i / N) * tMax
    len.push(len[i - 1] + Math.hypot(a * (Math.sin(t1) - Math.sin(t0)), b * (Math.cos(t1) - Math.cos(t0))))
  }
  const total = len[N]
  const byQuadrant = new Map<number, number[]>()
  for (const n of teeth) byQuadrant.set(Math.floor(n / 10), [...(byQuadrant.get(Math.floor(n / 10)) ?? []), n])
  const out: { n: number; pos: [number, number, number]; rotY: number; w: number }[] = []
  for (const list of byQuadrant.values()) {
    const sorted = [...list].sort((x, y) => (x % 10) - (y % 10))
    const widths = sorted.map((n) => WIDTH[kind(n)] * (n >= 50 && kind(n) === 'molar' ? 0.85 : 1))
    const sum = widths.reduce((s, w) => s + w, 0)
    const k = (total * 0.98) / sum
    let acc = 0
    sorted.forEach((n, i) => {
      const target = (acc + widths[i] / 2) * k
      acc += widths[i]
      const j = Math.max(1, len.findIndex((l) => l >= target))
      const t = (j / N) * tMax
      const s = side(n)
      const tx = s * a * Math.cos(t)
      const tz = -b * Math.sin(t)
      out.push({ n, pos: [s * a * Math.sin(t), 0, zc + b * Math.cos(t)], rotY: Math.atan2(-tz, tx), w: widths[i] * k * 0.92 })
    })
  }
  return out
}

type Anchors = Map<number, THREE.Object3D>

function Tooth({ n, pos, rotY, w, cond, selected, hovered, onHover, onSelect, anchors }: {
  n: number; pos: [number, number, number]; rotY: number; w: number; cond?: ToothCondition; selected: boolean; hovered: boolean
  onHover: (n: number | null) => void; onSelect: (n: number) => void; anchors: Anchors
}) {
  const k = kind(n)
  const [h0, d0] = SIZE[k]
  const temporal = n >= 50
  const h = h0 * (temporal ? 0.8 : 1)
  const d = d0 * (temporal ? 0.85 : 1)
  const sign = isUpper(n) ? 1 : -1 // las coronas superiores cuelgan hacia el plano oclusal
  const crownY = sign * (0.05 + h / 2)
  const glow = selected ? 0.75 : hovered ? 0.3 : 0
  const ghost = cond === 'ausente'
  const material = (
    <meshPhysicalMaterial
      color={cond === 'corona' ? '#c9a961' : '#f1e8d6'}
      metalness={cond === 'corona' ? 0.85 : 0}
      roughness={cond === 'corona' ? 0.25 : 0.38}
      clearcoat={cond === 'corona' ? 0 : 0.7}
      emissive="#2f7bff"
      emissiveIntensity={glow}
      transparent={ghost}
      opacity={ghost ? 0.14 : 1}
      wireframe={ghost}
    />
  )
  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(n); document.body.style.cursor = 'pointer' },
    onPointerOut: () => { onHover(null); document.body.style.cursor = '' },
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta < 6) onSelect(n) },
  }
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      {k === 'molar' || k === 'premolar' ? (
        <RoundedBox args={[w, h, d]} radius={Math.min(w, d) * 0.32} smoothness={4} position={[0, crownY, 0]} {...handlers}>{material}</RoundedBox>
      ) : (
        <mesh position={[0, crownY, 0]} scale={[w, h / 1.4, d]} {...handlers}>
          <capsuleGeometry args={[0.5, 0.4, 6, 18]} />
          {material}
        </mesh>
      )}
      {!ghost && (
        <mesh position={[0, sign * (0.05 + h + 0.3), 0]} rotation={[sign > 0 ? 0 : Math.PI, 0, 0]}>
          <coneGeometry args={[Math.min(w, d) * 0.32, 0.7, 12]} />
          <meshStandardMaterial color="#d8ccb4" roughness={0.6} />
        </mesh>
      )}
      {cond === 'caries' && (
        <mesh position={[0, sign * 0.06, 0]} scale={[1, 0.45, 1]}>
          <sphereGeometry args={[Math.min(w, d) * 0.26, 16, 12]} />
          <meshStandardMaterial color="#4a1f14" roughness={0.9} />
        </mesh>
      )}
      {cond === 'endodoncia' && (
        <mesh position={[0, sign * (0.05 + h * 0.5), 0]}>
          <cylinderGeometry args={[0.06, 0.06, h * 1.15, 10]} />
          <meshStandardMaterial color="#2f7bff" emissive="#2f7bff" emissiveIntensity={1.2} />
        </mesh>
      )}
      <object3D position={[0, sign * -0.35, 0]} ref={(o) => { if (o) anchors.set(n, o); else anchors.delete(n) }} />
    </group>
  )
}

function Gum({ pts, upper }: { pts: [number, number, number][]; upper: boolean }) {
  const geo = useMemo(() => {
    const ordered = [...pts].sort((p, q) => p[0] - q[0]).map((p) => new THREE.Vector3(p[0], upper ? 0.95 : -0.95, p[2]))
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ordered), 120, 0.3, 12, false)
  }, [pts, upper])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#6e3b42" roughness={0.65} />
    </mesh>
  )
}

/** Proyecta cada pieza a coordenadas de pantalla y mueve su etiqueta DOM (más liviano que una raíz React por etiqueta). */
function Projector({ anchors, labels }: { anchors: Anchors; labels: React.RefObject<Map<number, HTMLSpanElement>> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    for (const [n, o] of anchors) {
      const el = labels.current.get(n)
      if (!el) continue
      o.getWorldPosition(v).project(camera)
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}

export default function Odontogram3D({ upper, lower, marks, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const anchors = useMemo<Anchors>(() => new Map(), [])
  const labels = useRef(new Map<number, HTMLSpanElement>())
  const temporal = upper[0] >= 50
  const arches = useMemo(() => [layout(upper, temporal), layout(lower, temporal)], [upper, lower, temporal])
  return (
    <div className="relative h-full w-full touch-none">
      <Canvas camera={{ position: [0, 0, 9.6], fov: 42 }} dpr={[1, 2]} frameloop="demand" gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 6, 8]} intensity={1.7} color="#fff4e0" />
        <directionalLight position={[-5, -2, -4]} intensity={0.7} color="#c9a961" />
        <pointLight position={[0, 0, 5]} intensity={6} color="#2f7bff" distance={9} />
        {arches.map((teeth, i) => (
          <group key={i} position={[0, i === 0 ? 1.75 : -1.75, 0]} rotation={[i === 0 ? -0.95 : 0.95, 0, 0]}>
            <Gum pts={teeth.map((t) => t.pos)} upper={i === 0} />
            {teeth.map((t) => (
              <Tooth key={t.n} {...t} cond={marks[t.n]} selected={selected === t.n} hovered={hovered === t.n} onHover={setHovered} onSelect={onSelect} anchors={anchors} />
            ))}
          </group>
        ))}
        <Projector anchors={anchors} labels={labels} />
        <OrbitControls makeDefault enablePan={false} minDistance={6} maxDistance={16} />
      </Canvas>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...upper, ...lower].map((n) => {
          const show = selected === n || hovered === n || !!marks[n]
          return (
            <span
              key={n}
              ref={(el) => { if (el) labels.current.set(n, el); else labels.current.delete(n) }}
              className={`num absolute left-0 top-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] transition-opacity duration-150 ${
                show ? 'opacity-100' : 'opacity-0'
              } ${selected === n ? 'border-azure bg-azure text-white shadow-[0_0_12px_#2f7bff]' : 'border-white/20 bg-black/70 text-bone'}`}
            >
              {n}{marks[n] ? ` · ${ABBR[marks[n]]}` : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}
