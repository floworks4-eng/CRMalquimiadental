import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { publicEnv } from '../env'

/**
 * service_role: salta RLS. Solo para tareas administrativas del servidor (invitaciones). Quien llama debe
 * haber verificado permiso antes. Nunca se importa desde un componente cliente (server-only lo impide).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createClient(publicEnv().url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
