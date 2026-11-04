import 'server-only'
import { createClient } from '../supabase/server'
import { requireMember } from '../auth/guards'
import { todayLaPaz } from '@/lib/domain/time'

export type PatientAnalytics = {
  total: number
  sources: { key: string; total: number }[]
  ages: { key: string; total: number }[]
  treatments: { name: string; total: number }[]
  own: boolean
}

/** La función SQL agrega dentro de Postgres y respeta RLS del usuario de la sesión. */
export async function getPatientAnalytics(): Promise<PatientAnalytics> {
  const s = await requireMember()
  const { data, error } = await (await createClient()).rpc('dashboard_patient_analytics', {
    p_clinic: s.member.clinicId, p_today: todayLaPaz(),
  })
  if (error) throw new Error('No pudimos cargar las estadísticas de pacientes')
  const value = data as Omit<PatientAnalytics, 'own'> | null
  return { total: value?.total ?? 0, sources: value?.sources ?? [], ages: value?.ages ?? [], treatments: value?.treatments ?? [], own: s.member.role === 'dentist' }
}
