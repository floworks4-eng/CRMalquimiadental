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
  INVALID_STATE: ['IMMUTABLE', 'Esta cita ya no admite check-in (está cancelada, atendida o en curso).'],
  EXPIRED_APPT: ['VALIDATION', 'La hora de esta cita ya pasó hace más de 2 horas.'],
  NOT_AVAILABLE: ['NOT_FOUND', 'Este enlace ya no está disponible. Pide uno nuevo en recepción.'],
  OUT_OF_WINDOW: ['VALIDATION', 'El check-in se abre 2 horas antes de tu cita y se cierra 2 horas después. Si ya llegaste, avisa en recepción.'],
  OUT_OF_RANGE: ['VALIDATION', 'Elige un horario con al menos 2 horas de anticipación y dentro de los próximos 60 días.'],
  CONSENT_NOT_READY: ['FORBIDDEN', 'Este servicio todavía no está habilitado. Llama a la clínica para agendar.'],
  RATE_LIMITED: ['RATE_LIMITED', 'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentar.'],
  TOO_MANY: ['CONFLICT', 'Ya tienes 3 citas pendientes con este celular. Llama a la clínica para cambiarlas.'],
  INVALID_PAYLOAD: ['VALIDATION', 'Revisa los datos del formulario.'],
  FORBIDDEN: ['FORBIDDEN', 'No tienes permiso para hacer esto.'],
  NOT_FOUND: ['NOT_FOUND', 'No encontramos lo que buscas.'],
}

/** Traduce el error de una RPC. Lo desconocido no se muestra tal cual: mensaje generico. `details` trae el campo que fallo. */
export function rpcError(message: string | undefined, code?: string, details?: string | null): ActionResult<never> {
  const key = Object.keys(MAP).find((k) => message === k || message?.startsWith(k + ':'))
  if (key === 'INVALID_PAYLOAD' && details) {
    const field = FIELD[details] ?? details
    return fail('VALIDATION', MAP.INVALID_PAYLOAD[1], { [field]: FIELD_MSG[field] ?? 'Revisa este dato.' })
  }
  if (key) return fail(...MAP[key])
  if (code === '23505') return fail('CONFLICT', 'Ya existe un registro igual.')
  return fail('INTERNAL', 'Algo salió mal. Intenta de nuevo.')
}
// Campo del formulario que corresponde a cada `detail` de INVALID_PAYLOAD.
const FIELD: Record<string, string> = { emergency_contact: 'emergencyContactName', birth_date: 'birthDate', signature_path: 'signature' }
const FIELD_MSG: Record<string, string> = {
  allergies: 'Marca «Ninguna» o indica tu alergia.', conditions: 'Marca «Ninguno» o tus antecedentes.', reason: 'Cuéntanos el motivo de tu visita.',
  emergencyContactName: 'Indica un contacto de emergencia.', consent: 'Necesitamos tu consentimiento para continuar.', signature: 'Escribe tu nombre completo como firma.',
  birthDate: 'Revisa la fecha de nacimiento.', name: 'Escribe nombre y apellido.', phone: 'Formato: +591 7XXXXXXX (8 dígitos que empiezan con 6 o 7).',
}
export const RPC_CODES = Object.keys(MAP)
