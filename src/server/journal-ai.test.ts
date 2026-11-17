import { beforeEach, afterEach, it, expect, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ access: vi.fn(), download: vi.fn(), single: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('./journal', () => ({ journalAccess: mocks.access }))
import { processJournalFile } from './journal-ai'
const id = '11111111-1111-4111-8111-111111111111'
function request(consent = true) {
  return new Request('https://example.test/api', { method: 'POST', body: JSON.stringify({ fileId: id, consent }) })
}
beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'test-not-a-real-key')
  vi.stubGlobal('fetch', vi.fn())
  mocks.access.mockResolvedValue({
    clinicId: id,
    db: {
      rpc: async () => ({ error: null }),
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: mocks.single }) }) }) }),
      storage: { from: () => ({ download: mocks.download }) },
    },
  })
  mocks.single.mockResolvedValue({
    data: { storage_path: 'private/file', mime: 'audio/webm', category: 'audio', original_name: 'nota.webm' },
  })
  mocks.download.mockResolvedValue({ data: new Blob(['audio'], { type: 'audio/webm' }) })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it('no envía datos a IA sin autorización explícita', async () => {
  expect((await processJournalFile(request(false), id, 'transcribe')).status).toBe(400)
  expect(fetch).not.toHaveBeenCalled()
})
it('informa falta de configuración sin simular transcripción', async () => {
  vi.stubEnv('OPENAI_API_KEY', '')
  expect((await processJournalFile(request(), id, 'transcribe')).status).toBe(503)
  expect(fetch).not.toHaveBeenCalled()
})
it('una radiografía PDF no se envía para diagnóstico automático', async () => {
  mocks.single.mockResolvedValue({ data: { mime: 'application/pdf', category: 'radiograph' } })
  expect((await processJournalFile(request(), id, 'extract')).status).toBe(422)
  expect(fetch).not.toHaveBeenCalled()
})
it('la transcripción de Whisper vuelve como borrador y no se inserta en el historial', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ text: 'Nota dictada para revisión.' }))
  const response = await processJournalFile(request(), id, 'transcribe')
  expect(await response.json()).toEqual({ text: 'Nota dictada para revisión.', draft: true })
  const body = vi.mocked(fetch).mock.calls[0][1]?.body as FormData
  expect(body.get('model')).toBe('whisper-1')
})
it('deniega el acceso antes de consultar el archivo', async () => {
  mocks.access.mockResolvedValue({ response: Response.json({ error: 'Sin acceso' }, { status: 403 }) })
  expect((await processJournalFile(request(), id, 'transcribe')).status).toBe(403)
  expect(fetch).not.toHaveBeenCalled()
})
