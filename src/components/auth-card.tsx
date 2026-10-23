import type { ReactNode } from 'react'
import { Wordmark } from './ui'

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <Wordmark />
      </div>
      <section className="glass halo relative p-6 md:p-7">
        <h1 className="title-gold text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </section>
      <p className="mt-8 text-center text-xs text-muted/70">Alquimia Dental · acceso del equipo</p>
    </main>
  )
}

export function SupabaseMissing() {
  return (
    <AuthCard title="Falta configurar el acceso" subtitle="Este entorno no tiene las variables de Supabase.">
      <p className="text-sm text-muted">
        Copia <code className="num">.env.example</code> a <code className="num">.env.local</code> y completa
        <code className="num"> NEXT_PUBLIC_SUPABASE_URL</code> y <code className="num">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
      </p>
    </AuthCard>
  )
}
