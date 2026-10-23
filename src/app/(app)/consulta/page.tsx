'use client'
import Link from 'next/link'
import { useDB, visibleAppointments, todayISO, byId } from '@/lib/data'
import { PageHeader, StatusBadge } from '@/components/ui'

export default function ConsultaIndex() {
  const db = useDB()
  const list = visibleAppointments(db, todayISO()).filter((a) => ['en_espera', 'en_atencion'].includes(a.status))
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Consulta activa" title="Pacientes para atender" />
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((a) => (
          <li key={a.id}>
            <Link href={`/consulta/${a.id}`} className="glass flex items-center justify-between gap-3 p-4 hover:ring-1 hover:ring-gold/40">
              <span>
                <span className="block text-bone">{byId(db.patients, a.patientId)?.name}</span>
                <span className="text-sm text-muted"><span className="num">{a.start}</span> · {byId(db.procedures, a.procedureId)?.name} · {byId(db.cabinets, a.cabinetId)?.name}</span>
              </span>
              <StatusBadge status={a.status} />
            </Link>
          </li>
        ))}
        {!list.length && <li className="glass p-5 text-sm text-muted">Nadie en sala de espera ni en atención. Los pacientes aparecen aquí al hacer check-in.</li>}
      </ul>
    </div>
  )
}
