'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, Minus, Plus, RotateCcw, Rotate3d } from 'lucide-react'
import { CONDITION_LABEL, type ToothCondition } from '@/lib/domain/clinical'
import { getToothInfo, type Dentition } from '@/lib/teeth'
import type { createDentalScene, DentalLayers, DentalSceneState } from '@/lib/dental-scene'
import type { ToothMark } from './odontogram'

export type DentalRenderProps = {
  marks: Record<number, ToothMark>
  selected?: number
  onSelect?: (tooth: number | undefined) => void
  dentition?: Dentition
  onChooseTooth?: () => void
}

const VIEWS = {
  mouth: {
    label: 'Dentadura completa',
    description: '',
    layers: { roots: false, bone: false, gums: true, vessels: false, nerves: false },
  },
  roots: {
    label: 'Raíces',
    description: '',
    layers: { roots: true, bone: false, gums: true, vessels: false, nerves: false },
  },
  nerves: {
    label: 'Nervios y vasos',
    description: '',
    layers: { roots: true, bone: false, gums: false, vessels: true, nerves: true },
  },
} satisfies Record<string, { label: string; description: string; layers: DentalLayers }>
type View = keyof typeof VIEWS

export const PATIENT_EXPLANATIONS: Record<ToothCondition, string> = {
  sano: 'El odontólogo registró esta pieza como sana en esta atención.',
  obturacion: 'Esta pieza tiene una restauración u obturación registrada. El odontólogo puede explicar su estado.',
  caries: 'Se registró una caries: una zona del diente dañada que el odontólogo debe valorar y tratar.',
  fractura: 'Se registró una fractura: una parte del diente está rota o agrietada.',
  endodoncia:
    'Se registró una endodoncia. Este tratamiento trabaja dentro del diente, donde está la pulpa, y en los conductos de sus raíces.',
  corona: 'Se registró una corona: una cubierta que protege o reconstruye la parte visible del diente.',
  ausente: 'Esta pieza está registrada como ausente. Por eso no aparece en el modelo.',
  sellante: 'Se registró un sellante: una capa protectora en los surcos de la superficie de masticación.',
  implante: 'Se registró un implante. Reemplaza la raíz de una pieza ausente y permite sostener una restauración.',
  protesis: 'Se registró una prótesis para reemplazar o restaurar piezas dentales.',
  otro: 'Hay un hallazgo registrado en esta pieza. El odontólogo puede explicarlo con los datos de la consulta.',
}

