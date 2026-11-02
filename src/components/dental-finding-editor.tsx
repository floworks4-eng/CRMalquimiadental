'use client'

import { useEffect, useId, useRef } from 'react'
import { Check, Eraser, LoaderCircle, X } from 'lucide-react'
import { CONDITION_LABEL, SURFACES, SURFACE_LABEL, type ToothCondition } from '@/lib/domain/clinical'
import { getToothInfo } from '@/lib/teeth'
import { DentalTooth } from './dental-tooth'
import type { ToothMark } from './odontogram'

const QUICK_CONDITIONS: ToothCondition[] = [
  'caries',
  'fractura',
  'ausente',
  'corona',
  'endodoncia',
  'implante',
  'sellante',
  'protesis',
  'otro',
]

export type DentalEditingProps = {
  onMark?: (tooth: number, condition: ToothCondition) => Promise<string | undefined> | string | undefined
  onClear?: (tooth: number) => Promise<string | undefined> | string | undefined
  disabled?: boolean
  surfaces?: string[]
  onSurfacesChange?: (surfaces: string[]) => void
}

export function DentalFindingEditor({
  tooth,
  mark,
  saving,
  error,
  onClose,
  onMark,
  onClear,
  surfaces = [],
  onSurfacesChange,
}: {
  tooth?: number
  mark?: ToothMark
  saving: boolean
  error?: string
  onClose: () => void
  onMark: (condition: ToothCondition) => void
  onClear?: () => void
  surfaces?: string[]
  onSurfacesChange?: (surfaces: string[]) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const info = tooth ? getToothInfo(tooth) : undefined

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!tooth) {
      if (dialog.open) dialog.close()
      return
    }
    const returnFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      if (dialog.open) dialog.close()
      document.body.style.overflow = previousOverflow
      returnFocus?.focus()
    }
  }, [tooth])

  return (
    <dialog
      ref={ref}
      className="dental-finding-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        if (saving) event.preventDefault()
        else onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current && !saving) onClose()
      }}
    >
      {info && (
        <>
          <div className="dental-finding-dialog__header">
            <div className="dental-finding-dialog__tooth" aria-hidden>
              <DentalTooth tooth={tooth} condition={mark?.condition} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gold-soft">
                {info.zoneLabel} · pieza {tooth}
              </p>
              <h3 id={titleId} className="mt-1 text-lg font-semibold leading-snug text-ivory">
                {info.name}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {mark
                  ? `${CONDITION_LABEL[mark.condition]} · ${mark.today ? 'registrado hoy' : 'registro anterior'}`
                  : 'Sin hallazgos registrados'}
              </p>
            </div>
            <button
              type="button"
              autoFocus
              disabled={saving}
              onClick={onClose}
              className="dental-render__zoom shrink-0"
              aria-label="Cerrar selección de hallazgo"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <p id={descriptionId} className="mb-3 text-sm text-bone">
              ¿Qué tiene este diente? Toca una opción para guardarla.
            </p>
            <div role="group" aria-label={`Marcar hallazgo en pieza ${tooth}`} className="dental-condition-grid">
              {QUICK_CONDITIONS.map((condition) => (
                <button
                  key={condition}
                  type="button"
                  disabled={saving}
                  className="dental-condition-option"
                  data-condition={condition}
                  aria-pressed={Boolean(mark?.today && mark.condition === condition)}
                  onClick={() => onMark(condition)}
                >
                  <DentalTooth tooth={tooth} condition={condition} className="h-14 w-11" />
                  <span>{CONDITION_LABEL[condition]}</span>
                  {mark?.today && mark.condition === condition && (
                    <Check className="absolute right-2 top-2 text-gold" size={14} aria-hidden />
                  )}
                </button>
              ))}
            </div>
            {onSurfacesChange && (
              <details className="mt-3 rounded-xl border border-white/10 px-3 text-xs text-muted">
                <summary className="min-h-11 cursor-pointer py-3">
                  Indicar caras del diente <span className="text-muted">(opcional)</span>
                </summary>
                <div className="flex flex-wrap gap-2 pb-3" role="group" aria-label="Caras del diente">
                  {SURFACES.map((surface) => (
                    <button
                      key={surface}
                      type="button"
                      disabled={saving}
                      aria-pressed={surfaces.includes(surface)}
                      onClick={() =>
                        onSurfacesChange(
                          surfaces.includes(surface) ? surfaces.filter((value) => value !== surface) : [...surfaces, surface],
                        )
                      }
                      className={`min-h-11 rounded-lg border px-3 ${surfaces.includes(surface) ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/10'}`}
                    >
                      {SURFACE_LABEL[surface]}
                    </button>
                  ))}
                </div>
              </details>
            )}
            {mark?.today && onClear && (
              <button type="button" disabled={saving} onClick={onClear} className="btn btn-ghost mt-3 min-h-11 w-full text-xs">
                <Eraser size={16} aria-hidden />
                Quitar marca de hoy
              </button>
            )}
            {saving && (
              <p role="status" className="mt-3 flex items-center justify-center gap-2 text-sm text-gold-soft">
                <LoaderCircle size={16} className="animate-spin" aria-hidden /> Guardando hallazgo…
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-bad/35 bg-bad/10 p-3 text-sm text-bad">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </dialog>
  )
}
