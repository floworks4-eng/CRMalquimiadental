'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { FileText, NotebookPen, Stethoscope, ClipboardList, Plus, Camera, ExternalLink } from 'lucide-react'
import { Field } from '../ui'
import type { ToothMark } from '../odontogram'
import { DentalWorkspace } from '../dental-workspace'
import { addClinicalNote } from '@/server/actions/patients'
import { CONDITION_LABEL, INVOICE_STATUS_LABEL, type ToothCondition } from '@/lib/domain/clinical'
import { formatBs } from '@/lib/domain/money'
import { formatDate, todayLaPaz } from '@/lib/domain/time'
import { dentitionForTooth, getToothInfo, type Dentition } from '@/lib/teeth'
import type { InvoiceSummary, PatientClinical } from '@/server/queries/clinical'

type Entry =
  | { kind: 'encounter'; date: string; item: PatientClinical['history'][number] }
  | { kind: 'note'; date: string; item: PatientClinical['notes'][number] }
  | { kind: 'anamnesis'; date: string; item: PatientClinical['anamnesisVersions'][number] }

const FILTERS = { all: 'Todo', encounter: 'Atenciones', note: 'Notas e historial importado', anamnesis: 'Anamnesis' } as const
const SOURCE = { patient_checkin: 'check-in', staff: 'equipo', import: 'importada' } as const
const finding = (s: string) => {
  const [tooth, cond, surf] = s.split(' ')
  return `${tooth}: ${CONDITION_LABEL[cond as ToothCondition] ?? cond}${surf ? ` ${surf}` : ''}`
}

