// Dinero siempre en centavos enteros (BOB). El formato solo existe al mostrarlo: 'Bs. 1.200'.
export function formatBs(cents: number) {
  const neg = cents < 0
  const abs = Math.abs(Math.round(cents))
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const frac = abs % 100
  return `${neg ? '−' : ''}Bs. ${whole}${frac ? ',' + String(frac).padStart(2, '0') : ''}`
}
