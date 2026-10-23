import { redirect } from 'next/navigation'
import { AuthCard, SupabaseMissing } from '@/components/auth-card'
import { MfaEnrollForm, MfaVerifyForm } from '@/components/auth-forms'
import { hasSupabaseEnv } from '@/server/env'
import { getMfaState, signOut } from '@/server/actions/auth'

// Depende de variables de entorno y de la sesion: nunca se prerenderiza en el build.
export const dynamic = 'force-dynamic'

export default async function MfaPage() {
  if (!hasSupabaseEnv()) return <SupabaseMissing />
  const state = await getMfaState()
  if (state === 'verified') redirect('/agenda')
  return (
    <AuthCard
      title={state === 'enroll' ? 'Activa la verificación en dos pasos' : 'Verificación en dos pasos'}
      subtitle={state === 'enroll' ? 'Obligatoria para ver datos de pacientes. Solo se hace una vez.' : 'Escribe el código de tu app de autenticación.'}
    >
      {state === 'enroll' ? <MfaEnrollForm /> : <MfaVerifyForm />}
      <form action={signOut} className="mt-4 text-center">
        <button className="text-sm text-muted hover:text-bone hover:underline">Salir</button>
      </form>
    </AuthCard>
  )
}
