import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '../env'

/** Cliente por request: actua con la sesion (y por tanto con las politicas RLS) del usuario. */
export async function createClient() {
  const store = await cookies()
  const { url, anonKey } = publicEnv()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy ya refresca la sesion.
        }
      },
    },
  })
}
