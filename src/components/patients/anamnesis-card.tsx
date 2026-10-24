'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { reviewAnamnesis } from '@/server/actions/patients'
import { formatDateTime } from '@/lib/domain/time'
import type { AnamnesisView } from '@/server/queries/patients'

const SOURCE = { patient_checkin: 'Check-in del paciente', staff: 'Cargada por el equipo', import: 'Importada' } as const

/** Anamnesis vigente. Solo se renderiza para quien puede leer datos clinicos (la pagina lo decide en el servidor). */
export function AnamnesisCard({ patientId, anamnesis: a }: { patientId: string; anamnesis: AnamnesisView | null }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  if (!a) {
    return (
      <section className="glass p-5">
        <h2 className="title-gold mb-1 text-lg">Anamnesis</h2>
        <p className="text-sm text-muted">Sin anamnesis todavía. Se completa en el check-in por QR.</p>
      </section>
    )
  }
  const allergies = [...a.allergies.filter((x) => x !== 'Ninguna'), ...(a.allergyOther ? [a.allergyOther] : [])]
  const conditions = a.conditions.filter((x) => x !== 'Ninguno')
  const flags = [a.pregnancy && 'Embarazo', a.anticoagulants && 'Anticoagulantes'].filter(Boolean) as string[]
  const review = async () => {
    setPending(true)
    const r = await reviewAnamnesis({ patientId, versionId: a.id })
    setPending(false)
    if (r.ok) router.refresh()
    else setError(r.error.message)
  }
  return (
    <section className="glass p-5" aria-labelledby="anam-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="anam-h" className="title-gold text-lg">Anamnesis <span className="num text-sm text-muted">v{a.version}</span></h2>
        {a.reviewedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-ok"><CheckCircle2 size={14} aria-hidden />Revisada · {formatDateTime(a.reviewedAt)}</span>
        ) : (
          <button className="btn btn-secondary px-3 py-1 text-xs" disabled={pending} onClick={review}>Marcar como revisada</button>
        )}
      </div>
      {(allergies.length > 0 || flags.length > 0) && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="note">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{allergies.length > 0 && <>Alergias: <strong>{allergies.join(', ')}</strong>. </>}{flags.join(' · ')}</span>
        </p>
      )}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="eyebrow">Alergias</dt><dd className="mt-1 text-bone">{allergies.length ? allergies.join(', ') : 'Ninguna'}</dd></div>
        <div><dt className="eyebrow">Antecedentes</dt><dd className="mt-1 text-bone">{conditions.length ? conditions.join(', ') : 'Ninguno'}</dd></div>
        <div><dt className="eyebrow">Medicamentos</dt><dd className="mt-1 text-bone">{a.medications ?? '—'}</dd></div>
        <div><dt className="eyebrow">Motivo</dt><dd className="mt-1 text-bone">{a.reason ?? '—'}</dd></div>
        <div><dt className="eyebrow">Contacto de emergencia</dt><dd className="mt-1 text-bone">{a.emergencyContactName ?? '—'} {a.emergencyContactPhone && <span className="num text-muted">{a.emergencyContactPhone}</span>}</dd></div>
        <div><dt className="eyebrow">Origen</dt><dd className="mt-1 text-bone">{SOURCE[a.source]} · <span className="num text-muted">{formatDateTime(a.submittedAt)}</span></dd></div>
      </dl>
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
    </section>
  )
}