/** Historia clínica en la ficha. Solo la reciben admin y el odontólogo del paciente (el servidor decide). */
export function PatientClinicalView({ patientId, data, child }: { patientId: string; data: PatientClinical; child: boolean }) {
  const [selected, setSelected] = useState<number>()
  const [dentition, setDentition] = useState<Dentition>(child ? 'temporal' : 'permanente')
  const [filter, setFilter] = useState<keyof typeof FILTERS>('all')
  const selectedInfo = selected ? getToothInfo(selected) : undefined

  const handleSelectTooth = (n: number | undefined) => {
    setSelected(n)
    if (n !== undefined) {
      setDentition(dentitionForTooth(n))
    }
  }
  const marks = useMemo(() => {
    const m: Record<number, ToothMark> = {}
    for (const f of data.findings) m[f.tooth] = { condition: f.condition, today: false }
    return m
  }, [data.findings])
  const toothHistory = selected ? data.findings.filter((f) => f.tooth === selected) : []
  const pendingTotal = data.pending.reduce((s, i) => s + i.priceCents, 0)

  const timeline = useMemo<Entry[]>(
    () =>
      [
        ...data.history.map((item) => ({ kind: 'encounter' as const, date: item.startedAt, item })),
        ...data.notes.map((item) => ({ kind: 'note' as const, date: item.notedOn + 'T12:00:00', item })),
        ...data.anamnesisVersions.map((item) => ({ kind: 'anamnesis' as const, date: item.submittedAt, item })),
      ].sort((a, b) => b.date.localeCompare(a.date)),
    [data],
  )
  const shown = timeline.filter((e) => filter === 'all' || e.kind === filter)

  return (
    <>
      <section className="glass p-5" aria-labelledby="hist-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="hist-h" className="title-gold text-lg">
            Historial médico <span className="num text-sm text-muted">({timeline.length})</span>
          </h2>
          <div role="group" aria-label="Filtrar historial" className="flex flex-wrap gap-1">
            {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1 text-xs ${filter === f ? 'bg-white/10 text-gold ring-1 ring-gold/40' : 'text-muted hover:text-bone'}`}
              >
                {FILTERS[f]}
              </button>
            ))}
          </div>
        </div>
        <AddNote patientId={patientId} />
        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Sin registros todavía. Aparecen aquí las atenciones, las notas, el historial importado y los cambios de anamnesis.
          </p>
        ) : (
          <ol className="mt-4 space-y-3 border-l border-white/10 pl-4">
            {shown.map((e) => (
              <li key={e.kind + (e.item as { id: string }).id} className="relative">
                <span aria-hidden className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border border-gold/60 bg-[#1e1f21]" />
                {e.kind === 'encounter' && <EncounterEntry e={e.item} />}
                {e.kind === 'note' && (
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <NotebookPen size={13} className="text-gold" aria-hidden />
                      <span className="num text-gold-soft">{formatDate(e.item.notedOn + 'T12:00:00')}</span>
                      {e.item.source === 'import' ? 'Historial importado' : `Nota de ${e.item.author}`}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-bone">{e.item.body}</p>
                  </div>
                )}
                {e.kind === 'anamnesis' && (
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <ClipboardList size={13} className="text-gold" aria-hidden />
                      <span className="num text-gold-soft">{formatDate(e.item.submittedAt)}</span>
                      Anamnesis v{e.item.version} ({SOURCE[e.item.source]}, {e.item.author})
                    </p>
                    <p className="mt-1 text-sm text-bone">{e.item.summary}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <PatientFiles patientId={patientId} files={data.files} />

      <section className="glass p-5">
        <DentalWorkspace
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
                  <li key={f.recordedAt}>
                    <span className="num text-muted">{formatDate(f.recordedAt)}</span> ·{' '}
                    <span className="text-bone">{CONDITION_LABEL[f.condition]}</span>
                    {f.surfaces.length > 0 && ` (${f.surfaces.join('')})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

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

function PatientFiles({ patientId, files }: { patientId: string; files: PatientClinical['files'] }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const upload = async (file: File | undefined) => {
    if (!file) return
    setPending(true)
    setError('')
    setMessage('')
    try {
      const form = new FormData()
      form.set('file', file)
      const response = await fetch(`/api/patients/${patientId}/files`, { method: 'POST', body: form })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) setError(result.error ?? 'No se pudo guardar el archivo.')
      else {
        setMessage('Ficha guardada en el expediente.')
        router.refresh()
      }
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="glass p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="title-gold text-lg">Fichas y documentos</h2>
          <p className="mt-1 text-sm text-muted">
            Toma una foto del registro en papel o sube un PDF. Queda guardado en la ficha del paciente.
          </p>
        </div>
        <label className="btn btn-secondary cursor-pointer">
          <Camera size={16} aria-hidden />
          {pending ? 'Guardando…' : 'Tomar foto / subir'}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            disabled={pending}
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-ok">
          {message}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block text-bone">{file.kind === 'photo' ? 'Foto de ficha' : 'Documento PDF'}</span>
                <span className="text-xs text-muted">
                  {new Date(file.createdAt).toLocaleDateString('es-BO')} · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </span>
              </span>
              {file.url && (
                <a className="btn btn-ghost shrink-0 px-2 py-1 text-xs text-gold-soft" href={file.url} target="_blank" rel="noreferrer">
                  Abrir <ExternalLink size={13} aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EncounterEntry({ e }: { e: PatientClinical['history'][number] }) {
  return (
    <div>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Stethoscope size={13} className="text-gold" aria-hidden />
        <span className="num text-gold-soft">{formatDate(e.startedAt)}</span>
        Atención · {e.dentist}
        {e.status === 'in_progress' && ' · en curso'}
        <Link href={`/consulta/${e.appointmentId}`} className="text-gold-soft hover:underline">
          Abrir
        </Link>
      </p>
      {e.chiefComplaint && <p className="mt-1 text-sm text-bone">{e.chiefComplaint}</p>}
      {e.items.length > 0 && (
        <p className="text-sm text-muted">
          Realizado: <span className="text-bone">{e.items.join(', ')}</span>
        </p>
      )}
      {e.findings.length > 0 && (
        <p className="text-sm text-muted">
          Hallazgos: <span className="text-bone">{e.findings.map(finding).join(', ')}</span>
        </p>
      )}
      {e.notes && <p className="mt-1 whitespace-pre-line text-sm text-bone">{e.notes}</p>}
      {e.invoice && (
        <p className="text-xs text-muted">
          <FileText size={12} className="mr-1 inline" aria-hidden />
          {e.invoice.number} · {formatBs(e.invoice.totalCents)}
        </p>
      )}
      {e.addenda.map((a) => (
        <p key={a.createdAt} className="mt-1 rounded-lg border border-white/8 bg-black/15 px-2 py-1 text-xs text-muted">
          Addenda {formatDate(a.createdAt)} ({a.author}) · {a.reason}: <span className="text-bone">{a.notes}</span>
        </p>
      ))}
    </div>
  )
}

function AddNote({ patientId }: { patientId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ body: '', notedOn: todayLaPaz() })
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  if (!open)
    return (
      <button type="button" className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden />
        Agregar nota al historial
      </button>
    )
  return (
    <form
      className="space-y-2 rounded-xl border border-white/8 bg-black/15 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError('')
          const r = await addClinicalNote({ patientId, ...f })
          if (!r.ok) return setError(r.error.message)
          setF({ body: '', notedOn: todayLaPaz() })
          setOpen(false)
          router.refresh()
        })
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
        <Field label="Fecha">
          {(id) => (
            <input
              id={id}
              type="date"
              max={todayLaPaz()}
              className="field"
              value={f.notedOn}
              onChange={(e) => setF({ ...f, notedOn: e.target.value })}
            />
          )}
        </Field>
        <Field label="Nota" hint="Por ejemplo, transcribir una ficha en papel. No se puede editar después: una corrección es otra nota.">
          {(id, d) => (
            <textarea
              id={id}
              aria-describedby={d}
              rows={3}
              maxLength={10_000}
              className="field"
              value={f.body}
              onChange={(e) => setF({ ...f, body: e.target.value })}
              autoFocus
            />
          )}
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={pending || f.body.trim().length < 3}>
          Guardar nota
        </button>
      </div>
    </form>
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
