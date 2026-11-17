import { journalAccess, journalFailure } from '@/server/journal'
import { createAdminClient } from '@/server/supabase/admin'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
const MAX = 3 * 1024 * 1024
const ext: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await journalAccess(request, id)
  if (access.response) return access.response
  if (Number(request.headers.get('content-length')) > MAX + 100000)
    return Response.json({ error: 'Usa un archivo de hasta 3 MB.' }, { status: 413 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const sessionId = form?.get('sessionId')
  const category = form?.get('category')
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > MAX ||
    !ext[file.type] ||
    !z.uuid().safeParse(sessionId).success ||
    !z.enum(['radiograph', 'history', 'surgical_contract', 'image', 'document', 'audio']).safeParse(category).success
  )
    return Response.json({ error: 'Selecciona un PDF, imagen o audio de hasta 3 MB y una sesión válida.' }, { status: 400 })
  const audio = file.type.startsWith('audio/')
  if (audio !== (category === 'audio')) return Response.json({ error: 'La categoría no coincide con el archivo.' }, { status: 400 })
  const { db, session, clinicId } = access
  const { data: target } = await db
    .from('clinical_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('patient_id', id)
    .eq('status', 'open')
    .maybeSingle()
  if (!target) return Response.json({ error: 'La sesión está cerrada o no pertenece a este paciente.' }, { status: 409 })
  const bytes = Buffer.from(await file.arrayBuffer())
  const valid =
    file.type === 'application/pdf'
      ? bytes.toString('ascii', 0, 5) === '%PDF-'
      : file.type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216
        : file.type === 'image/png'
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : file.type === 'image/webp'
            ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
            : file.type === 'audio/webm'
              ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
              : file.type === 'audio/ogg'
                ? bytes.toString('ascii', 0, 4) === 'OggS'
                : file.type === 'audio/wav'
                  ? bytes.toString('ascii', 0, 4) === 'RIFF'
                  : file.type === 'audio/mp4'
                    ? bytes.toString('ascii', 4, 8) === 'ftyp'
                    : bytes.toString('ascii', 0, 3) === 'ID3' || bytes[0] === 255
  if (!valid) return Response.json({ error: 'El archivo no corresponde al formato indicado.' }, { status: 400 })
  const path = `${clinicId}/${id}/${randomUUID()}.${ext[file.type]}`
  const { error: upload } = await db.storage.from('clinical').upload(path, bytes, { contentType: file.type, upsert: false })
  if (upload) return journalFailure()
  const { data, error } = await db
    .from('patient_files')
    .insert({
      clinic_id: clinicId,
      patient_id: id,
      session_id: sessionId,
      original_name: file.name.slice(0, 240),
      category,
      patient_visible: form?.get('patientVisible') === 'false' ? false : !audio,
      kind: audio
        ? 'audio'
        : category === 'radiograph'
          ? 'radiograph'
          : category === 'surgical_contract'
            ? 'consent'
            : file.type.startsWith('image/')
              ? 'photo'
              : 'document',
      storage_path: path,
      mime: file.type,
      size_bytes: file.size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      uploaded_by: session.userId,
    })
    .select('id')
    .single()
  if (error) {
    await createAdminClient().storage.from('clinical').remove([path])
    return journalFailure()
  }
  return Response.json({ file: data }, { status: 201 })
}
