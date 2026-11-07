import type { ToothCondition } from './domain/clinical'

/** Shared by the map, editor and 3D view. Colors describe chart findings. */
export const CONDITION_COLOR: Record<ToothCondition, string> = {
  sano: '#77cf9b', caries: '#f4c430', obturacion: '#57c8e5', fractura: '#ed8861',
  corona: '#dca637', endodoncia: '#6796ee', ausente: '#cfabb4', sellante: '#35bfa5',
  implante: '#a5bacb', protesis: '#b598e4', otro: '#de88c3',
}

