import { NextResponse, type NextRequest } from 'next/server'
import { hasSupabaseEnv } from '@/server/env'
import { updateSession } from '@/server/supabase/proxy'

// Rutas reales que exigen sesion. Crece a medida que cada vertical reemplaza su pantalla de la demo
// (la demo sigue publica en `demo`; ver docs/arquitectura.md). Cada pagina ademas valida con guards de servidor.
const PRIVATE_PREFIXES = ['/cuenta', '/mfa', '/auditoria', '/configuracion', '/agenda', '/pacientes', '/recepcion']

export async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next() // demo local sin Supabase
  const { response, claims } = await updateSession(request)

  const path = request.nextUrl.pathname
  if (!claims && PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) {
    const redirect = NextResponse.redirect(new URL('/login', request.url))
    for (const c of response().cookies.getAll()) redirect.cookies.set(c) // conserva cookies refrescadas
    return redirect
  }
  return response()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
