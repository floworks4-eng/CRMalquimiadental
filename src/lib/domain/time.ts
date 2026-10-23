// Fechas de negocio: se guardan en UTC y se muestran/calculan en America/La_Paz (UTC-4, sin horario de verano).
import { TZDate } from '@date-fns/tz'
import { addDays as addDaysFns, format } from 'date-fns'
import { es } from 'date-fns/locale'

export const TZ = 'America/La_Paz'

/** '2026-10-26' + '08:30' (hora de La Paz) -> ISO en UTC. */
export function zonedToUtcIso(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, TZ).getTime()).toISOString() // TZDate.toISOString() conserva el offset local
}

const local = (iso: string) => new TZDate(iso, TZ)

export const formatTime = (iso: string) => format(local(iso), 'HH:mm')
export const formatDate = (iso: string) => format(local(iso), 'dd/MM/yyyy')
export const formatDateTime = (iso: string) => format(local(iso), 'dd/MM/yyyy HH:mm')
export const localDate = (iso: string) => format(local(iso), 'yyyy-MM-dd')
export const todayLaPaz = () => format(new TZDate(Date.now(), TZ), 'yyyy-MM-dd')

/** 'Lunes 26/10/2026' a partir de 'YYYY-MM-DD'. */
export function formatDayLong(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const s = format(new Date(y, m - 1, d), 'EEEE dd/MM/yyyy', { locale: es })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  return format(addDaysFns(new Date(y, m - 1, d), n), 'yyyy-MM-dd')
}

/** [inicio, fin) del dia local en UTC. */
export const dayBoundsUtc = (date: string) => [zonedToUtcIso(date, '00:00'), zonedToUtcIso(addDays(date, 1), '00:00')] as const

export const minutesOfDay = (iso: string) => {
  const t = local(iso)
  return t.getHours() * 60 + t.getMinutes()
}
export const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
