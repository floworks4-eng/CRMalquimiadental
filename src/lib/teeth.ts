// Numeración ISO/FDI. Orden visual: lado derecho del paciente a la izquierda de la pantalla.
export type Dentition = 'permanente' | 'temporal'
export type ToothKind = 'incisivo' | 'canino' | 'premolar' | 'molar'

const range = (q: number, n: number, reverse: boolean) => {
  const r = Array.from({ length: n }, (_, i) => q * 10 + i + 1)
  return reverse ? r.reverse() : r
}
export function teethRows(d: Dentition) {
  const n = d === 'permanente' ? 8 : 5
  const [q1, q2, q3, q4] = d === 'permanente' ? [1, 2, 3, 4] : [5, 6, 7, 8]
  return {
    upper: [...range(q1, n, true), ...range(q2, n, false)],
    lower: [...range(q4, n, true), ...range(q3, n, false)],
  }
}
export function kind(n: number): ToothKind {
  const d = n % 10
  if (d <= 2) return 'incisivo'
  if (d === 3) return 'canino'
  if (n >= 50) return 'molar'
  return d <= 5 ? 'premolar' : 'molar'
}
export const isUpper = (n: number) => [1, 2, 5, 6].includes(Math.floor(n / 10))
/** Lado en pantalla: −1 = izquierda (lado derecho del paciente). */
export const side = (n: number) => ([1, 4, 5, 8].includes(Math.floor(n / 10)) ? -1 : 1)