export function DentalRender({ marks, selected, onSelect, dentition = 'permanente', onChooseTooth }: DentalRenderProps) {
  const titleId = useId()
  const [view, setView] = useState<View>('mouth')
  const [layers, setLayers] = useState<DentalLayers>(VIEWS.mouth.layers)
  const [rotating, setRotating] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ReturnType<typeof createDentalScene> | null>(null)
  const state: DentalSceneState = { marks, selected, layers, rotating, reducedMotion }
  const latestState = useRef(state)
  const selectRef = useRef(onSelect)
  const selectedInfo = selected ? getToothInfo(selected) : undefined
  const selectedMark = selected ? marks[selected] : undefined

  useEffect(() => {
    latestState.current = { marks, selected, layers, rotating, reducedMotion }
    selectRef.current = onSelect
    sceneRef.current?.update(latestState.current)
  }, [marks, selected, layers, rotating, reducedMotion, onSelect])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const update = () => {
      setReducedMotion(query.matches)
      if (query.matches) setRotating(false)
    }
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let started = false
    let instance: ReturnType<typeof createDentalScene> | undefined
    let timeout: number | undefined
    const start = () => {
      if (started || cancelled) return
      started = true
      timeout = window.setTimeout(() => {
        if (!cancelled) setStatus('error')
      }, 20000)
      void import('@/lib/dental-scene')
        .then(({ createDentalScene }) => {
          if (cancelled) return
          instance = createDentalScene(host, latestState.current, {
            onReady: () => {
              window.clearTimeout(timeout)
              if (!cancelled) setStatus('ready')
            },
            onError: () => {
              window.clearTimeout(timeout)
              if (!cancelled) setStatus('error')
            },
            onSelect: (tooth) => selectRef.current?.(tooth),
          })
          sceneRef.current = instance
        })
        .catch(() => {
          window.clearTimeout(timeout)
          if (!cancelled) setStatus('error')
        })
    }
    // A closed panel does not load the model or allocate a WebGL context.
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              observer?.disconnect()
              start()
            }
          })
    if (observer) observer.observe(host)
    else start()
    return () => {
      cancelled = true
      observer?.disconnect()
      window.clearTimeout(timeout)
      instance?.dispose()
      sceneRef.current = null
    }
  }, [attempt])

  function chooseView(next: View) {
    setView(next)
    setLayers(VIEWS[next].layers)
    sceneRef.current?.view(next === 'nerves' ? 'right' : 'front', next !== 'nerves')
  }
  function reset() {
    chooseView('mouth')
    setRotating(false)
    onSelect?.(undefined)
  }

  return (
    <section className="dental-render" aria-labelledby={titleId}>
      <div className="dental-render__topline">
        <div>
          <h3 id={titleId} className="title-gold text-lg">Modelo 3D</h3>
        </div>
        {(view !== 'mouth' || selected) && <button type="button" onClick={reset} className="dental-render__toggle" title="Mostrar todos los dientes">
          <RotateCcw size={16} aria-hidden /> Mostrar dentadura completa
        </button>}
      </div>

      <div className="dental-view-choices" role="group" aria-label="Qué quieres mostrar">
        {(Object.keys(VIEWS) as View[]).map((key) => (
          <button key={key} type="button" aria-pressed={view === key} onClick={() => chooseView(key)}>
            {VIEWS[key].label}
          </button>
        ))}
      </div>
      {VIEWS[view].description && <p className="px-4 pb-3 text-xs text-muted">{VIEWS[view].description}</p>}

      {dentition === 'temporal' || (selectedInfo && !selectedInfo.in3DModel) ? (
        <div role="status" className="border-t border-gold/20 bg-gold/8 px-4 py-3 text-sm text-bone">
          {dentition === 'temporal'
            ? 'Los dientes infantiles se consultan en el mapa dental. Esta boca 3D muestra dientes de adulto.'
            : 'Esta muela del juicio se consulta en el mapa dental; el modelo 3D no la incluye.'}
          {onChooseTooth && (
            <button type="button" onClick={onChooseTooth} className="ml-2 min-h-10 font-semibold text-gold underline">
              Ir al mapa dental
            </button>
          )}
        </div>
      ) : null}

      <div className="dental-render__stage" aria-busy={status === 'loading'}>
        <div ref={hostRef} className={`dental-canvas ${status === 'error' ? 'invisible' : ''}`} />
        {status === 'loading' && (
          <div className="dental-render__loading" role="status">
            Preparando la boca 3D…
          </div>
        )}
        {status === 'error' && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#242528] p-6 text-center text-sm"
          >
            <AlertCircle size={24} className="text-gold" aria-hidden />
            <p>No pudimos mostrar la boca 3D.</p>
            <p className="text-xs text-muted">Puedes elegir dientes y seguir trabajando desde el mapa dental.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {onChooseTooth && (
                <button type="button" className="btn btn-primary" onClick={onChooseTooth}>
                  Usar mapa dental
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setStatus('loading')
                  setAttempt((n) => n + 1)
                }}
              >
                Reintentar 3D
              </button>
            </div>
          </div>
        )}
        {status === 'ready' && <div className="dental-render__hint">Arrastra para girar · toca un diente</div>}
        {status === 'ready' && (
          <div className="absolute right-3 top-3 flex flex-col gap-2">
            <button type="button" className="dental-render__zoom" aria-label="Acercar boca" onClick={() => sceneRef.current?.zoom(0.8)}>
              <Plus size={19} />
            </button>
            <button type="button" className="dental-render__zoom" aria-label="Alejar boca" onClick={() => sceneRef.current?.zoom(1.25)}>
              <Minus size={19} />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div role="group" aria-label="Ver desde otro lado" className="flex flex-wrap gap-1">
          {(
            [
              ['front', 'Frente'],
              ['right', 'Derecha del paciente'],
              ['left', 'Izquierda del paciente'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="min-h-11 rounded-lg px-2 text-xs text-muted hover:bg-white/8 hover:text-bone"
              onClick={() => sceneRef.current?.view(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="dental-render__toggle"
          aria-pressed={rotating}
          disabled={reducedMotion || status !== 'ready'}
          onClick={() => setRotating((v) => !v)}
        >
          <Rotate3d size={16} aria-hidden />
          {rotating ? 'Pausar giro' : 'Girar'}
        </button>
      </div>

      <div className="border-t border-white/8 p-4" aria-live="polite">
        {selectedInfo ? (
          <>
            <p className="text-xs text-gold-soft">
              {selectedInfo.zoneLabel} · número clínico {selected}
            </p>
            <p className="mt-1 text-base font-semibold text-ivory">{selectedInfo.name}</p>
            <p className="mt-2 text-sm leading-relaxed text-bone">
              {selectedMark ? PATIENT_EXPLANATIONS[selectedMark.condition] : 'No hay hallazgos registrados en este diente.'}
            </p>
            {selectedMark && (
              <p className="mt-2 text-xs text-muted">
                {CONDITION_LABEL[selectedMark.condition]} · {selectedMark.today ? 'hoy' : 'previo'}.
              </p>
            )}
            <details className="mt-3 text-xs text-muted">
              <summary className="min-h-11 cursor-pointer py-3 font-medium text-gold">Detalle anatómico</summary>
              <div className="space-y-2 leading-relaxed">
                <p>
                  <strong className="text-bone">Función y raíces: </strong>
                  {selectedInfo.patientFunction}
                </p>
                <p>
                  <strong className="text-bone">Superficies del diente: </strong>
                  {selectedInfo.surfacesSummary}
                </p>
                <p>
                  <strong className="text-bone">Inervación e irrigación: </strong>
                  {selectedInfo.neurovascularSupply}
                </p>
              </div>
            </details>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted">
            Toca un diente para seleccionarlo.
          </p>
        )}
      </div>

      <details className="border-t border-white/8 px-4 text-xs text-muted">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between py-3">
          Anatomía <ChevronDown size={14} aria-hidden />
        </summary>
        <div className="flex flex-wrap gap-2 pb-3" role="group" aria-label="Capas anatómicas">
          {(
            [
              ['roots', 'Raíces'],
              ['bone', 'Hueso'],
              ['gums', 'Encía'],
              ['vessels', 'Vasos'],
              ['nerves', 'Nervios'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`dental-render__toggle ${layers[key] ? 'is-active' : ''}`}
              aria-pressed={layers[key]}
              onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
            >
              {label}
            </button>
          ))}
        </div>
      </details>
      <details className="border-t border-white/8 px-4 text-xs text-muted">
        <summary className="min-h-11 cursor-pointer py-3">Acerca del modelo</summary>
        <p className="pb-3 leading-relaxed">
          Anatomía de referencia, no es el escaneo de este paciente. Incluye 28 dientes adultos; las muelas del juicio y los dientes
          infantiles se manejan en el mapa. Los vasos representan el lado derecho del atlas. Nervios de ambos lados. BodyParts3D /
          Anatomography 4.3 (DBCLS), adaptado por OrganUI y Alquimia Dental.{' '}
          <a className="text-gold underline" href="/models/ATTRIBUTION.md" target="_blank" rel="noreferrer">
            Créditos y licencia CC BY-SA 2.1 Japan
          </a>
          .
        </p>
      </details>
    </section>
  )
}
