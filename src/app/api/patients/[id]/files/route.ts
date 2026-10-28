import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@/server/supabase/server'
import { createAdminClient } from '@/server/supabase/admin'
import { getSession } from '@/server/auth/session'
import { can } from '@/server/auth/permissions'

const UUID = /^[0-9a-f-]{36}$/i
const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }

/** Guarda una foto o PDF de una ficha en el expediente clínico inmutable. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: patientId } = await params
  if (!UUID.test(patientId)) return NextResponse.json({ error: 'Paciente no válido.' }, { status: 400 })

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 })
  const session = await getSession()
  if (!session?.member) return NextResponse.json({ error: 'Inicia sesión para subir fichas.' }, { status: 401 })
  if (!can(session.member.role, 'patients.read_clinical')) return NextResponse.json({ error: 'Tu rol no tiene acceso a las fichas clínicas.' }, { status: 403 })
  if (Number(request.headers.get('content-length')) > MAX_BYTES + 1024 * 1024) return NextResponse.json({ error: 'El archivo debe pesar como máximo 20 MB.' }, { status: 413 })
  const supabase = await createClient()
  const { data: patient } = await supabase.from('patients').select('id, clinic_id').eq('id', patientId).maybeSingle()
  if (!patient || patient.clinic_id !== session.member.clinicId) return NextResponse.json({ error: 'No encontramos ese paciente.' }, { status: 404 })

  let form: FormData
  try { form = await request.formData() }
  catch { return NextResponse.json({ error: 'El archivo no se recibió correctamente. Vuelve a seleccionarlo.' }, { status: 400 }) }
  const raw = form.get('file')
  if (!(raw instanceof File)) return NextResponse.json({ error: 'Selecciona una foto o PDF.' }, { status: 400 })
  if (!ALLOWED.has(raw.type)) return NextResponse.json({ error: 'Solo se permiten JPG, PNG, WEBP o PDF.' }, { status: 400 })
  if (raw.size <= 0 || raw.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo debe pesar como máximo 20 MB.' }, { status: 400 })

  const bytes = Buffer.from(await raw.arrayBuffer())
  const validSignature = raw.type === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : raw.type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : raw.type === 'image/webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    : bytes.toString('ascii', 0, 5) === '%PDF-'
  if (!validSignature) return NextResponse.json({ error: 'El contenido no corresponde a una foto o PDF válido.' }, { status: 400 })
  const hash = createHash('sha256').update(bytes).digest('hex')
  const path = `${session.member.clinicId}/${patientId}/${randomUUID()}.${EXTENSIONS[raw.type]}`
  const { error: uploadError } = await supabase.storage.from('clinical').upload(path, bytes, { contentType: raw.type, cacheControl: '3600', upsert: false })
  if (uploadError) return NextResponse.json({ error: 'No se pudo guardar el archivo.' }, { status: 500 })

  const { data: saved, error: fileError } = await supabase.from('patient_files').insert({
    clinic_id: session.member.clinicId, patient_id: patientId, kind: raw.type === 'application/pdf' ? 'document' : 'photo',
    storage_path: path, mime: raw.type, size_bytes: raw.size, sha256: hash, uploaded_by: session.userId,
  }).select('id, kind, mime, size_bytes, storage_path, created_at').single()
  if (fileError || !saved) {
    await createAdminClient().storage.from('clinical').remove([path])
    return NextResponse.json({ error: 'El archivo se subió, pero no se pudo registrar en la ficha.' }, { status: 500 })
  }

  const { data: signed } = await supabase.storage.from('clinical').createSignedUrl(path, 3600)
  return NextResponse.json({ file: { id: saved.id, kind: saved.kind, mime: saved.mime, sizeBytes: saved.size_bytes, createdAt: saved.created_at, url: signed?.signedUrl ?? null } }, { status: 201 })
}
