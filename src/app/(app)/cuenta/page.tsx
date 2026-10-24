import Link from 'next/link'
import { signOut } from '@/server/actions/auth'
import { requireMember } from '@/server/auth/guards'
import { ROLE_LABEL, type Role } from '@/server/auth/permissions'

export const metadata = { title: 'Mi cuenta · Alquimia Dental', robots: { index: false } }

const WHAT: Record<Role, string[]> = {
  clinic_admin: ['Todo el sistema: agenda, pacientes e historias clínicas, consulta, caja, inventario y configuración.', 'Invitar y desactivar personas del equipo.', 'Descuentos, anulación de cobros y ajustes de stock.'],
  dentist: ['Su agenda y sus pacientes (los que tiene asignados o con cita).', 'Historia clínica, odontograma, plan de tratamiento y cierre de la atención con cobro.', 'Ver el inventario.'],
  reception: ['Agenda de todos, recepción de pacientes y fichas de contacto.', 'Caja: cobros, gastos, apertura y cierre.', 'No ve datos clínicos (anamnesis, odontograma, notas).'],
}

export default async function CuentaPage() {
  const s = await requireMember()
  return (
    <div className="mx-auto max-w-2xl">
      <section className="glass p-6">
        <p className="eyebrow">Mi cuenta</p>
        <h1 className="title-gold mt-1 text-3xl">{s.fullName ?? s.email}</h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="eyebrow">Clínica</dt><dd className="mt-1 text-bone">{s.member.clinicName}</dd></div>
          <div><dt className="eyebrow">Rol</dt><dd className="mt-1 text-bone">{ROLE_LABEL[s.member.role]}</dd></div>
          <div><dt className="eyebrow">Correo</dt><dd className="mt-1 break-all text-bone">{s.email}</dd></div>
        </dl>
      </section>
      <section className="glass mt-5 p-6">
        <h2 className="title-gold text-lg">Lo que puedes hacer</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-bone">{WHAT[s.member.role].map((w) => <li key={w}>{w}</li>)}</ul>
      </section>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/recuperar/nueva" className="btn btn-secondary">Cambiar contraseña</Link>
        <form action={signOut}><button className="btn btn-ghost">Cerrar sesión</button></form>
      </div>
    </div>
  )
}
