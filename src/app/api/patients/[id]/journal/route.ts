import { journalAccess, journalFailure } from '@/server/journal'
import { readPages } from '@/server/queries/read-pages'
import { z } from 'zod'
import type { ClinicalSession, ClinicalMessage, JournalFile, FileCategory } from '@/lib/domain/journal'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, { params }: Context) {
  const { id } = await params
  const access = await journalAccess(request, id)
  if (access.response) return access.response
  const { db } = access
  try {
    const [sessions, messages, files] = await Promise.all([
      readPages<Record<string, unknown>>(
        (a, b) =>
          db.from('clinical_sessions').select('*').eq('patient_id', id).order('session_date', { ascending: false }).order('id').range(a, b),
        'sessions',
      ),
      readPages<Record<string, unknown>>(
        (a, b) =>
          db
            .from('clinical_messages')
            .select('id,session_id,body,patient_visible,created_at,author:profiles!clinical_messages_created_by_fkey(full_name)')
            .eq('patient_id', id)
            .order('created_at')
            .order('id')
            .range(a, b),
        'messages',
      ),
      readPages<Record<string, unknown>>(
        (a, b) =>
          db
            .from('patient_files')
            .select('id,session_id,original_name,category,mime,size_bytes,storage_path,patient_visible,created_at')
            .eq('patient_id', id)
            .order('created_at')
            .order('id')
            .range(a, b),
        'files',
      ),
    ])
    const paths = files.map((f) => String(f.storage_path))
    const urls = new Map<string, string>()
    for (let i = 0; i < paths.length; i += 100) {
      const { data } = await db.storage.from('clinical').createSignedUrls(paths.slice(i, i + 100), 3600)
      for (const f of data ?? []) if (f.path && f.signedUrl && !f.error) urls.set(f.path, f.signedUrl)
    }
    return Response.json(
      {
        sessions: sessions.map(
          (s) =>
            ({
              id: s.id,
              title: s.title,
              sessionDate: s.session_date,
              status: s.status,
              encounterId: s.encounter_id,
              createdAt: s.created_at,
            }) as ClinicalSession,
        ),
        messages: messages.map(
          (m) =>
            ({
              id: m.id,
              sessionId: m.session_id,
              body: m.body,
              patientVisible: m.patient_visible,
              createdAt: m.created_at,
              author: (m.author as { full_name: string } | null)?.full_name ?? 'Equipo clínico',
            }) as ClinicalMessage,
        ),
        files: files.map(
          (f) =>
            ({
              id: f.id,
              sessionId: f.session_id,
              name: f.original_name ?? 'Documento del historial',
              category: f.category as FileCategory,
              mime: f.mime,
              sizeBytes: Number(f.size_bytes),
              url: urls.get(String(f.storage_path)) ?? null,
              patientVisible: f.patient_visible,
              createdAt: f.created_at,
            }) as JournalFile,
        ),
        aiEnabled: !!process.env.OPENAI_API_KEY,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return journalFailure()
  }
}
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_session'), title: z.string().trim().min(1).max(160), sessionDate: z.iso.date() }),
  z.object({
    action: z.literal('message'),
    sessionId: z.uuid(),
    sourceFileId: z.uuid().optional(),
    body: z.string().trim().min(1).max(12000),
    patientVisible: z.boolean().default(false),
  }),
  z.object({ action: z.literal('close_session'), sessionId: z.uuid() }),
  z.object({ action: z.literal('publish_message'), messageId: z.uuid() }),
])
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const access = await journalAccess(request, id)
  if (access.response) return access.response
  const p = input.safeParse(await request.json().catch(() => null))
  if (!p.success) return Response.json({ error: 'Revisa los datos de la sesión.' }, { status: 400 })
  const { db, session, clinicId } = access
  const d = p.data
  if (d.action === 'create_session') {
    const { data, error } = await db
      .from('clinical_sessions')
      .insert({ clinic_id: clinicId, patient_id: id, title: d.title, session_date: d.sessionDate, created_by: session.userId })
      .select('id')
      .single()
    return error ? journalFailure() : Response.json({ session: data }, { status: 201 })
  }
  if (d.action === 'message') {
    const { data, error } = await db
      .from('clinical_messages')
      .insert({
        clinic_id: clinicId,
        patient_id: id,
        session_id: d.sessionId,
        body: d.body,
        source_file_id: d.sourceFileId ?? null,
        patient_visible: d.patientVisible,
        created_by: session.userId,
      })
      .select('id')
      .single()
    return error
      ? Response.json({ error: 'No se pudo guardar. Comprueba que la sesión sigue abierta.' }, { status: 409 })
      : Response.json({ message: data }, { status: 201 })
  }
  const q =
    d.action === 'close_session'
      ? db.from('clinical_sessions').update({ status: 'closed' }).eq('id', d.sessionId).eq('patient_id', id).eq('status', 'open')
      : db.from('clinical_messages').update({ patient_visible: true }).eq('id', d.messageId).eq('patient_id', id)
  const { data, error } = await q.select('id')
  return error || !data?.length
    ? Response.json({ error: 'No se pudo actualizar el registro.' }, { status: 409 })
    : Response.json({ ok: true })
}
