import { journalAccess, journalFailure } from '@/server/journal'
import { clinicalFieldsSchema } from '@/lib/domain/clinical-record'
import { z } from 'zod'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, { params }: Context) {
  const { id } = await params,
    access = await journalAccess(request, id)
  if (access.response) return access.response
  const { data, error } = await access.db
    .from('clinical_assessments')
    .select('id,fields,patient_visible,created_at,author:profiles!clinical_assessments_created_by_fkey(full_name)')
    .eq('patient_id', id)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(1)
    .maybeSingle()
  if (error) return journalFailure()
  return Response.json(
    {
      assessment: data
        ? {
            id: data.id,
            fields: data.fields,
            createdAt: data.created_at,
            patientVisible: data.patient_visible,
            author: (data.author as unknown as { full_name: string } | null)?.full_name ?? 'Equipo clínico',
          }
        : null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
export async function POST(request: Request, { params }: Context) {
  const { id } = await params,
    access = await journalAccess(request, id)
  if (access.response) return access.response
  const p = z.object({ fields: clinicalFieldsSchema, patientVisible: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!p.success) return Response.json({ error: 'Completa al menos un campo clínico y revisa su extensión.' }, { status: 400 })
  const { error } = await access.db.from('clinical_assessments').insert({
    clinic_id: access.clinicId,
    patient_id: id,
    fields: p.data.fields,
    patient_visible: p.data.patientVisible,
    created_by: access.session.userId,
  })
  return error ? journalFailure() : Response.json({ ok: true }, { status: 201 })
}
