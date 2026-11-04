import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '../env'

/** Refresca la sesion en cada request (cookies httpOnly) y devuelve los claims verificados. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, anonKey } = publicEnv()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) response.cookies.set(name, value, options)
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
      },
    },
  })
  // getClaims verifica la firma del JWT; no se confia en getSession() del servidor.
  const { data } = await supabase.auth.getClaims()
  return { response: () => response, claims: data?.claims ?? null }
}
