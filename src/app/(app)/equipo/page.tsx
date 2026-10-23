'use client'
import { Check, Minus } from 'lucide-react'
import { useDB, PERMS, MODULE_LABEL, type Module, type Role } from '@/lib/data'
import { PageHeader, Card, Avatar } from '@/components/ui'

const ROLES: [Role, string][] = [['admin', 'Administrador'], ['odontologo', 'Odontólogo'], ['recepcion', 'Recepción']]

export default function Equipo() {
  const db = useDB()
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Control por roles (RBAC)" title="Equipo y roles" />
      <ul className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {db.users.map((u) => (
          <li key={u.id} className="glass flex items-center gap-3 p-4">
            <Avatar name={u.name} size={42} />
            <span><span className="block text-bone">{u.name}</span><span className="text-sm text-muted">{u.title}</span>
              <span className="block text-xs text-gold-soft">{ROLES.find(([r]) => r === u.role)![1]}</span></span>
          </li>
        ))}
      </ul>
      <Card title="Matriz de permisos">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <caption className="sr-only">Qué puede ver y hacer cada rol</caption>
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Módulo</th>
                {ROLES.map(([r, l]) => <th key={r} scope="col" className="py-2 pr-3 font-medium">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERMS) as Module[]).map((m) => (
                <tr key={m} className="border-b border-white/6 last:border-0">
                  <th scope="row" className="py-2.5 pr-3 text-left font-normal text-bone">{MODULE_LABEL[m]}</th>
                  {ROLES.map(([r]) => (
                    <td key={r} className="py-2.5 pr-3">
                      {PERMS[m][r] ? (
                        <span className="inline-flex items-center gap-1.5 text-bone"><Check size={14} className="text-ok" aria-hidden />{PERMS[m][r]}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted"><Minus size={14} aria-hidden />Sin acceso</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Los datos de salud solo los ve quien los necesita. En producción, cada acción queda registrada (quién, qué, cuándo).</p>
      </Card>
    </div>
  )
}
