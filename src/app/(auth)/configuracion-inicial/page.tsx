import { redirect } from 'next/navigation'
import { AuthCard, SupabaseMissing } from '@/components/auth-card'
import { SetupForm } from '@/components/auth-forms'
import { hasSupabaseEnv } from '@/server/env'
import { needsSetup } from '@/server/actions/setup'

export const metadata = { title: 'Configuración inicial · Alquimia Dental', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  if (!hasSupabaseEnv()) return <SupabaseMissing />
  if (!(await needsSetup())) redirect('/login')
  return (
    <AuthCard title="Bienvenido" subtitle="Primer arranque: crea la clínica y tu cuenta de administrador. Solo se hace una vez.">
      <SetupForm />
    </AuthCard>
  )
}
