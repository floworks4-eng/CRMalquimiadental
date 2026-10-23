'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Search, ScanText } from 'lucide-react'
import { useDB, visiblePatients, byId, todayISO, fecha, SOURCE_LABEL, PATIENT_STATUS, can, type PatientSource, type Patient } from '@/lib/data'
import { PageHeader, SourceChip, Avatar } from '@/components/ui'

export default function Pacientes() {
  const db = useDB()
  const [q, setQ] = useState('')
  const [source, setSource] = useState<PatientSource | ''>('')
  const [status, setStatus] = useState<Patient['status'] | ''>('')
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const list = visiblePatients(db)
    .filter((p) => (!q || norm(p.name + p.phone).includes(norm(q))) && (!source || p.source === source) && (!status || p.status === status))
    .sort((a, b) => a.name.localeCompare(b.name))
  const next = (id: string) => db.appointments.filter((a) => a.patientId === id && a.date >= todayISO() && !['atendida', 'cancelada', 'no_asistio'].includes(a.status)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0]

  return (
    <div className="fade-in">
      <PageHeader eyebrow="CRM" title="Pacientes">
        {can(db.session!.role, 'ingesta') && <Link href="/ingesta" className="btn btn-secondary"><ScanText size={16} aria-hidden />Importar historiales</Link>}
      </PageHeader>
      <div className="glass mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative">
          <span className="sr-only">Buscar por nombre o teléfono</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="field pl-9" placeholder="Buscar por nombre o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">Origen
          <select className="field w-auto" value={source} onChange={(e) => setSource(e.target.value as PatientSource | '')}>
            <option value="">Todos</option>
            {(Object.keys(SOURCE_LABEL) as PatientSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">Estado
          <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value as Patient['status'] | '')}>
            <option value="">Todos</option>
            {(Object.keys(PATIENT_STATUS) as Patient['status'][]).map((s) => <option key={s} value={s}>{PATIENT_STATUS[s]}</option>)}
          </select>
        </label>
      </div>
      <p className="mb-2 text-sm text-muted" aria-live="polite">{list.length} pacientes</p>
      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead className="hidden text-left md:table-header-group">
            <tr className="border-b border-white/8 text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-3 font-medium">Paciente</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Odontólogo</th>
              <th className="px-4 py-3 font-medium">Próxima cita</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const n = next(p.id)
              return (
                <tr key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/6 px-4 py-3 last:border-0 hover:bg-white/[0.03] md:table-row md:p-0">
                  <td className="w-full md:w-auto md:px-4 md:py-3">
                    <Link href={`/pacientes/${p.id}`} className="flex items-center gap-3">
                      <Avatar name={p.name} size={34} />
                      <span>
                        <span className="block text-bone hover:text-gold">{p.name}</span>
                        <span className="num text-xs text-muted">{p.phone} (demo)</span>
                      </span>
                    </Link>
                  </td>
                  <td className="md:px-4"><SourceChip source={p.source} campaign={byId(db.campaigns, p.campaignId)?.name} /></td>
                  <td className="text-muted md:px-4">{PATIENT_STATUS[p.status]}</td>
                  <td className="text-muted md:px-4">{byId(db.users, p.dentistId)?.name}</td>
                  <td className="num text-muted md:px-4">{n ? `${fecha(n.date)} ${n.start}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-sm text-muted">Sin resultados.</p>}
      </div>
    </div>
  )
}
