import { journalAccess, journalFailure } from '@/server/journal'
import { readPages } from '@/server/queries/read-pages'
import { buildJournalPdf, type ExportSession } from '@/server/journal-pdf'
import { z } from 'zod'
export const maxDuration = 60
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await journalAccess(request, id)
  if (access.response) return access.response
  const selected = new URL(request.url).searchParams.get('sessionId')
  if (selected && !z.uuid().safeParse(selected).success) return Response.json({ error: 'Sesión inválida.' }, { status: 400 })
  const { db } = access
  try {
    const [{ data: patient }, sessions, messages, files, encounters] = await Promise.all([
      db.from('patients').select('full_name').eq('id', id).single(),
      readPages<Record<string, unknown>>(
        (a, b) =>
          db
            .from('clinical_sessions')
            .select('id,title,session_date,encounter_id')
            .eq('patient_id', id)
            .order('session_date')
            .order('id')
            .range(a, b),
        'sessions',
      ),
      readPages<Record<string, unknown>>(
        (a, b) =>
          db
            .from('clinical_messages')
            .select('session_id,body,created_at,author:profiles!clinical_messages_created_by_fkey(full_name)')
            .eq('patient_id', id)
            .eq('patient_visible', true)
            .order('created_at')
            .order('id')
            .range(a, b),
        'notes',
      ),
      readPages<Record<string, unknown>>(
        (a, b) =>
          db
            .from('patient_files')
            .select('session_id,original_name,storage_path,mime,size_bytes')
            .eq('patient_id', id)
            .eq('patient_visible', true)
            .neq('kind', 'audio')
            .order('created_at')
            .order('id')
            .range(a, b),
        'files',
      ),
      readPages<Record<string, unknown>>(
        (a, b) =>
          db
            .from('encounters')
            .select('id,chief_complaint,notes,started_at,dentist:profiles!encounters_dentist_id_fkey(full_name)')
            .eq('patient_id', id)
            .eq('status', 'finished')
            .order('started_at')
            .order('id')
            .range(a, b),
        'encounters',
      ),
    ])
    const legacy = encounters
      .filter((e) => !sessions.some((s) => s.encounter_id === e.id))
      .map((e) => ({
        id: e.id,
        title: e.chief_complaint ?? 'Atención anterior',
        session_date: new Date(String(e.started_at)).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }),
        legacy: true,
        notes: e.notes,
        author: (e.dentist as { full_name: string } | null)?.full_name ?? 'Equipo clínico',
      }))
    const available = [
      ...sessions,
      ...legacy,
      ...(!selected && files.some((f) => !f.session_id)
        ? [{ id: 'legacy-files', title: 'Documentos previos sin sesión asignada', session_date: 'Archivo previo' }]
        : []),
    ]
    const chosen = available.filter((s) => !selected || s.id === selected)
    if (selected && !chosen.length) return Response.json({ error: 'Sesión no encontrada.' }, { status: 404 })
    const exportIds = new Set(chosen.map((s) => s.id))
    if (
      files
        .filter((f) => exportIds.has(f.session_id) || (exportIds.has('legacy-files') && !f.session_id))
        .reduce((sum, f) => sum + Number(f.size_bytes), 0) >
      30 * 1024 * 1024
    )
      return Response.json({ error: 'El conjunto supera 30 MB. Exporta una sesión por vez.' }, { status: 413 })
    const out: ExportSession[] = []
    for (const s of chosen) {
      const attached = files.filter((f) => (s.id === 'legacy-files' ? !f.session_id : f.session_id === s.id))
      const loaded: ExportSession['files'] = []
      if (attached.reduce((sum, f) => sum + Number(f.size_bytes), 0) > 30 * 1024 * 1024)
        return Response.json({ error: 'La sesión supera 30 MB de adjuntos. Exporta sus originales por separado.' }, { status: 413 })
      for (const f of attached) {
        const { data, error } = await db.storage.from('clinical').download(String(f.storage_path))
        if (error || !data) throw new Error('file unavailable')
        loaded.push({ name: String(f.original_name ?? 'Documento'), mime: String(f.mime), bytes: new Uint8Array(await data.arrayBuffer()) })
      }
      out.push({
        id: String(s.id),
        title: String(s.title),
        date: String(s.session_date),
        notes: ('legacy' in s && s.notes ? [{ body: String(s.notes), author: String(s.author), date: String(s.session_date) }] : []).concat(
          messages
            .filter((m) => m.session_id === s.id)
            .map((m) => ({
              body: String(m.body),
              author: (m.author as { full_name: string } | null)?.full_name ?? 'Equipo clínico',
              date: new Date(String(m.created_at)).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }),
            })),
        ),
        files: loaded,
      })
    }
    const bytes = await buildJournalPdf(patient?.full_name ?? 'Paciente', out)
    const { error: auditError } = await db.rpc('log_event', {
      p_clinic: access.clinicId,
      p_action: 'clinical_history.export',
      p_entity_type: 'patients',
      p_entity_id: id,
      p_patient: id,
      p_meta: { sessions: out.map((s) => s.id), format: 'pdf' },
    })
    if (auditError) return journalFailure()
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="historial-clinico.pdf"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return journalFailure()
  }
}
