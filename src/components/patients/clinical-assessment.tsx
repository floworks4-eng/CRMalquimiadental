'use client'
import { useEffect, useState } from 'react'
import { Modal } from '../ui'
import { RECORD_GROUPS, type ClinicalFields, type ClinicalAssessment } from '@/lib/domain/clinical-record'
export function ClinicalAssessmentForm({ patientId }: { patientId: string }) {
  const [assessment, setAssessment] = useState<ClinicalAssessment | null>(null),
    [fields, setFields] = useState<ClinicalFields>({}),
    [open, setOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [published, setPublished] = useState(true)
  const base = `/api/patients/${patientId}/assessment`
  useEffect(() => {
    let active = true
    fetch(base, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw Error(j.error ?? 'No pudimos cargar la ficha clínica.')
        if (active) setAssessment(j.assessment)
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [base])
  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, patientVisible: published }),
      })
      const j = await r.json()
      if (!r.ok) throw Error(j.error)
      const loaded = await fetch(base, { cache: 'no-store' })
      if (!loaded.ok) throw Error('La evaluación se guardó. Actualiza para verla.')
      const data = await loaded.json()
      setAssessment(data.assessment)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="glass p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="title-gold text-lg">Ficha clínica</h2>
          <p className="mt-1 text-xs text-muted">
            {loading
              ? 'Cargando evaluación…'
              : assessment
                ? `Evaluación del ${new Date(assessment.createdAt).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' })} · ${assessment.author}`
                : 'Motivo, antecedentes, exploración, diagnóstico y plan.'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary min-h-11"
          disabled={loading}
          onClick={() => {
            setFields(assessment?.fields ?? {})
            setPublished(assessment?.patientVisible ?? true)
            setOpen(true)
          }}
        >
          {assessment ? 'Revisar ficha clínica' : 'Completar ficha clínica'}
        </button>
      </div>
      {error && !open && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false)
        }}
        title="Evaluación clínica"
        wide
      >
        <p className="mb-4 text-sm text-muted">
          Registra solo lo que el paciente declara o lo que evaluaste. Los campos vacíos quedan como «No registrado». Guardar una revisión
          conserva la anterior.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="space-y-3"
        >
          {RECORD_GROUPS.map((g, i) => (
            <details key={g.title} open={i === 0} className="rounded-xl border border-white/10 px-3">
              <summary className="min-h-12 cursor-pointer content-center text-sm font-medium text-gold-soft">{g.title}</summary>
              <div className="space-y-3 pb-4">
                {g.fields.map(([key, label]) => (
                  <label key={key} className="block text-xs text-muted">
                    {label}
                    <textarea
                      className="field mt-1 w-full"
                      rows={key === 'presentIllness' || key === 'treatmentPlan' ? 3 : 2}
                      maxLength={3000}
                      value={fields[key] ?? ''}
                      disabled={busy}
                      onChange={(e) => setFields((old) => ({ ...old, [key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </details>
          ))}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} disabled={busy} />
            Incluir esta evaluación revisada en la copia para el paciente
          </label>
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <button className="btn btn-primary min-h-12 w-full" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar evaluación revisada'}
          </button>
        </form>
      </Modal>
    </section>
  )
}
