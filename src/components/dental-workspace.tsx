'use client'

import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { CheckCircle2, Maximize2, Pencil, X } from 'lucide-react'
import type { DentalRenderProps } from './dental-render'
import { Odontogram, type ToothMark } from './odontogram'
import { getToothInfo, type Dentition } from '@/lib/teeth'
import { CONDITION_LABEL, type ToothCondition } from '@/lib/domain/clinical'
import { DentalFindingEditor, type DentalEditingProps } from './dental-finding-editor'

const DentalRender = dynamic(() => import('./dental-render').then((mod) => mod.DentalRender), {
  loading: () => (
    <div role="status" className="dental-render p-5 text-sm text-muted">
      Preparando la vista 3D…
    </div>
  ),
})

type Props = Omit<DentalRenderProps, 'onSelect' | 'onChooseTooth'> &
  DentalEditingProps & {
    initialView?: 'map' | '3d'
    dentition: Dentition
    onSelect: (tooth: number | undefined) => void
    onDentitionChange: (dentition: Dentition) => void
  }

/** Same controlled selection in preview, consultation, patient history and patient presentation. */
export function DentalWorkspace(props: Props) {
  const [presenting, setPresenting] = useState(false)
  const [editingTooth, setEditingTooth] = useState<number>()
  const surfacesDirty = useRef(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [saving, startSaving] = useTransition()
  const [optimisticMarks, updateMark] = useOptimistic(props.marks, (current, change: { tooth: number; condition?: ToothCondition }) => {
    const next: Record<number, ToothMark> = { ...current }
    if (change.condition) next[change.tooth] = { condition: change.condition, today: true }
    else delete next[change.tooth]
    return next
  })
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const openButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (presenting && !dialog.open) dialog.showModal()
    if (!presenting && dialog.open) dialog.close()
    if (!presenting) return
    const previous = document.body.style.overflow
    const returnFocus = openButton.current
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      returnFocus?.focus()
    }
  }, [presenting])

  function selectTooth(tooth: number | undefined) {
    if (saving) return
    props.onSelect(tooth)
    surfacesDirty.current = false
    setError(undefined)
    setNotice(undefined)
    setEditingTooth(props.onMark && tooth ? tooth : undefined)
  }

  function save(condition?: ToothCondition, closeAfter = false) {
    if (!editingTooth || saving || props.disabled) return
    const tooth = editingTooth
    const mutate = condition ? () => props.onMark?.(tooth, condition) : () => props.onClear?.(tooth)
    setError(undefined)
    startSaving(async () => {
      updateMark({ tooth, condition })
      try {
        const message = await mutate()
        if (message) {
          setError(message)
          return
        }
        surfacesDirty.current = false
        if (closeAfter) setEditingTooth(undefined)
        setNotice(condition ? `${props.temporary ? "Prueba aplicada" : "Estado guardado"}: ${CONDITION_LABEL[condition]} · pieza ${tooth}` : `${props.temporary ? "Marca de prueba" : "Marca de hoy"} quitada de la pieza ${tooth}`)
      } catch {
        setError('No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.')
      }
    })
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="title-gold text-xl">Mapa dental</h2>
          <p className="mt-1 text-sm text-muted">
            {props.onMark
              ? 'Toca un diente para marcar caries, fractura u otro hallazgo.'
              : 'Toca un diente para ver su registro o explicarlo en 3D.'}
          </p>
        </div>
        <button ref={openButton} type="button" className="btn btn-secondary min-h-11 text-xs" onClick={() => setPresenting(true)}>
          <Maximize2 size={16} aria-hidden /> Mostrar al paciente
        </button>
      </div>
      {notice && (
        <div role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-ok/25 bg-ok/10 px-3 py-2 text-sm text-bone">
          <CheckCircle2 size={17} className="shrink-0 text-ok" aria-hidden />
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(undefined)}
            className="grid size-11 shrink-0 place-items-center"
            aria-label="Cerrar aviso"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div>
      <DentalExplorer {...props} marks={optimisticMarks} onSelect={selectTooth} />
      {props.onMark && (
        <DentalFindingEditor
          tooth={editingTooth}
          mark={editingTooth ? optimisticMarks[editingTooth] : undefined}
          saving={saving}
          disabled={props.disabled}
          editingHint={props.editingHint}
          temporary={props.temporary}
          error={error}
          onClose={() => {
            if (saving) return
            const condition = editingTooth ? optimisticMarks[editingTooth]?.condition : undefined
            if (surfacesDirty.current && condition) save(condition, true)
            else setEditingTooth(undefined)
          }}
          onMark={(condition) => save(condition)}
          onClear={props.onClear ? () => save() : undefined}
          surfaces={props.surfaces}
          onSurfacesChange={props.onSurfacesChange ? (surfaces) => { surfacesDirty.current = true; props.onSurfacesChange?.(surfaces) } : undefined}
        />
      )}
      </div>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={() => setPresenting(false)}
        onClose={() => setPresenting(false)}
        className="dental-presentation"
      >
        {presenting && (
          <div className="p-4 md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Vamos a verlo juntos</p>
                <h2 id={titleId} className="title-gold mt-1 text-2xl">
                  Tu boca, paso a paso
                </h2>
              </div>
              <button type="button" autoFocus className="btn btn-secondary min-h-11" onClick={() => setPresenting(false)}>
                <X size={18} aria-hidden /> Volver a la ficha
              </button>
            </div>
            <DentalExplorer {...props} marks={optimisticMarks} onSelect={selectTooth} presenting />
          </div>
        )}
      </dialog>
    </>
  )
}

