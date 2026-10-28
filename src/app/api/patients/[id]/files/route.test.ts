import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(), upload: vi.fn(), insert: vi.fn(), remove: vi.fn(), patient: vi.fn(), signed: vi.fn(),
}))
vi.mock('@/server/auth/session', () => ({ getSession: mocks.session }))
vi.mock('@/server/supabase/server', () => ({ createClient: async () => ({
  from: (table: string) => table === 'patients'
    ? { select: () => ({ eq: () => ({ maybeSingle: mocks.patient }) }) }
    : { insert: mocks.insert },
  storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.signed }) },
}) }))
vi.mock('@/server/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ remove: mocks.remove }) } }) }))

import { POST } from './route'

const patientId = '11111111-1111-4111-8111-111111111111'
const clinicId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const context = { params: Promise.resolve({ id: patientId }) }
function request(file = new File(['%PDF-1.7\nDocumento de prueba'], 'ficha.pdf', { type: 'application/pdf' })) {
  const form = new FormData(); form.set('file', file)
  return new Request(`http://localhost:3000/api/patients/${patientId}/files`, { method: 'POST', body: form })
}

describe('archivo clínico: permisos, validación y persistencia', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.session.mockResolvedValue({ userId, member: { clinicId, role: 'clinic_admin' } })
    mocks.patient.mockResolvedValue({ data: { id: patientId, clinic_id: clinicId } })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'file', kind: 'document', mime: 'application/pdf', size_bytes: 24, created_at: '2026-10-28' }, error: null }) }) })
    mocks.signed.mockResolvedValue({ data: { signedUrl: 'https://example.test/private-file' } })
  })
  it('guarda el original en el bucket privado y los metadatos auditables en la base', async () => {
    const response = await POST(request(), context)
    expect(response.status).toBe(201)
    expect(mocks.upload.mock.calls[0][0]).toMatch(new RegExp(`^${clinicId}/${patientId}/.+\\.pdf$`))
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ patient_id: patientId, clinic_id: clinicId, uploaded_by: userId, kind: 'document', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }))
  })
  it('rechaza recepción y caja antes de leer o subir archivos médicos', async () => {
    mocks.session.mockResolvedValue({ userId, member: { clinicId, role: 'reception' } })
    expect((await POST(request(), context)).status).toBe(403)
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('rechaza una sesión inexistente', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await POST(request(), context)).status).toBe(401)
  })
  it('rechaza pacientes de otra clínica', async () => {
    mocks.patient.mockResolvedValue({ data: { id: patientId, clinic_id: 'otra' } })
    expect((await POST(request(), context)).status).toBe(404)
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('rechaza archivos que simulan un formato permitido', async () => {
    expect((await POST(request(new File(['texto falso'], 'falso.jpg', { type: 'image/jpeg' })), context)).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('limpia el archivo recién subido si no se registran sus metadatos', async () => {
    mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: null, error: { message: 'error' } }) }) })
    expect((await POST(request(), context)).status).toBe(500)
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]])
  })
})
