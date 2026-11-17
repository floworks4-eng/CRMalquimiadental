import 'server-only'
import { createClient } from './supabase/server'
import { getSession } from './auth/session'
import { can } from './auth/permissions'
import { z } from 'zod'

export async function journalAccess(request: Request, patientId: string) {
  if (!z.uuid().safeParse(patientId).success) return { response: Response.json({ error: 'Paciente no válido.' }, { status: 400 }) } as const
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin)
    return { response: Response.json({ error: 'Origen no permitido.' }, { status: 403 }) } as const
  const session = await getSession()
  if (!session?.member) return { response: Response.json({ error: 'Inicia sesión.' }, { status: 401 }) } as const
  if (!can(session.member.role, 'patients.read_clinical'))
    return { response: Response.json({ error: 'Sin acceso clínico.' }, { status: 403 }) } as const
  const db = await createClient()
  const { data: patient, error } = await db.from('patients').select('id,clinic_id').eq('id', patientId).maybeSingle()
  if (error || !patient || patient.clinic_id !== session.member.clinicId)
    return { response: Response.json({ error: 'Paciente no encontrado.' }, { status: 404 }) } as const
  return { db, session, clinicId: session.member.clinicId } as const
}
export function journalFailure() {
  return Response.json(
    { error: 'No pudimos guardar o cargar el historial. Revisa la conexión y la configuración de sesiones.' },
    { status: 500 },
  )
}
