'use client'
import dynamic from 'next/dynamic'
import { Component, useState, useSyncExternalStore, type ReactNode } from 'react'
import { CONDITION_LABEL, type ToothCondition } from '@/lib/data'
import { teethRows, type Dentition } from '@/lib/teeth'

const Odontogram3D = dynamic(() => import('./odontogram3d'), {
  ssr: false,
  loading: () => <p className="grid h-full place-items-center text-sm text-muted">Cargando odontograma 3D…</p>,
})

const webgl = () => {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
const useWebGL = () => useSyncExternalStore(() => () => {}, webgl, () => true)

class Fallback extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export const LEGEND: { c: ToothCondition; abbr: string; swatch: string }[] = [
  { c: 'caries', abbr: 'C', swatch: '#7a3524' },
  { c: 'corona', abbr: 'Co', swatch: '#c9a961' },
  { c: 'endodoncia', abbr: 'E', swatch: '#2f7bff' },
  { c: 'ausente', abbr: 'A', swatch: 'transparent' },
]

export function Odontogram({ marks, selected, onSelect, initialDentition = 'permanente' }: {
  marks: Record<number, ToothCondition>
  selected?: number
  onSelect: (n: number) => void
  initialDentition?: Dentition
}) {
  const hasGL = useWebGL()
  const [mode, setMode] = useState<'3d' | '2d'>('3d')
  const [dentition, setDentition] = useState<Dentition>(initialDentition)
  const rows = teethRows(dentition)
  const flat = (
    <Flat rows={rows} marks={marks} selected={selected} onSelect={onSelect} />
  )
  const show3d = mode === '3d' && hasGL
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Vista" className="flex rounded-xl border border-white/10 bg-black/20 p-0.5 text-xs">
          {(['3d', '2d'] as const).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 ${mode === m ? 'bg-white/10 text-gold ring-1 ring-gold/40' : 'text-muted'}`}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Dentición" className="flex rounded-xl border border-white/10 bg-black/20 p-0.5 text-xs">
          {(['permanente', 'temporal'] as const).map((d) => (
            <button key={d} aria-pressed={dentition === d} onClick={() => setDentition(d)}
              className={`rounded-lg px-3 py-1.5 ${dentition === d ? 'bg-white/10 text-gold ring-1 ring-gold/40' : 'text-muted'}`}>
              {d === 'permanente' ? 'Permanente 11–48' : 'Temporal 51–85'}
            </button>
          ))}
        </div>
      </div>

      {show3d ? (
        <>
          <div className="relative h-[380px] overflow-hidden rounded-2xl border border-white/8 bg-[radial-gradient(closest-side,rgb(201_169_97/0.10),transparent)] md:h-[460px]"
            role="img" aria-label="Odontograma 3D. Usa la vista 2D o el selector de pieza para navegar con teclado.">
            <Fallback fallback={<div className="p-4">{flat}<p className="mt-2 text-xs text-warn">El 3D no está disponible en este equipo; se muestra la vista 2D.</p></div>}>
              <Odontogram3D upper={rows.upper} lower={rows.lower} marks={marks} selected={selected} onSelect={onSelect} />
            </Fallback>
            <p className="pointer-events-none absolute bottom-2 left-3 text-[0.7rem] text-muted">Arrastra para girar · rueda o pellizco para acercar · clic para elegir pieza</p>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-muted">
            Pieza
            <select className="field w-auto" value={selected ?? ''} onChange={(e) => e.target.value && onSelect(+e.target.value)}>
              <option value="">—</option>
              {[...rows.upper, ...rows.lower].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </>
      ) : (
        <>
          {flat}
          {!hasGL && <p className="mt-2 text-xs text-warn">WebGL no está disponible: se muestra la vista 2D.</p>}
        </>
      )}

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Leyenda">
        {LEGEND.map((l) => (
          <li key={l.c} className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-sm border border-white/40" style={{ background: l.swatch }} />
            {l.abbr} = {CONDITION_LABEL[l.c]}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Vista 2D (SVG): respaldo accesible por teclado. */
function Flat({ rows, marks, selected, onSelect }: { rows: { upper: number[]; lower: number[] }; marks: Record<number, ToothCondition>; selected?: number; onSelect: (n: number) => void }) {
  const row = (list: number[], label: string, upper: boolean) => (
    <div role="group" aria-label={label} className="flex justify-center gap-1">
      {list.map((n, i) => {
        const c = marks[n]
        return (
          <button
            key={n}
            onClick={() => onSelect(n)}
            aria-pressed={selected === n}
            aria-label={`Pieza ${n}${c ? `: ${CONDITION_LABEL[c]}` : ': sana'}`}
            className={`flex w-9 shrink-0 flex-col items-center rounded-lg py-1 ${i === list.length / 2 ? 'ml-3' : ''} ${
              selected === n ? 'bg-azure/20 ring-2 ring-azure shadow-[0_0_14px_rgb(47_123_255/0.5)]' : 'hover:bg-white/6'
            } ${upper ? '' : 'flex-col-reverse'}`}
          >
            <span className="num text-[0.68rem] text-muted">{n}</span>
            <svg viewBox="0 0 30 30" className="h-8 w-8" aria-hidden>
              <rect x="3" y="3" width="24" height="24" rx="5" fill={c === 'corona' ? '#c9a961' : '#f1e8d6'} fillOpacity={c === 'ausente' ? 0.05 : 0.92}
                stroke={c === 'ausente' ? '#b5aea3' : '#00000040'} strokeDasharray={c === 'ausente' ? '3 2' : undefined} />
              <rect x="10" y="10" width="10" height="10" rx="2" fill="none" stroke="#00000030" />
              {c === 'caries' && <circle cx="15" cy="15" r="5" fill="#7a3524" />}
              {c === 'endodoncia' && <line x1="15" y1="4" x2="15" y2="26" stroke="#2f7bff" strokeWidth="3" />}
              {c === 'ausente' && <path d="M7 7 23 23M23 7 7 23" stroke="#ff8a80" strokeWidth="2" />}
            </svg>
            <span className="num h-3 text-[0.62rem] leading-3 text-gold-soft">{c ? LEGEND.find((l) => l.c === c)!.abbr : ''}</span>
          </button>
        )
      })}
    </div>
  )
  return (
    <div className="overflow-x-auto pb-1">
      <div className="mx-auto w-max space-y-3 py-2">
        {row(rows.upper, 'Arcada superior', true)}
        <div className="border-t border-dashed border-white/10" />
        {row(rows.lower, 'Arcada inferior', false)}
      </div>
    </div>
  )
}
