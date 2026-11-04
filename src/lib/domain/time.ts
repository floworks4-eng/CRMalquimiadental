// Fechas de negocio: se guardan en UTC y se muestran/calculan en America/La_Paz (UTC-4, sin horario de verano).
import { TZDate } from '@date-fns/tz'

export const TZ = 'America/La_Paz'

/** '2026-10-26' + '08:30' (hora de La Paz) -> ISO en UTC. */
export function zonedToUtcIso(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, TZ).getTime()).toISOString() // TZDate.toISOString() conserva el offset local
}

// Reuse the browser/server's Intl formatters instead of shipping a formatting
// library and its locale to every view. IANA timezone conversion stays intact.
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dateFormatter = new Intl.DateTimeFormat('es-BO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const weekdayFormatter = new Intl.DateTimeFormat('es', { timeZone: 'UTC', weekday: 'long' })

export const formatTime = (iso: string) => timeFormatter.format(new Date(iso))
export const formatDate = (iso: string) => dateFormatter.format(new Date(iso))
export const formatDateTime = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`
export const localDate = (iso: string) => {
  const parts = dateFormatter.formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export const todayLaPaz = () => localDate(new Date().toISOString())

/** 'Lunes 26/10/2026' a partir de 'YYYY-MM-DD'. */
export function formatDayLong(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = weekdayFormatter.format(new Date(Date.UTC(y, m - 1, d)))
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** [inicio, fin) del dia local en UTC. */
export const dayBoundsUtc = (date: string) => [zonedToUtcIso(date, '00:00'), zonedToUtcIso(addDays(date, 1), '00:00')] as const

export const minutesOfDay = (iso: string) => {
  const time = formatTime(iso)
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}
export const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
