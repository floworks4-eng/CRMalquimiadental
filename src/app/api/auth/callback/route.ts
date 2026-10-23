import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/server/supabase/server'

// Solo rutas internas: evita que ?next= se use como redireccion abierta.
const safeNext = (next: string | null) => (next && /^\/(?!\/)[\w\-/]*$/.test(next) ? next : '/mfa')

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(safeNext(searchParams.get('next')), origin))
  }
  return NextResponse.redirect(new URL('/login?error=link', origin))
}
