// Telefonos: se aceptan espacios/guiones/+/00 al escribir y se normalizan a E.164 (+591 + 8 digitos que empiezan en 6 o 7).
export const BO_MOBILE = /^\+591[67]\d{7}$/
// Compatibilidad con las pantallas de la demo.
export const PHONE_RE = /^\+?591[67]\d{7}$/

export function normalizeBoPhone(raw: string): string | null {
  let d = raw.replace(/[\s().-]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  if (/^[67]\d{7}$/.test(d)) d = '591' + d
  const e164 = '+' + d
  return BO_MOBILE.test(e164) ? e164 : null
}

/** '+59171234567' -> '+591 7123 4567' */
export const formatPhone = (e164: string | null) => (e164 && BO_MOBILE.test(e164) ? `+591 ${e164.slice(4, 8)} ${e164.slice(8)}` : (e164 ?? '—'))
