// Variables de entorno. Las publicas pueden faltar en local (la demo corre sin ellas); las de servidor, no.
export function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (ver .env.example)')
  return { url, anonKey, siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000' }
}

export const hasSupabaseEnv = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** Las paginas publicas (check-in y reservas) necesitan ademas la clave de servidor. */
export const hasPublicBackend = () => hasSupabaseEnv() && !!process.env.SUPABASE_SERVICE_ROLE_KEY
