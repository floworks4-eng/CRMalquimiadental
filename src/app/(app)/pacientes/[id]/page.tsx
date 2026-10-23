'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { useDB, byId, fecha, bs, can, toothMap, PATIENT_STATUS, METHOD_LABEL } from '@/lib/data'
import { Card, NoAccess, SourceChip, StatusBadge } from '@/components/ui'
import { PatientPanel } from '@/components/patient-panel'
import { Odontogram } from '@/components/odontogram'

export default function Ficha() {
  const { id } = useParams<{ id: string }>()
  const db = useDB()
  const [tooth, setTooth] = useState<number>()
  const p = byId(db.patients, id)
  const role = db.session!.role
  if (!p) return <p className="glass p-6 text-muted">Paciente no encontrado.</p>
  if (role === 'odontologo' && p.dentistId !== db.session!.userId) return <NoAccess what="pacientes de otro odontólogo" />
  const clinical = can(role, 'clinico')
  const appts = db.appointments.filter((a) => a.patientId === p.id).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
  const first = [...appts].reverse()[0]
  const campaign = byId(db.campaigns, p.campaignId)
  const paid = db.transactions.filter((t) => t.patientId === p.id && t.kind === 'ingreso')

  return (
    <div className="fade-in">
      <Link href="/pacientes" className="btn btn-ghost -ml-3 mb-2 text-xs"><ArrowLeft size={14} aria-hidden />Pacientes</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Ficha del paciente · {PATIENT_STATUS[p.status]}</p>
          <h1 className="title-gold text-3xl md:text-4xl">{p.name}</h1>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_1fr]">
        {clinical ? (
          <PatientPanel db={db} p={p} source={p.source} campaign={campaign?.name} />
        ) : (
          <aside className="glass h-fit space-y-3 p-5 text-sm">
            <p className="num text-muted">{p.phone} (demo)</p>
            <p className="text-muted">{p.zone}</p>
            <SourceChip source={p.source} campaign={campaign?.name} />
            <p className="flex items-start gap-2 rounded-xl border border-white/10 p-3 text-xs text-muted">
              <Lock size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden /> Anamnesis, odontograma e historia clínica ocultos para Recepción.
            </p>
          </aside>
        )}
        <div className="space-y-5">
          <Card title="Origen de captación">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="eyebrow">Canal</dt><dd className="mt-1"><SourceChip source={p.source} /></dd></div>
              <div><dt className="eyebrow">Campaña</dt><dd className="mt-1 text-bone">{campaign ? `${campaign.name} · ${campaign.channel}` : '—'}</dd></div>
              <div><dt className="eyebrow">Primera cita</dt><dd className="num mt-1">{first ? fecha(first.date) : '—'}</dd></div>
              <div><dt className="eyebrow">Citas</dt><dd className="num mt-1">{appts.length}</dd></div>
              <div><dt className="eyebrow">Total pagado</dt><dd className="num mt-1">{bs(paid.reduce((s, t) => s + t.amount, 0))}</dd></div>
            </dl>
          </Card>
          {clinical && (
            <Card title="Odontograma">
              <Odontogram marks={toothMap(db, p.id)} selected={tooth} onSelect={setTooth} />
            </Card>
          )}
          <Card title="Citas">
            <ul className="space-y-2 text-sm">
              {appts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 pb-2 last:border-0">
                  <span><span className="num text-muted">{fecha(a.date)} {a.start}</span> · {byId(db.procedures, a.procedureId)?.name} · {byId(db.users, a.dentistId)?.name}</span>
                  <span className="flex gap-1.5"><SourceChip source={a.source} /><StatusBadge status={a.status} /></span>
                </li>
              ))}
              {!appts.length && <li className="text-muted">Sin citas.</li>}
            </ul>
          </Card>
          {role !== 'odontologo' && paid.length > 0 && (
            <Card title="Pagos">
              <ul className="space-y-1.5 text-sm">
                {paid.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2"><span className="text-muted"><span className="num">{fecha(t.date)}</span> · {METHOD_LABEL[t.method]}</span><span className="num">{bs(t.amount)}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
