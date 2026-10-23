import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthCard, SupabaseMissing } from '@/components/auth-card'
import { LoginForm } from '@/components/auth-forms'
import { hasSupabaseEnv } from '@/server/env'
import { getSession } from '@/server/auth/session'

// Depende de variables de entorno y de la sesion: nunca se prerenderiza en el build.
export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!hasSupabaseEnv()) return <SupabaseMissing />
  if (await getSession()) redirect('/mfa')
  const { error } = await searchParams
  return (
    <AuthCard title="Ingresar" subtitle="Acceso del equipo de la clínica.">
      {error === 'link' && <p role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">Ese enlace ya no es válido. Pide uno nuevo.</p>}
      <LoginForm />
      <p className="mt-4 text-center text-sm"><Link href="/recuperar" className="text-gold-soft hover:underline">Olvidé mi contraseña</Link></p>
    </AuthCard>
  )
}
