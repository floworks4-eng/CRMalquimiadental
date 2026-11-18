'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ClinicalAssessmentForm } from './clinical-assessment'
import { SessionJournal } from './session-journal'
import { dentalToothHistory, latestDentalFindings, type DentalStateEvent } from '@/lib/domain/dental'
import type { ToothMark } from '../odontogram'
import { DentalWorkspace } from '../dental-workspace'
import { clearPatientToothState, savePatientToothState } from '@/server/actions/patients'
import { CONDITION_LABEL, INVOICE_STATUS_LABEL, type ToothCondition } from '@/lib/domain/clinical'
import { formatBs } from '@/lib/domain/money'
import { formatDate } from '@/lib/domain/time'
import { dentitionForTooth, getToothInfo, type Dentition } from '@/lib/teeth'
import type { InvoiceSummary, PatientClinical } from '@/server/queries/clinical'

const describeDentalEvent = (event: DentalStateEvent) => {
  const label = (state: DentalStateEvent['after']) =>
    state ? `${CONDITION_LABEL[state.condition]}${state.surfaces.length ? ` (${state.surfaces.join('')})` : ''}` : 'Marca quitada'
  return `${(event.after ?? event.before)?.tooth}: ${event.before ? `${label(event.before)} → ` : ''}${label(event.after)}`
}
/** Historia clínica en la ficha. Solo la reciben admin y el odontólogo del paciente (el servidor decide). */
export function PatientClinicalView({
  patientId,
  patientName,
  data,
  child,
}: {
  patientId: string
  patientName?: string
  data: PatientClinical
  child: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<number>()
  const [surfaces, setSurfaces] = useState<string[]>([])
  const [dentition, setDentition] = useState<Dentition>(child ? 'temporal' : 'permanente')
  const selectedInfo = selected ? getToothInfo(selected) : undefined

  const handleSelectTooth = (n: number | undefined) => {
    setSelected(n)
    setSurfaces(latestDentalFindings(data.findings, data.toothStates).find((f) => f.tooth === n)?.surfaces ?? [])
    if (n !== undefined) {
      setDentition(dentitionForTooth(n))
    }
  }
  const marks = useMemo(() => {
    const m: Record<number, ToothMark> = {}
    for (const f of latestDentalFindings(data.findings, data.toothStates))
      m[f.tooth] = { condition: f.condition, today: f.encounterId === '' }
    return m
  }, [data.findings, data.toothStates])
  const toothHistory = selected ? dentalToothHistory(data.findings, data.toothStates, data.toothStateHistory, selected) : []
  const saveTooth = async (tooth: number, condition: ToothCondition) => {
    const result = await savePatientToothState({ patientId, tooth, condition, surfaces })
    if (!result.ok) return result.error.message
    router.refresh()
  }
  const clearTooth = async (tooth: number) => {
    const result = await clearPatientToothState({ patientId, tooth })
    if (!result.ok) return result.error.message
    router.refresh()
  }
  const pendingTotal = data.pending.reduce((s, i) => s + i.priceCents, 0)

  return (
    <>
      <ClinicalAssessmentForm key={`assessment-${patientId}`} patientId={patientId} />
      <SessionJournal key={patientId} patientId={patientId} patientName={patientName} data={data} />

      <section className="glass p-5">
        <h2 className="title-gold mb-1 text-lg">Odontograma</h2>
        <p className="mb-3 text-sm text-muted">Toca un diente para registrar o actualizar su estado.</p>
        <DentalWorkspace
          initialView="3d"
          onMark={saveTooth}
          onClear={clearTooth}
          surfaces={surfaces}
          onSurfacesChange={setSurfaces}
          marks={marks}
          selected={selected}
          onSelect={handleSelectTooth}
          dentition={dentition}
          onDentitionChange={setDentition}
        />
        {selected && selectedInfo && (
          <div className="mt-3 rounded-xl border border-white/8 bg-black/15 p-3 text-sm" aria-live="polite">
            <p className="eyebrow mb-1">
              {selectedInfo.labelWithNumber} · {selectedInfo.zoneLabel}
            </p>
            {toothHistory.length === 0 ? (
              <p className="text-muted">Sin hallazgos registrados.</p>
            ) : (
              <ul className="space-y-0.5">
                {toothHistory.map((f) => (
                  <li key={f.id}>
                    <span className="num text-muted">{formatDate(f.recordedAt)}</span> ·{' '}
                    <span className="text-bone">{describeDentalEvent(f)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <details className="glass p-5">
        <summary className="cursor-pointer text-sm text-muted">Auditoría de cambios dentales ({data.toothStateHistory.length})</summary>
        {!data.toothStateHistoryAvailable && <p className="mt-2 text-sm text-muted">Disponible para administración.</p>}
        <ul className="mt-3 space-y-2 text-sm">
          {data.toothStateHistory.map((event) => (
            <li key={event.id}>
              <span className="text-muted">{formatDate(event.recordedAt)}</span> · {describeDentalEvent(event)}
            </li>
          ))}
        </ul>
      </details>

      <section className="glass p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="title-gold text-lg">Plan pendiente</h2>
          {data.pending.length > 0 && <span className="num text-sm text-muted">{formatBs(pendingTotal)}</span>}
        </div>
        {data.pending.length === 0 ? (
          <p className="text-sm text-muted">Nada pendiente.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.pending.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span className="text-bone">
                  {i.treatmentName}
                  {i.tooth ? <span className="text-muted"> · pieza {i.tooth}</span> : ''}
                </span>
                <span className="num">{formatBs(i.priceCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export function PatientInvoices({ invoices, canCharge }: { invoices: InvoiceSummary[]; canCharge: boolean }) {
  const balance = invoices.filter((i) => i.status !== 'voided').reduce((s, i) => s + i.totalCents - i.paidCents, 0)
  return (
    <section className="glass p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="title-gold text-lg">Cuenta</h2>
        <span className={`num text-sm ${balance ? 'text-warn' : 'text-ok'}`}>{balance ? `Saldo ${formatBs(balance)}` : 'Al día'}</span>
      </div>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted">Sin facturas.</p>
      ) : (
        <ul>
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 py-2 text-sm last:border-0">
              <span>
                <span className="num text-bone">{i.number}</span>{' '}
                <span className="text-xs text-muted">
                  · {formatDate(i.issuedAt)} · {INVOICE_STATUS_LABEL[i.status]}
                </span>
              </span>
              <span className="num">
                {formatBs(i.paidCents)} / {formatBs(i.totalCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {balance > 0 && canCharge && (
        <Link href="/caja" className="btn btn-secondary mt-3 text-xs">
          Cobrar en Caja
        </Link>
      )}
    </section>
  )
}