function DentalExplorer({
  marks,
  selected,
  onSelect,
  dentition,
  onDentitionChange,
  onMark,
  disabled,
  presenting = false,
  initialView = 'map',
}: Props & { presenting?: boolean }) {
  const [panel, setPanel] = useState<'map' | '3d'>((presenting || initialView === '3d') && dentition === 'permanente' ? '3d' : 'map')
  const [opened3D, setOpened3D] = useState((presenting || initialView === '3d') && dentition === 'permanente')
  const info = selected ? getToothInfo(selected) : undefined
  const handleDentitionChange = (next: Dentition) => {
    if (next === dentition) return
    onSelect(undefined)
    onDentitionChange(next)
    setPanel('map')
  }
  return (
    <div className="dental-workspace" data-dentition={dentition} data-mode={presenting ? 'patient' : 'clinical'}>
      <div className="dental-workspace-switch" role="group" aria-label="Cómo quieres ver los dientes">
        <button type="button" aria-pressed={panel === 'map'} onClick={() => setPanel('map')}>
          Mapa dental
        </button>
        <button
          type="button"
          aria-pressed={panel === '3d'}
          disabled={dentition === 'temporal'}
          onClick={() => {
            setOpened3D(true)
            setPanel('3d')
          }}
        >
          Boca 3D
        </button>
      </div>
      {info && (
        <div
          className="dental-selected-summary mb-3 rounded-xl border border-gold/20 bg-gold/8 px-3 py-2 text-sm"
          data-panel={panel}
          aria-live="polite"
        >
          <strong>{info.name}</strong>
          <span className="ml-2 text-xs text-muted">
            {info.zoneLabel} · número {selected}
          </span>
          {onMark && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(selected)}
              className="ml-auto inline-flex min-h-11 items-center gap-1.5 px-2 font-medium text-gold"
            >
              <Pencil size={14} aria-hidden /> Marcar hallazgo
            </button>
          )}
        </div>
      )}
      <div className="dental-workspace-body" data-panel={panel}>
        <section className="dental-map-panel min-w-0" aria-label="Elegir diente en el mapa dental">
          <Odontogram
            marks={marks}
            selected={selected}
            onSelect={onSelect}
            dentition={dentition}
            onDentitionChange={handleDentitionChange}
          />
          {selected && (
            <button type="button" className="btn btn-ghost mt-2 min-h-11 text-xs" onClick={() => onSelect(undefined)}>
              Quitar selección
            </button>
          )}
        </section>
        <div className="dental-3d-panel min-w-0">
          {(opened3D || (presenting && dentition === 'permanente')) && (
            <DentalRender
              marks={marks}
              selected={selected}
              onSelect={onSelect}
              dentition={dentition}
              onChooseTooth={() => setPanel('map')}
            />
          )}
        </div>
      </div>
    </div>
  )
}
