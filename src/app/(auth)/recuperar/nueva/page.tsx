import { AuthCard, SupabaseMissing } from '@/components/auth-card'
import { NewPasswordForm } from '@/components/auth-forms'
import { hasSupabaseEnv } from '@/server/env'
import { requireSession } from '@/server/auth/guards'

// Depende de variables de entorno y de la sesion: nunca se prerenderiza en el build.
export const dynamic = 'force-dynamic'

export default async function NuevaContrasenaPage() {
  if (!hasSupabaseEnv()) return <SupabaseMissing />
  await requireSession()
  return (
    <AuthCard title="Contraseña nueva" subtitle="Después te pediremos tu código de verificación.">
      <NewPasswordForm />
    </AuthCard>
  )
}
