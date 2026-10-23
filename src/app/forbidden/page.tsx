import Link from 'next/link'
import { AuthCard } from '@/components/auth-card'
import { signOut } from '@/server/actions/auth'

export const metadata = { robots: { index: false } }

export default function ForbiddenPage() {
  return (
    <AuthCard title="Sin acceso" subtitle="Tu cuenta no tiene permiso para ver esta sección.">
      <p className="text-sm text-muted">Si crees que es un error, pídele al administrador de la clínica que revise tu rol.</p>
      <div className="mt-5 flex gap-2">
        <Link href="/cuenta" className="btn btn-secondary flex-1">Mi cuenta</Link>
        <form action={signOut} className="flex-1"><button className="btn btn-ghost w-full">Salir</button></form>
      </div>
    </AuthCard>
  )
}
