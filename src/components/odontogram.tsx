'use client'
import { useState } from 'react'
import { CONDITION_LABEL, CONDITIONS, type ToothCondition } from '@/lib/domain/clinical'
import { teethRows, type Dentition } from '@/lib/teeth'

export type ToothMark = { condition: ToothCondition; today: boolean }

const ABBR: Record<ToothCondition, string> = {
  caries: 'C', corona: 'Co', endodoncia: 'E', ausente: 'A', fractura: 'F', sellante: 'S', implante: 'I', protesis: 'P', otro: '•',
}

/** Odontograma FDI en 2D. Manejable con teclado: cada pieza es un botón con su estado en el nombre accesible. */
export function Odontogram({ marks, selected, onSelect, initialDentition = 'permanente' }: {
  marks: Record<number, ToothMark>
  selected?: number
  onSelect: (n: number) => void
  initialDentition?: Dentition
}) {
  const [dentition, setDentition] = useState<Dentition>(initialDentition)
  const rows = teethRows(dentition)
  const row = (list: number[], label: string, upper: boolean) => (
    <div role="group" aria-label={label} className="flex justify-center gap-1">
      {list.map((n, i) => {
        const m = marks[n]
        const c = m?.condition
        return (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(n)}
            aria-pressed={selected === n}
            aria-label={`Pieza ${n}: ${c ? CONDITION_LABEL[c] + (m.today ? ' (hoy)' : '') : 'sin hallazgos'}`}
            className={`flex w-9 shrink-0 flex-col items-center rounded-lg py-1 ${i === list.length / 2 ? 'ml-3' : ''} ${
              selected === n ? 'bg-azure/20 ring-2 ring-azure shadow-[0_0_14px_rgb(47_123_255/0.5)]' : 'hover:bg-white/6'
            } ${upper ? '' : 'flex-col-reverse'}`}
          >
            <span className="num text-[0.68rem] text-muted">{n}</span>
            <svg viewBox="0 0 30 30" className="h-8 w-8" aria-hidden>
              <rect x="3" y="3" width="24" height="24" rx="5"
                fill={c === 'corona' || c === 'protesis' ? '#c9a961' : c === 'implante' ? '#8fa3b8' : '#f1e8d6'}
                fillOpacity={c === 'ausente' ? 0.05 : 0.92}
                stroke={m?.today ? '#2f7bff' : c === 'ausente' ? '#b5aea3' : '#00000040'} strokeWidth={m?.today ? 2 : 1}
                strokeDasharray={c === 'ausente' ? '3 2' : undefined} />
              <rect x="10" y="10" width="10" height="10" rx="2" fill="none" stroke="#00000030" />
              {c === 'caries' && <circle cx="15" cy="15" r="5" fill="#7a3524" />}
              {c === 'endodoncia' && <line x1="15" y1="4" x2="15" y2="26" stroke="#2f7bff" strokeWidth="3" />}
              {c === 'fractura' && <path d="M8 6 14 15 11 16 22 25" fill="none" stroke="#7a3524" strokeWidth="2" />}
              {c === 'sellante' && <rect x="11" y="11" width="8" height="8" rx="1" fill="#6fd69a" />}
              {c === 'ausente' && <path d="M7 7 23 23M23 7 7 23" stroke="#ff8a80" strokeWidth="2" />}
            </svg>
            <span className="num h-3 text-[0.62rem] leading-3 text-gold-soft">{c ? ABBR[c] : ''}</span>
          </button>
        )
      })}
    </div>
  )
  return (
    <div>
      <div role="group" aria-label="Dentición" className="mb-3 inline-flex rounded-xl border border-white/10 bg-black/20 p-0.5 text-xs">
        {(['permanente', 'temporal'] as const).map((d) => (
          <button key={d} type="button" aria-pressed={dentition === d} onClick={() => setDentition(d)}
            className={`rounded-lg px-3 py-1.5 ${dentition === d ? 'bg-white/10 text-gold ring-1 ring-gold/40' : 'text-muted'}`}>
            {d === 'permanente' ? 'Permanente 11–48' : 'Temporal 51–85'}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="mx-auto w-max space-y-3 py-2">
          {row(rows.upper, 'Arcada superior', true)}
          <div className="border-t border-dashed border-white/10" />
          {row(rows.lower, 'Arcada inferior', false)}
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Leyenda">
        {CONDITIONS.map((c) => <li key={c}><span className="num text-gold-soft">{ABBR[c]}</span> = {CONDITION_LABEL[c]}</li>)}
        <li><span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-azure align-middle" aria-hidden /> registrado hoy</li>
      </ul>
    </div>
  )
}
