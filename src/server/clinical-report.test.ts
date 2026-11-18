import { beforeEach, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
vi.mock('server-only', () => ({}))
vi.mock('./queries/clinical', () => ({ findingsOf: async () => [], toothStatesOf: async () => [] }))
vi.mock('./queries/read-pages', () => ({ readPages: async () => [] }))
import { clinicalReportContext } from './clinical-report'
let visible = false
const filters: unknown[][] = []
const db = {
  from(table: string) {
    const response = {
      data:
        table === 'patients'
          ? { id: 'patient' }
          : table === 'clinics'
            ? { name: 'Clínica' }
            : table === 'clinical_assessments'
              ? {
                  patient_visible: visible,
                  fields: { diagnosis: 'Evaluación reservada' },
                  created_at: '2026-11-18',
                  author: { full_name: 'Dra. Pérez' },
                }
              : null,
      error: null,
    }
    const q = {
      select: () => q,
      eq: (...args: unknown[]) => {
        filters.push([table, ...args])
        return q
      },
      order: () => q,
      limit: () => q,
      single: async () => response,
      maybeSingle: async () => response,
    }
    return q
  },
} as unknown as SupabaseClient
beforeEach(() => {
  visible = false
  filters.length = 0
})
it('una revisión privada no reaparece como evaluación publicada ni se sustituye por una versión pública anterior', async () => {
  expect((await clinicalReportContext(db, 'patient', 'clinic')).assessment).toBeNull()
  expect(filters).not.toContainEqual(['clinical_assessments', 'patient_visible', true])
})
it('una revisión publicada conserva autor, fecha y texto para el informe', async () => {
  visible = true
  expect((await clinicalReportContext(db, 'patient', 'clinic')).assessment).toEqual({
    fields: { diagnosis: 'Evaluación reservada' },
    createdAt: '2026-11-18',
    author: 'Dra. Pérez',
  })
})
