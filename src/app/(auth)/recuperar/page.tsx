import Link from 'next/link'
import { AuthCard, SupabaseMissing } from '@/components/auth-card'
import { ResetRequestForm } from '@/components/auth-forms'
import { hasSupabaseEnv } from '@/server/env'

// Depende de variables de entorno y de la sesion: nunca se prerenderiza en el build.
export const dynamic = 'force-dynamic'

export default function RecuperarPage() {
  if (!hasSupabaseEnv()) return <SupabaseMissing />
  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace de un solo uso.">
      <ResetRequestForm />
      <p className="mt-4 text-center text-sm"><Link href="/login" className="text-gold-soft hover:underline">Volver a ingresar</Link></p>
    </AuthCard>
  )
}
