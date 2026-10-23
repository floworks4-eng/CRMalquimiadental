export type ErrorCode =
  | 'UNAUTHENTICATED' | 'MFA_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT'
  | 'SLOT_TAKEN' | 'STOCK_SHORTAGE' | 'IMMUTABLE' | 'RATE_LIMITED' | 'INTERNAL'

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fields?: Record<string, string> } }

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data })
export const fail = (code: ErrorCode, message: string, fields?: Record<string, string>): ActionResult<never> => ({
  ok: false,
  error: { code, message, fields },
})

/** Zod -> errores por campo para el formulario. */
export function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const i of issues) out[String(i.path[0] ?? '_')] ??= i.message
  return out
}
