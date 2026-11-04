import { describe, expect, it, vi } from 'vitest'
import { format } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import {
  addDays,
  dayBoundsUtc,
  formatDate,
  formatDateTime,
  formatDayLong,
  formatTime,
  localDate,
  minutesOfDay,
  todayLaPaz,
  TZ,
  zonedToUtcIso,
} from './time'

describe('Formatos de fechas de Bolivia sin la librería en el cliente', () => {
  it('conserva los formatos anteriores para fechas, offsets y cambios de día/mes/año', () => {
    for (const iso of [
      '1990-01-01',
      '2024-02-29T03:59:59Z',
      '2024-02-29T04:00:00Z',
      '2026-12-31T23:59:00-04:00',
      '2027-01-01T04:00:00Z',
      '2030-06-15T12:45:00+05:30',
    ]) {
      const reference = new TZDate(iso, TZ)
      expect(formatDate(iso)).toBe(format(reference, 'dd/MM/yyyy'))
      expect(formatTime(iso)).toBe(format(reference, 'HH:mm'))
      expect(formatDateTime(iso)).toBe(format(reference, 'dd/MM/yyyy HH:mm'))
      expect(localDate(iso)).toBe(format(reference, 'yyyy-MM-dd'))
      expect(minutesOfDay(iso)).toBe(reference.getHours() * 60 + reference.getMinutes())
    }
  })

  it('preserva límites UTC y suma de días, incluidos años bisiestos', () => {
    expect(formatTime('2026-11-03T04:00:00Z')).toBe('00:00')
    expect(dayBoundsUtc('2026-12-31')).toEqual(['2026-12-31T04:00:00.000Z', '2027-01-01T04:00:00.000Z'])
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(addDays('2026-12-31', 42)).toBe('2027-02-11')
    expect(formatDayLong('2026-11-03')).toBe('Martes 03/11/2026')
    expect(formatDayLong('2026-11-04')).toBe('Miércoles 04/11/2026')
    expect(zonedToUtcIso('2026-11-03', '23:45')).toBe('2026-11-04T03:45:00.000Z')
  })

  it('calcula hoy en La Paz aunque en UTC ya sea el día siguiente', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-04T02:30:00Z'))
      expect(todayLaPaz()).toBe('2026-11-03')
    } finally {
      vi.useRealTimers()
    }
  })
})
