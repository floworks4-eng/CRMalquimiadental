'use client'
import { AlertTriangle } from 'lucide-react'
import { age, fecha, type DB, type Patient } from '@/lib/data'
import { SourceChip, Avatar } from './ui'

export function PatientPanel({ db, p, source, campaign }: { db: DB; p: Patient; source: Patient['source']; campaign?: string }) {
  const an = p.anamnesis
  const allergies = [...(an?.allergies ?? []), an?.allergyOther].filter((x) => x && x !== 'Ninguna')
  const conditions = (an?.conditions ?? []).filter((x) => x !== 'Ninguno')
  const records = db.clinicalRecords.filter((r) => r.patientId === p.id).slice(0, 3)
  return (
    <aside className="glass h-fit space-y-4 p-5">
      <div className="flex items-center gap-3">
        <Avatar name={p.name} size={48} />
        <div className="text-sm">
          <p className="text-muted">{p.birthDate ? `${age(p.birthDate)} años` : 'Edad sin registrar'} · {p.zone}</p>
          <p className="num text-muted">{p.phone} <span className="text-[0.65rem]">(demo)</span></p>
          <div className="mt-1 flex flex-wrap gap-1"><SourceChip source={source} campaign={campaign} />{campaign && <span className="text-xs text-gold-soft">{campaign}</span>}</div>
        </div>
      </div>
      {allergies.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> Alergia: {allergies.join(', ')}
        </p>
      )}
      {an ? (
        <dl className="space-y-2 text-sm">
          <div><dt className="eyebrow">Antecedentes</dt><dd>{conditions.join(', ') || 'Ninguno'}</dd></div>
          {an.medications && <div><dt className="eyebrow">Medicamentos</dt><dd>{an.medications}</dd></div>}
          <div><dt className="eyebrow">Motivo</dt><dd>{an.reason}</dd></div>
          <div><dt className="eyebrow">Consentimiento</dt><dd className="text-ok">✓ Firmado{an.submittedAt && ` a las ${an.submittedAt}`}</dd></div>
        </dl>
      ) : (
        <p className="text-sm text-muted">Sin anamnesis digital todavía (se llena en el check-in por QR).</p>
      )}
      <div>
        <p className="eyebrow mb-2">Historial</p>
        {records.length ? (
          <ul className="space-y-2 text-xs">
            {records.map((r) => (
              <li key={r.id} className="border-l border-gold/40 pl-3">
                <span className="num text-muted">{fecha(r.date)}</span> · {r.procedures.join(', ')}
                <span className="block text-muted">{r.summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">Primera atención.</p>
        )}
      </div>
    </aside>
  )
}
