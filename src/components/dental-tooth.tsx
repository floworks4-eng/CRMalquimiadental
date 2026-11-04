import type { ToothCondition } from '@/lib/domain/clinical'
import { isUpper, kind, type ToothKind } from '@/lib/teeth'

export type DentalToothProps = {
  tooth?: number
  condition?: ToothCondition
  selected?: boolean
  upper?: boolean
  className?: string
}

// Vista vestibular esquemática: borde incisal / cúspides y raíces por familia.
// Coordenadas compartidas para que cada hallazgo siga la anatomía al invertirla.
const ANATOMY: Record<ToothKind, { crown: string; roots: string; detail: string }> = {
  incisivo: {
    crown: 'M21 8 Q32 6 43 8 L42 24 Q41 30 38 33 Q32 35 26 33 Q23 30 22 24 Z',
    roots: 'M26 32 Q27 46 30 62 Q32 69 34 62 Q37 46 38 32 Z',
    detail: 'M25 12 Q32 10 39 12 M27 17 L28 26 M36 17 L36 26',
  },
  canino: {
    crown: 'M20 18 Q21 13 27 10 L32 5 L37 10 Q43 13 44 18 L41 28 Q39 34 32 34 Q25 34 23 28 Z',
    roots: 'M26 32 Q27 49 31 66 Q33 70 35 62 Q38 45 38 32 Z',
    detail: 'M32 12 L32 27 M25 19 L28 15 M36 15 L39 19',
  },
  premolar: {
    crown: 'M16 17 Q16 7 23 8 Q28 9 32 12 Q36 9 41 8 Q48 7 48 17 L45 28 Q43 34 32 34 Q21 34 19 28 Z',
    roots: 'M22 31 Q21 47 24 61 Q26 66 28 59 L32 43 L36 59 Q38 66 40 61 Q43 47 42 31 Z',
    detail: 'M23 15 L30 20 Q32 22 34 20 L41 15 M32 22 L32 28',
  },
  molar: {
    crown: 'M10 17 Q10 8 17 8 Q22 7 26 11 Q32 6 38 11 Q42 7 47 8 Q54 8 54 17 L50 28 Q47 35 32 34 Q17 35 14 28 Z',
    roots: 'M17 31 Q14 45 17 61 Q19 67 23 59 L30 42 Q32 38 34 42 L41 59 Q45 67 47 61 Q50 45 47 31 Z',
    detail: 'M18 16 L25 20 L32 16 L39 20 L46 16 M25 20 L26 28 M39 20 L38 28',
  },
}

/** SVG decorativo reutilizable; el botón o mosaico padre aporta el nombre accesible. */
export function DentalTooth({ tooth, condition, selected = false, upper, className }: DentalToothProps) {
  const toothKind = tooth === undefined ? 'molar' : kind(tooth)
  const anatomy = ANATOMY[toothKind]
  const upperArch = upper ?? (tooth === undefined ? false : isUpper(tooth))
  const absent = condition === 'ausente'
  const implant = condition === 'implante'
  const outline = selected ? '#d7b56d' : '#a69f92'
  const crownFill = condition === 'corona' ? '#e3b64e' : condition === 'protesis' ? '#c6b7ec' : '#fff5df'

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 72"
      width="48"
      height="52"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-kind={toothKind}
      data-condition={condition}
      data-upper={upperArch}
    >
      <g transform={upperArch ? 'translate(0 72) scale(1 -1)' : undefined} strokeLinecap="round" strokeLinejoin="round">
        {!implant && (
          <g
            fill={absent ? 'none' : '#d9cbb0'}
            stroke={outline}
            strokeWidth={selected ? 2 : 1.5}
            strokeDasharray={absent ? '3 4' : undefined}
          >
            {upperArch && toothKind === 'molar' && <path d="M26 32 Q27 49 30 58 Q32 63 34 58 Q37 49 38 32 Z" />}
            <path d={anatomy.roots} />
          </g>
        )}
        {implant && (
          <g stroke="#849bad" strokeWidth="2">
            <path d="M25 32 H39 L37 57 L32 65 L27 57 Z" fill="#c1d0da" />
            <path d="M24 38 L40 35 M25 44 L39 41 M26 50 L38 47 M27 56 L37 53 M29 61 L35 59" />
            <path d="M28 29 V34 M36 29 V34" strokeWidth="3" />
          </g>
        )}
        <path
          d={anatomy.crown}
          fill={absent ? 'none' : crownFill}
          stroke={outline}
          strokeWidth={selected ? 2 : 1.5}
          strokeDasharray={absent ? '3 4' : undefined}
        />
        {!absent && (
          <>
            <path d={anatomy.detail} fill="none" stroke={condition === 'corona' ? '#94651c' : '#b5a78f'} strokeWidth="1.5" />
            <path
              d={toothKind === 'incisivo' || toothKind === 'canino' ? 'M25 21 L26 27' : 'M18 22 L20 27'}
              stroke="#ffffff"
              strokeOpacity="0.8"
              strokeWidth="2.5"
            />
          </>
        )}
        {condition === 'caries' && (
          <path
            d="M27 14 Q31 11 34 15 Q40 14 39 20 Q41 25 35 27 Q31 24 27 26 Q23 23 26 20 Q23 17 27 14 Z"
            fill="#893c2f"
            stroke="#58261f"
            strokeWidth="1.5"
          />
        )}
        {condition === 'fractura' && (
          <path d="M34 9 L28 18 L36 21 L29 29 L34 35 M36 21 L42 19" fill="none" stroke="#bd4e32" strokeWidth="3" />
        )}
        {condition === 'endodoncia' && (
          <g fill="none" stroke="#2674cb" strokeWidth="3">
            <path d="M32 17 V33" />
            <path d={toothKind === 'molar' || toothKind === 'premolar' ? 'M32 31 Q25 38 22 55 M32 31 Q39 38 42 55' : 'M32 31 V59'} />
            <path d="M28 17 Q32 13 36 17" />
          </g>
        )}
        {condition === 'sellante' && (
          <path d="M24 17 Q28 24 32 18 Q36 24 40 17 L38 26 Q32 30 26 26 Z" fill="#39ab7c" stroke="#126b4b" strokeWidth="1.5" />
        )}
        {condition === 'obturacion' && <path d="M25 15 H39 V27 H25 Z M28 19 H36 M28 23 H36" fill="#72c9dc" stroke="#246c8b" strokeWidth="1.5" />}
        {condition === 'sano' && <path d="M22 21 L29 28 L42 14" fill="none" stroke="#258457" strokeWidth="3" />}
        {condition === 'protesis' && (
          <g fill="none" stroke="#7851b0" strokeWidth="2.5">
            <path d="M20 28 Q32 35 44 28 M20 28 L17 23 M44 28 L47 23" />
            <path d="M28 12 L28 25 M36 12 L36 25" strokeDasharray="2 3" />
          </g>
        )}
        {absent && <path d="M19 21 L45 49 M45 21 L19 49" stroke="#ee9b96" strokeWidth="3.5" />}
        {condition === 'otro' && (
          <g>
            <circle cx="32" cy="21" r="10" fill="#73549e" stroke="#d4c0ee" strokeWidth="1.5" />
            <path d="M32 15 V27 M27 18 L37 24 M27 24 L37 18" stroke="#fff4ff" strokeWidth="2" />
          </g>
        )}
      </g>
    </svg>
  )
}
