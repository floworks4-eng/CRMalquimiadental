'use client'
import { useState } from 'react'
import { CONDITION_LABEL, CONDITIONS, type ToothCondition } from '@/lib/domain/clinical'
import { dentitionForTooth, getToothInfo, teethQuadrants, type Dentition, type QuadrantZoneGroup } from '@/lib/teeth'
import { DentalTooth } from './dental-tooth'

export type ToothMark = { condition: ToothCondition; today: boolean }

export const CONDITION_ABBR: Record<ToothCondition, string> = {
  caries: 'C',
  corona: 'Co',
  endodoncia: 'E',
  ausente: 'A',
  fractura: 'F',
  sellante: 'S',
  implante: 'I',
  protesis: 'P',
  otro: '•',
}

function simpleToothName(n: number) {
  const names =
    dentitionForTooth(n) === 'temporal'
      ? ['Diente central', 'Diente lateral', 'Colmillo', 'Muela 1', 'Muela 2']
      : ['Diente central', 'Diente lateral', 'Colmillo', 'Premolar 1', 'Premolar 2', 'Muela 1', 'Muela 2', 'Muela del juicio']
  return names[(n % 10) - 1]
}

/** Cuatro zonas del paciente, con nombres simples y numeración FDI secundaria. */
export function Odontogram({
  marks,
  selected,
  onSelect,
  initialDentition = 'permanente',
  dentition: controlledDentition,
  onDentitionChange,
}: {
  marks: Record<number, ToothMark>
  selected?: number
  onSelect: (n: number) => void
  initialDentition?: Dentition
  dentition?: Dentition
  onDentitionChange?: (d: Dentition) => void
}) {
  const [internalDentition, setInternalDentition] = useState<Dentition>(() => (selected ? dentitionForTooth(selected) : initialDentition))
  const dentition = controlledDentition ?? internalDentition
  const handleDentitionChange = (next: Dentition) => {
    if (next === dentition) return
    setInternalDentition(next)
    // El padre puede limpiar `selected` aquí sin cambiar onSelect(number).
    onDentitionChange?.(next)
  }

  const quadrants = teethQuadrants(dentition)
  const visibleSelection = Object.values(quadrants).some((group) => group.teeth.some((n) => n === selected)) ? selected : undefined
  const selectedInfo = visibleSelection ? getToothInfo(visibleSelection) : null
  const selectedMark = visibleSelection ? marks[visibleSelection] : undefined

  const renderQuadrant = (group: QuadrantZoneGroup) => (
    <div
      key={group.zoneId}
      role="group"
      aria-label={`${group.label} (${group.patientOrientation})`}
      className="min-w-0 rounded-2xl border border-white/10 bg-black/10 p-2"
    >
      <div className="mb-1.5 flex items-center justify-between gap-1 border-b border-white/8 px-1 pb-2">
        <span className="text-xs font-semibold text-bone">{group.label}</span>
        <span className="text-[10px] text-muted" aria-hidden="true">
          Q{group.quadrant} · paciente
        </span>
      </div>
      <div className={`grid grid-cols-4 gap-1 ${dentition === 'permanente' ? '@min-[60rem]:grid-cols-8' : '@min-[60rem]:grid-cols-5'}`}>
        {group.teeth.map((n) => {
          const info = getToothInfo(n)
          const m = marks[n]
          const c = m?.condition
          const isSelected = selected === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onSelect(n)}
              aria-pressed={isSelected}
              aria-label={`${simpleToothName(n)} · ${group.label} · pieza ${n}: ${
                c ? CONDITION_LABEL[c] + (m.today ? ' (hoy)' : '') : 'sin hallazgos'
              }`}
              title={`${info.labelWithNumber} (${info.zoneLabel}) · ${c ? CONDITION_LABEL[c] + (m.today ? ' (hoy)' : ' (previo)') : 'sin hallazgos'}`}
              className={`relative flex min-h-[76px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border py-1.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                isSelected ? 'border-gold/70 bg-gold/15 ring-1 ring-gold/40' : 'border-transparent hover:border-white/15 hover:bg-white/6'
              }`}
            >
              <DentalTooth
                tooth={n}
                condition={c}
                selected={isSelected}
                upper={group.arch === 'upper'}
                className="h-[52px] w-[48px] shrink-0"
              />
              <span className={`num text-[11px] leading-none ${isSelected ? 'font-semibold text-gold-soft' : 'text-muted'}`}>
                <span className="sr-only">FDI </span>
                {n}
              </span>
              {m?.today && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-300 ring-2 ring-ink" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="@container min-w-0 max-w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Dentición" className="inline-flex rounded-xl border border-white/10 bg-black/20 p-0.5 text-xs">
          {(['permanente', 'temporal'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dentition === d}
              onClick={() => handleDentitionChange(d)}
              className={`min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                dentition === d ? 'bg-white/12 text-gold ring-1 ring-gold/40 font-medium' : 'text-muted hover:text-bone'
              }`}
            >
              {d === 'permanente' ? 'Adultos' : 'Infantiles'}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-muted">{dentition === 'temporal' ? '20 piezas' : '32 piezas'}</span>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        {dentition === 'temporal' && 'Dientes de leche'}
        <span className="block text-[11px]">Zonas: derecha e izquierda del paciente.</span>
      </p>

      <div role="status" aria-live="polite" aria-atomic="true">
        {selectedInfo && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/30 bg-gold/8 px-3 py-2 text-xs">
            <div>
              <p className="font-semibold text-bone">{selectedInfo.name}</p>
              <p className="num text-xs text-muted">FDI {selectedInfo.fdi}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  selectedMark ? 'border border-gold/40 bg-gold/15 text-bone' : 'border border-white/10 bg-white/5 text-muted'
                }`}
              >
                {selectedMark
                  ? `${CONDITION_LABEL[selectedMark.condition]}${selectedMark.today ? ' · hoy' : ' · previo'}`
                  : 'Sin hallazgos registrados'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 @min-[520px]:grid-cols-2">
        {renderQuadrant(quadrants.upperRight)}
        {renderQuadrant(quadrants.upperLeft)}
        {renderQuadrant(quadrants.lowerRight)}
        {renderQuadrant(quadrants.lowerLeft)}
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 border-t border-white/8 pt-2 text-[11px] text-muted" aria-label="Leyenda">
        {CONDITIONS.map((c) => (
          <li key={c} className="flex items-center gap-1">
            <DentalTooth condition={c} className="h-7 w-6 shrink-0" />
            {CONDITION_LABEL[c]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" aria-hidden="true" /> Hoy
        </li>
      </ul>

      <details className="text-xs text-muted">
        <summary className="min-h-[44px] cursor-pointer content-center select-none rounded-lg py-2 font-medium hover:text-gold focus-visible:outline-2 focus-visible:outline-gold">
          ¿Qué significa FDI?
        </summary>
        <p className="mt-2 leading-relaxed">
          FDI identifica cada diente con dos cifras: zona y posición desde el centro. Por ejemplo, 11 es el diente central de arriba a la
          derecha.
        </p>
      </details>
    </div>
  )
}
