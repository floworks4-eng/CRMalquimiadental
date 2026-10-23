import { fail, type ActionResult } from './errors'

// Codigos que lanzan las funciones de Postgres (RAISE EXCEPTION 'CODIGO') -> mensaje en espanol para el usuario.
const MAP: Record<string, [Parameters<typeof fail>[0], string]> = {
  SLOT_TAKEN: ['SLOT_TAKEN', 'Ese horario acaba de ocuparse.'],
  CLOSED: ['VALIDATION', 'La clínica no atiende ese día.'],
  HOLIDAY: ['VALIDATION', 'Ese día es feriado.'],
  OUTSIDE_HOURS: ['VALIDATION', 'Fuera del horario de atención.'],
  NO_SCHEDULE: ['VALIDATION', 'El odontólogo no atiende en ese horario.'],
  TIME_OFF: ['VALIDATION', 'El odontólogo está ausente en ese horario.'],
  PAST: ['VALIDATION', 'No se puede agendar en el pasado.'],
  BAD_GRANULARITY: ['VALIDATION', 'La hora debe ser múltiplo de 15 minutos.'],
  BAD_DURATION: ['VALIDATION', 'La duración debe ser de 15 a 240 minutos, en múltiplos de 15.'],
  BAD_RANGE: ['VALIDATION', 'El rango de fechas es demasiado grande.'],
  INVALID_REFERENCE: ['VALIDATION', 'El gabinete o el odontólogo ya no está disponible.'],
  REASON_REQUIRED: ['VALIDATION', 'Escribe el motivo (mínimo 3 letras).'],
  TOO_EARLY: ['VALIDATION', 'Solo se marca «no asistió» 15 minutos después de la hora de la cita.'],
  NOT_RESCHEDULABLE: ['IMMUTABLE', 'Solo se pueden mover citas programadas o confirmadas.'],
  INVALID_TRANSITION: ['IMMUTABLE', 'Ese cambio de estado no es válido para esta cita.'],
  CONFLICT: ['CONFLICT', 'Alguien más modificó esta cita. Recarga para ver los cambios.'],
  FORBIDDEN: ['FORBIDDEN', 'No tienes permiso para hacer esto.'],
  NOT_FOUND: ['NOT_FOUND', 'No encontramos lo que buscas.'],
}

/** Traduce el error de una RPC. Lo desconocido no se muestra tal cual: mensaje generico. */
export function rpcError(message: string | undefined, code?: string): ActionResult<never> {
  const key = Object.keys(MAP).find((k) => message === k || message?.startsWith(k + ':'))
  if (key) return fail(...MAP[key])
  if (code === '23505') return fail('CONFLICT', 'Ya existe un registro igual.')
  return fail('INTERNAL', 'Algo salió mal. Intenta de nuevo.')
}
export const RPC_CODES = Object.keys(MAP)
