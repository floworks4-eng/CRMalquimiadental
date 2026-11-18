import { beforeEach, it, expect, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ access: vi.fn(), pdf: vi.fn(), pages: vi.fn(), download: vi.fn() }))
vi.mock('@/server/journal', () => ({
  journalAccess: mocks.access,
  journalFailure: () => Response.json({ error: 'fallo' }, { status: 500 }),
}))
vi.mock('@/server/queries/read-pages', () => ({ readPages: mocks.pages }))
vi.mock('@/server/clinical-report', () => ({ clinicalReportContext: async () => ({}) }))
vi.mock('@/server/journal-pdf', () => ({ buildJournalPdf: mocks.pdf }))
import { GET } from './route'
const id = '11111111-1111-4111-8111-111111111111',
  sid = '22222222-2222-4222-8222-222222222222'
const operations: unknown[][] = []
function query(table: string) {
  const q = {
    select: () => q,
    eq: (...args: unknown[]) => {
      operations.push([table, ...args])
      return q
    },
    neq: () => q,
    order: () => q,
    range: () => q,
    single: async () => ({ data: { full_name: 'Paciente sintético' } }),
  }
  return q
}
beforeEach(() => {
  vi.clearAllMocks()
  operations.length = 0
  mocks.access.mockResolvedValue({
    clinicId: id,
    db: { from: query, rpc: async () => ({ error: null }), storage: { from: () => ({ download: mocks.download }) } },
  })
  mocks.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
  let n = 0
  mocks.pages.mockImplementation(async (fn: (a: number, b: number) => unknown) => {
    fn(0, 499)
    n++
    return n === 1
      ? [{ id: sid, title: 'Control', session_date: '2026-11-16' }]
      : n === 2
        ? [{ session_id: sid, body: 'Nota publicada', created_at: '2026-11-16T12:00:00Z' }]
        : []
  })
})
it('exporta solo mensajes publicados y excluye audios privados desde la consulta a la base', async () => {
  const result = await GET(new Request('https://example.test/api'), { params: Promise.resolve({ id }) })
  expect(result.headers.get('content-type')).toBe('application/pdf')
  expect(operations).toContainEqual(['clinical_messages', 'patient_visible', true])
  expect(operations).toContainEqual(['patient_files', 'patient_visible', true])
  expect(mocks.pdf.mock.calls[0][1][0].notes[0].body).toBe('Nota publicada')
})
it('no exporta ni consulta mensajes si no hay acceso clínico', async () => {
  mocks.access.mockResolvedValue({ response: Response.json({ error: 'Sin acceso' }, { status: 403 }) })
  const result = await GET(new Request('https://example.test/api'), { params: Promise.resolve({ id }) })
  expect(result.status).toBe(403)
  expect(mocks.pdf).not.toHaveBeenCalled()
  expect(mocks.pages).not.toHaveBeenCalled()
})
it('intercala cronológicamente atenciones antiguas con sesiones nuevas sin duplicar una atención ya enlazada', async () => {
  mocks.pages.mockReset()
  mocks.pages
    .mockResolvedValueOnce([{ id: sid, title: 'Actual', session_date: '2026-11-18', encounter_id: 'linked' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      { id: 'older', chief_complaint: 'Control anterior', notes: 'Evaluación previa', started_at: '2026-10-01T12:00:00Z' },
      { id: 'linked', started_at: '2026-11-18T12:00:00Z' },
    ])
  const result = await GET(new Request('https://example.test/api'), { params: Promise.resolve({ id }) })
  expect(result.status).toBe(200)
  expect(mocks.pdf.mock.calls[0][1].map((session: { id: string }) => session.id)).toEqual(['older', sid])
})
