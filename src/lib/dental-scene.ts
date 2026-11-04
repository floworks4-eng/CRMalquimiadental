import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TOOTH_3D_COORDS } from './teeth'
import { DENTAL_MODEL_URL } from './dental-model'
import type { ToothCondition } from './domain/clinical'

export type DentalLayers = { roots: boolean; bone: boolean; gums: boolean; vessels: boolean; nerves: boolean }
export type DentalSceneState = {
  layers: DentalLayers
  selected?: number
  marks: Record<number, { condition: ToothCondition }>
  rotating: boolean
  reducedMotion: boolean
}
export type DentalAngle = 'front' | 'right' | 'left'

const CROWN_COLORS: Partial<Record<ToothCondition, string>> = {
  sano: '#9cdab7',
  obturacion: '#72c9dc',
  caries: '#df9d83',
  fractura: '#df9d83',
  corona: '#d7b56d',
  protesis: '#d7b56d',
  endodoncia: '#9ac4f0',
  implante: '#9ac4f0',
  sellante: '#9cdab7',
  otro: '#dbc99b',
}

/** Public Three.js APIs only. Each view owns and disposes its WebGL resources. */
export function createDentalScene(
  host: HTMLDivElement,
  initial: DentalSceneState,
  events: { onReady: () => void; onError: () => void; onSelect: (tooth: number) => void },
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.domElement.setAttribute(
    'aria-label',
    'Boca en tres dimensiones. Arrastra para girar y toca un diente para elegirlo. También puedes elegirlo en el mapa dental.',
  )
  renderer.domElement.setAttribute('role', 'img')
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777384, 2.5))
  const key = new THREE.DirectionalLight(0xfff5df, 3.5)
  key.position.set(-3, 5, 7)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xbdd5ff, 2)
  fill.position.set(4, 1, -2)
  scene.add(fill)

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 1.5
  controls.maxDistance = 18
  controls.minPolarAngle = 0.2
  controls.maxPolarAngle = Math.PI - 0.2
  controls.autoRotateSpeed = 0.6
  // Keep vertical page scrolling available on touch screens.
  controls.touches.ONE = THREE.TOUCH.ROTATE
  renderer.domElement.style.touchAction = 'pan-y'

  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = []
  const target = new THREE.Vector3(0, -0.52, 0.25)
  const goalTarget = target.clone()
  const goalPosition = new THREE.Vector3(0, 1, 8)
  let state = initial
  let disposed = false
  let visible = true
  let frame = 0
  let transitioning = false
  let size = new THREE.Vector3(3, 3, 3)
  let angle: DentalAngle = 'front'
  let lastSelection = initial.selected
  controls.target.copy(target)
  camera.position.copy(goalPosition)

  function invalidate() {
    if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw)
  }
  function draw() {
    frame = 0
    if (disposed || !visible || document.hidden) return
    if (transitioning) {
      const progress = state.reducedMotion ? 1 : 0.18
      camera.position.lerp(goalPosition, progress)
      controls.target.lerp(goalTarget, progress)
      if (camera.position.distanceTo(goalPosition) < 0.005 && controls.target.distanceTo(goalTarget) < 0.005) {
        camera.position.copy(goalPosition)
        controls.target.copy(goalTarget)
        transitioning = false
      }
    }
    const moving = controls.update()
    renderer.render(scene, camera)
    if (moving || transitioning || controls.autoRotate) invalidate()
  }
  controls.addEventListener('change', invalidate)
  const stopTransition = () => {
    transitioning = false
  }
  controls.addEventListener('start', stopTransition)

  function fit(nextAngle: DentalAngle = angle, focusSelected = true, immediate = false) {
    angle = nextAngle
    const selected = focusSelected && state.selected ? TOOTH_3D_COORDS[state.selected] : undefined
    goalTarget.set(...(selected?.center ?? [0, -0.52, 0.25]))
    const verticalFov = THREE.MathUtils.degToRad(camera.fov)
    const distance = (Math.max(size.y, size.x / Math.max(camera.aspect, 0.5)) / (2 * Math.tan(verticalFov / 2))) * 1.12
    const radius = Math.max(3.4, distance * (selected ? 0.78 : 1))
    const theta = THREE.MathUtils.degToRad(selected ? selected.orbitThetaDeg : nextAngle === 'right' ? -62 : nextAngle === 'left' ? 62 : 0)
    const offset = new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, THREE.MathUtils.degToRad(80), theta))
    goalPosition.copy(goalTarget).add(offset)
    transitioning = true
    if (immediate || state.reducedMotion) {
      camera.position.copy(goalPosition)
      controls.target.copy(goalTarget)
      transitioning = false
    }
    invalidate()
  }

  function syncMaterials() {
    const { layers, selected, marks } = state
    const through = layers.roots || layers.vessels || layers.nerves
    for (const mesh of meshes) {
      const mat = mesh.material
      const name = mat.name
      const tooth = /^tooth-(\d+)-(crown|root)$/.exec(name)
      let alpha = 1
      mat.emissive.set('#000000')
      if (tooth) {
        const fdi = Number(tooth[1])
        const root = tooth[2] === 'root'
        const chosen = selected === fdi
        const condition = marks[fdi]?.condition
        mesh.visible = condition !== 'ausente' && (!root || through || (!layers.gums && !layers.bone))
        alpha = 1
        mat.color.set(root ? '#d9c092' : (CROWN_COLORS[condition] ?? '#f2e8cf'))
        mat.roughness = root ? 0.52 : 0.3
        if (chosen) {
          mat.color.set(root ? '#f3d48e' : '#fff2ce')
          mat.emissive.set('#24456d')
          mat.emissiveIntensity = 0.4
        }
        mesh.renderOrder = chosen ? 3 : 1
      } else if (name.includes('gum')) {
        mesh.visible = layers.gums
        mat.color.set('#cb7d86')
        alpha = through ? 0.12 : 1
        mesh.renderOrder = 0
      } else if (['right-maxilla', 'left-maxilla', 'mandible'].includes(name)) {
        mesh.visible = layers.bone
        mat.color.set('#e3d8bd')
        alpha = through ? 0.08 : 1
        mesh.renderOrder = 0
      } else if (name.includes('arteries') || name.includes('veins')) {
        mesh.visible = layers.vessels
        mat.color.set(name.includes('veins') ? '#438be8' : '#e83840')
        mesh.renderOrder = 2
      } else if (name.includes('nerves')) {
        mesh.visible = layers.nerves
        mat.color.set('#f5cc3d')
        mesh.renderOrder = 2
      }
      mat.opacity = alpha
      mat.transparent = alpha < 1
      mat.depthWrite = alpha >= 1
      mat.needsUpdate = true
    }
    controls.autoRotate = state.rotating && !state.reducedMotion
    invalidate()
  }

  const resize = () => {
    const { width, height } = host.getBoundingClientRect()
    if (!width || !height) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    fit(angle, true, true)
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) invalidate()
  })
  intersectionObserver.observe(host)
  document.addEventListener('visibilitychange', invalidate)
  const contextLost = (e: Event) => {
    e.preventDefault()
    events.onError()
  }
  renderer.domElement.addEventListener('webglcontextlost', contextLost)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let down: { x: number; y: number; id: number } | undefined
  let multiplePointers = false
  const activePointers = new Set<number>()
  const pointerDown = (e: PointerEvent) => {
    activePointers.add(e.pointerId)
    multiplePointers = activePointers.size > 1
    down = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const pointerUp = (e: PointerEvent) => {
    activePointers.delete(e.pointerId)
    if (!down || multiplePointers || down.id !== e.pointerId || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
      down = undefined
      return
    }
    down = undefined
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, (-(e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    // Raycast teeth explicitly so translucent tissue cannot intercept a selection.
    const hit = raycaster.intersectObjects(
      meshes.filter((m) => m.visible && /^tooth-/.test(m.material.name)),
      false,
    )[0]
    const match = hit && /^tooth-(\d+)-/.exec((hit.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.name)
    if (match) events.onSelect(Number(match[1]))
  }
  const pointerCancel = (e: PointerEvent) => {
    activePointers.delete(e.pointerId)
    down = undefined
  }
  renderer.domElement.addEventListener('pointerdown', pointerDown)
  renderer.domElement.addEventListener('pointerup', pointerUp)
  renderer.domElement.addEventListener('pointercancel', pointerCancel)

  const disposeModel = (model: THREE.Object3D) => {
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.geometry.dispose()
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach((mat) => mat.dispose())
    })
  }
  new GLTFLoader().load(
    DENTAL_MODEL_URL,
    (gltf) => {
      if (disposed) {
        disposeModel(gltf.scene)
        return
      }
      gltf.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) meshes.push(obj)
      })
      scene.add(gltf.scene)
      size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3())
      syncMaterials()
      resize()
      events.onReady()
    },
    undefined,
    () => {
      if (!disposed) events.onError()
    },
  )
  resize()

  return {
    update(next: DentalSceneState) {
      state = next
      syncMaterials()
      if (state.selected !== lastSelection) {
        lastSelection = state.selected
        fit('front')
      }
    },
    view(next: DentalAngle, focusSelected = false) {
      fit(next, focusSelected)
    },
    zoom(factor: number) {
      transitioning = false
      camera.position
        .sub(controls.target)
        .multiplyScalar(factor)
        .clampLength(controls.minDistance, controls.maxDistance)
        .add(controls.target)
      controls.update()
      invalidate()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', invalidate)
      renderer.domElement.removeEventListener('webglcontextlost', contextLost)
      renderer.domElement.removeEventListener('pointerdown', pointerDown)
      renderer.domElement.removeEventListener('pointerup', pointerUp)
      renderer.domElement.removeEventListener('pointercancel', pointerCancel)
      controls.dispose()
      disposeModel(scene)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
