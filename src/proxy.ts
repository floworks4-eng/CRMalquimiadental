import { NextResponse, type NextRequest } from 'next/server'
import { hasSupabaseEnv } from '@/server/env'
import { updateSession } from '@/server/supabase/proxy'

// Todo el sistema es privado (solo el equipo de la clinica). Estas son las unicas rutas sin sesion.
// Cada pagina ademas valida con guards de servidor; esto solo evita renderizar de mas.
const PUBLIC_PREFIXES = ['/login', '/recuperar', '/configuracion-inicial', '/preview', '/api/auth', '/api/health', '/forbidden']

export async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next() // sin Supabase cada pagina muestra como configurarlo
  const path = request.nextUrl.pathname
  // Educational static preview and attribution never access a user session.
  if (path === '/preview/dental' || path === '/models/ATTRIBUTION.md' || path === '/models/manifest.json' || path === '/api/health') return NextResponse.next()
  const { response, claims } = await updateSession(request)
  if (!claims && !PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) {
    const redirect = NextResponse.redirect(new URL('/login', request.url))
    for (const c of response().cookies.getAll()) redirect.cookies.set(c) // conserva cookies refrescadas
    for (const header of ['cache-control', 'expires', 'pragma']) {
      const value = response().headers.get(header)
      if (value) redirect.headers.set(header, value)
    }
    return redirect
  }
  return response()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|bin)$).*)'],
}
