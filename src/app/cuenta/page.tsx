import { signOut } from '@/server/actions/auth'
import { requireMember } from '@/server/auth/guards'
import { CAPABILITIES, ROLE_LABEL, scope, type Capability } from '@/server/auth/permissions'
import { Wordmark } from '@/components/ui'

export const metadata = { title: 'Mi cuenta · Alquimia Dental', robots: { index: false } }

const SCOPE_TEXT = { all: 'Todo', own: 'Solo lo suyo' } as const

// Pantalla real minima del Sprint 1: confirma sesion, MFA y permisos. La reemplaza /inicio en el Sprint 2.
export default async function CuentaPage() {
  const s = await requireMember()
  const caps = (Object.keys(CAPABILITIES) as Capability[]).filter((c) => scope(s.member.role, c) !== 'none')
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Wordmark />
      <section className="glass mt-8 p-6">
        <p className="eyebrow">Mi cuenta</p>
        <h1 className="title-gold mt-1 text-3xl">{s.fullName ?? s.email}</h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="eyebrow">Clínica</dt><dd className="mt-1 text-bone">{s.member.clinicName}</dd></div>
          <div><dt className="eyebrow">Rol</dt><dd className="mt-1 text-bone">{ROLE_LABEL[s.member.role]}</dd></div>
          <div><dt className="eyebrow">Verificación en dos pasos</dt><dd className="mt-1 text-ok">✓ Activa</dd></div>
        </dl>
      </section>
      <section className="glass mt-5 p-6">
        <h2 className="title-gold text-lg">Lo que puedes hacer</h2>
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {caps.map((c) => (
            <li key={c} className="flex justify-between gap-2 border-b border-white/6 pb-1.5">
              <span className="num text-muted">{c}</span>
              <span className="text-bone">{SCOPE_TEXT[scope(s.member.role, c) as 'all' | 'own']}</span>
            </li>
          ))}
        </ul>
      </section>
      <form action={signOut} className="mt-6"><button className="btn btn-secondary">Cerrar sesión</button></form>
    </main>
  )
}
