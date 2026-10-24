'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Pencil } from 'lucide-react'
import { Field, Modal } from '../ui'
import { reviewAnamnesis } from '@/server/actions/patients'
import { saveAnamnesis } from '@/server/actions/clinical'
import { formatDateTime } from '@/lib/domain/time'
import type { AnamnesisView } from '@/server/queries/patients'

const SOURCE = { patient_checkin: 'Check-in del paciente', staff: 'Cargada por el equipo', import: 'Importada' } as const
const none = (l: string[], word: string) => l.filter((x) => x !== word).join(', ')

/** Anamnesis vigente. Solo se renderiza para quien puede leer datos clinicos (la pagina lo decide en el servidor). */
export function AnamnesisCard({ patientId, anamnesis: a }: { patientId: string; anamnesis: AnamnesisView | null }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [editing, setEditing] = useState(false)
  const editor = (
    <Modal open={editing} onClose={() => setEditing(false)} title="Anamnesis" wide>
      {editing && <AnamnesisForm patientId={patientId} current={a} onDone={() => { setEditing(false); router.refresh() }} />}
    </Modal>
  )
  if (!a) {
    return (
      <section className="glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="title-gold text-lg">Anamnesis</h2>
          <button className="btn btn-primary px-3 py-1 text-xs" onClick={() => setEditing(true)}>Cargar anamnesis</button>
        </div>
        <p className="mt-1 text-sm text-muted">Sin anamnesis todavía: alergias, antecedentes y medicamentos antes de atender.</p>
        {editor}
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
        <span className="flex flex-wrap items-center gap-2">
          {a.reviewedAt ? (
            <span className="inline-flex items-center gap-1 text-xs text-ok"><CheckCircle2 size={14} aria-hidden />Revisada · {formatDateTime(a.reviewedAt)}</span>
          ) : (
            <button className="btn btn-secondary px-3 py-1 text-xs" disabled={pending} onClick={review}>Marcar como revisada</button>
          )}
          <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setEditing(true)}><Pencil size={13} aria-hidden />Actualizar</button>
        </span>
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
      {editor}
    </section>
  )
}

/** Nueva versión: la anterior queda en el historial (no se sobrescribe). */
function AnamnesisForm({ patientId, current: c, onDone }: { patientId: string; current: AnamnesisView | null; onDone: () => void }) {
  const [f, setF] = useState({
    allergies: c ? [none(c.allergies, 'Ninguna'), c.allergyOther ?? ''].filter(Boolean).join(', ') : '',
    conditions: c ? none(c.conditions, 'Ninguno') : '', medications: c?.medications ?? '', reason: c?.reason ?? '',
    emergencyContactName: c?.emergencyContactName ?? '', emergencyContactPhone: c?.emergencyContactPhone ?? '',
    pregnancy: c?.pregnancy ?? false, anticoagulants: c?.anticoagulants ?? false,
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const text = (k: 'allergies' | 'conditions' | 'medications' | 'reason' | 'emergencyContactName' | 'emergencyContactPhone', label: string, hint?: string) => (
    <Field label={label} hint={hint}>{(id) => <input id={id} className="field" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>
  )
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    const r = await saveAnamnesis({ patientId, ...f })
    setPending(false)
    if (r.ok) onDone()
    else setError(r.error.message)
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        {text('allergies', 'Alergias', 'Separadas por coma. Vacío = ninguna.')}
        {text('conditions', 'Antecedentes / enfermedades', 'Diabetes, hipertensión… Vacío = ninguno.')}
        {text('medications', 'Medicamentos que toma')}
        {text('reason', 'Motivo de consulta')}
        {text('emergencyContactName', 'Contacto de emergencia')}
        {text('emergencyContactPhone', 'Teléfono de emergencia')}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-muted">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#c9a961]" checked={f.anticoagulants} onChange={(e) => setF({ ...f, anticoagulants: e.target.checked })} />Toma anticoagulantes</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#c9a961]" checked={f.pregnancy} onChange={(e) => setF({ ...f, pregnancy: e.target.checked })} />Embarazo</label>
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button className="btn btn-primary" disabled={pending}>Guardar nueva versión</button>
      </div>
    </form>
  )
}
