'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, Play, Plus, Trash2, Wallet } from 'lucide-react'
import { Field, Modal } from '../ui'
import { StatusChip } from '../chips'
import { latestDentalFindings } from '@/lib/domain/dental'
import type { ToothMark } from '../odontogram'
import { DentalWorkspace } from '../dental-workspace'
import {
  addAddendum,
  addFinding,
  addPlanItem,
  finishEncounter,
  removeFinding,
  removePlanItem,
  saveEncounterNotes,
  setPlanItemToday,
  startEncounter,
  type FinishResult,
  type Shortage,
} from '@/server/actions/clinical'
import { CONDITION_LABEL, METHOD_LABEL, METHODS, ageYears, parseBs, type PaymentMethod, type ToothCondition } from '@/lib/domain/clinical'
import { formatBs } from '@/lib/domain/money'
import { formatDate, formatDateTime, formatTime } from '@/lib/domain/time'
import { dentitionForTooth, getToothInfo, type Dentition } from '@/lib/teeth'
import type { ConsultaData } from '@/server/queries/clinical'
import type { ActionResult } from '@/server/errors'

export function ConsultaView({ data }: { data: ConsultaData }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const { appointment: a, patient: p, anamnesis, encounter: e } = data

  // Corre una accion del servidor y recarga los datos. Los errores se muestran arriba.
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      setError('')
      const r = await fn()
      if (!r.ok) return setError(r.error.message)
      after?.()
      router.refresh()
    })

  const allergies = anamnesis
    ? [...anamnesis.allergies.filter((x) => x !== 'Ninguna'), ...(anamnesis.allergyOther ? [anamnesis.allergyOther] : [])]
    : []
  const flags = anamnesis
    ? ([anamnesis.anticoagulants && 'Anticoagulantes', anamnesis.pregnancy && 'Embarazo'].filter(Boolean) as string[])
    : []

  return (
    <div className="fade-in">
      <Link href="/consulta" className="btn btn-ghost -ml-3 mb-2 text-xs">
        ← Consulta
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">
            {formatDate(a.startsAt)} · <span className="num">{formatTime(a.startsAt)}</span> · {a.cabinet.name} · {a.dentist.fullName}
          </p>
          <h1 className="title-gold text-3xl md:text-4xl">{p.fullName}</h1>
          <p className="mt-1 text-sm text-muted">
            {p.birthDate ? `${ageYears(p.birthDate)} años` : 'Edad sin registrar'} · {a.treatment?.name ?? 'Sin tratamiento'} ·{' '}
            <Link href={`/pacientes/${p.id}`} className="text-gold-soft hover:underline">
              Ver ficha
            </Link>
          </p>
        </div>
        <StatusChip status={a.status} />
      </div>

      {(allergies.length > 0 || flags.length > 0) && (
        <p role="note" className="mb-4 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {allergies.length > 0 && (
              <>
                Alergias: <strong>{allergies.join(', ')}</strong>.{' '}
              </>
            )}
            {flags.join(' · ')}
          </span>
        </p>
      )}
      {!anamnesis && (
        <p className="mb-4 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm text-muted">
          Este paciente no tiene anamnesis.{' '}
          <Link href={`/pacientes/${p.id}`} className="text-gold-soft hover:underline">
            Cárgala en su ficha
          </Link>{' '}
          antes de atender.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {!e ? (
        <section className="glass halo relative p-8 text-center">
          <h2 className="title-gold text-2xl">Atención sin iniciar</h2>
          {data.canFinish && ['scheduled', 'confirmed', 'checked_in'].includes(a.status) ? (
            <>
              <p className="mt-2 text-sm text-muted">
                Al iniciar, la cita pasa a «En atención» y el tratamiento agendado entra al plan de hoy.
              </p>
              <button className="btn btn-primary btn-xl mt-6" disabled={pending} onClick={() => run(() => startEncounter(a.id))}>
                <Play size={18} aria-hidden />
                INICIAR ATENCIÓN
              </button>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Solo el odontólogo de la cita o el administrador pueden iniciarla.</p>
          )}
        </section>
      ) : e.status === 'in_progress' ? (
        <InProgress data={data} pending={pending} run={run} />
      ) : (
        <Finished data={data} pending={pending} run={run} />
      )}
    </div>
  )
}

type Run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) => void

function InProgress({ data, pending, run }: { data: ConsultaData; pending: boolean; run: Run }) {
  const router = useRouter()
  const e = data.encounter!
  const p = data.patient
  const [selected, setSelected] = useState<number>()
  const [surfaces, setSurfaces] = useState<string[]>([])
  const [notes, setNotes] = useState({ chiefComplaint: e.chiefComplaint ?? '', notes: e.notes ?? '' })
  const [add, setAdd] = useState({ treatmentId: '', today: true })
  const [finishing, setFinishing] = useState(false)

  // Último hallazgo por pieza (historia + hoy).
  const marks = useMemo(() => {
    const m: Record<number, ToothMark> = {}
    for (const f of latestDentalFindings(data.findings, data.toothStates)) m[f.tooth] = { condition: f.condition, today: f.encounterId === e.id }
    return m
  }, [data.findings, data.toothStates, e.id])
  const toothHistory = selected ? data.findings.filter((f) => f.tooth === selected) : []
  const today = data.plan.filter((i) => i.status === 'in_progress')
  const later = data.plan.filter((i) => i.status === 'planned' || i.status === 'accepted')
  const sum = (l: typeof today) => l.reduce((s, i) => s + i.priceCents, 0)
  const short = data.supplies.filter((x) => x.available < x.need)
  const chosen = data.treatments.find((t) => t.id === add.treatmentId)

  const saveDentalFinding = async (tooth: number, condition: ToothCondition) => {
    const result = await addFinding({ encounterId: e.id, patientId: p.id, tooth, condition, surfaces })
    if (!result.ok) return result.error.message
    router.refresh()
  }
  const clearDentalFinding = async (tooth: number) => {
    const result = await removeFinding({ encounterId: e.id, tooth })
    if (!result.ok) return result.error.message
    router.refresh()
  }
  const childish = p.birthDate ? ageYears(p.birthDate) < 12 : false
  const [dentition, setDentition] = useState<Dentition>(childish ? 'temporal' : 'permanente')
  const selectedInfo = selected ? getToothInfo(selected) : undefined

  const handleSelectTooth = (n: number | undefined) => {
    setSelected(n)
    setSurfaces(n ? (latestDentalFindings(data.findings, data.toothStates).find((f) => f.tooth === n)?.surfaces ?? []) : [])
    if (n !== undefined) {
      setDentition(dentitionForTooth(n))
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <section className="glass p-5">
          <DentalWorkspace
            initialView="3d"
            marks={marks}
            selected={selected}
            onSelect={handleSelectTooth}
            dentition={dentition}
            onDentitionChange={setDentition}
            onMark={saveDentalFinding}
            onClear={clearDentalFinding}
            disabled={pending}
            surfaces={surfaces}
            onSurfacesChange={setSurfaces}
          />
          {selected && selectedInfo && toothHistory.length > 0 && (
            <details className="mt-4 rounded-xl border border-white/8 bg-black/15 px-4 text-sm text-muted">
              <summary className="min-h-11 cursor-pointer py-3">
                Ver historia de {selectedInfo.name.toLowerCase()} · pieza {selected}
              </summary>
              <ul className="space-y-2 pb-4 text-xs">
                {toothHistory.map((finding) => (
                  <li key={finding.recordedAt + finding.condition}>
                    <span className="num">{formatDate(finding.recordedAt)}</span> ·{' '}
                    <span className="text-bone">{CONDITION_LABEL[finding.condition]}</span>
                    {finding.surfaces.length > 0 && ` (${finding.surfaces.join('')})`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="glass p-5">
          <h2 className="title-gold mb-3 text-lg">Plan de tratamiento</h2>
          <PlanList
            title="Hoy"
            items={today}
            pending={pending}
            onToggle={(id) => run(() => setPlanItemToday({ id, today: false }))}
            onRemove={(id) => run(() => removePlanItem(id))}
            toggleLabel="Pasar a próxima sesión"
          />
          <PlanList
            title="Próximas sesiones"
            items={later}
            pending={pending}
            onToggle={(id) => run(() => setPlanItemToday({ id, today: true }))}
            onRemove={(id) => run(() => removePlanItem(id))}
            toggleLabel="Hacer hoy"
          />
          <form
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-white/8 pt-4"
            onSubmit={(ev) => {
              ev.preventDefault()
              if (!add.treatmentId) return
              run(
                () =>
                  addPlanItem({
                    patientId: p.id,
                    encounterId: e.id,
                    treatmentId: add.treatmentId,
                    tooth: chosen?.requiresTooth ? selected : undefined,
                    surfaces: chosen?.requiresTooth ? surfaces : [],
                    today: add.today,
                  }),
                () => setAdd((v) => ({ ...v, treatmentId: '' })),
              )
            }}
          >
            <div className="min-w-56 flex-1">
              <Field label="Agregar tratamiento">
                {(id) => (
                  <select
                    id={id}
                    className="field"
                    value={add.treatmentId}
                    onChange={(ev) => setAdd({ ...add, treatmentId: ev.target.value })}
                  >
                    <option value="">Elige…</option>
                    {data.treatments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {formatBs(t.priceCents)}
                        {t.requiresTooth ? ' · por pieza' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-muted">
              <input
                type="checkbox"
                className="accent-[#c9a961]"
                checked={add.today}
                onChange={(ev) => setAdd({ ...add, today: ev.target.checked })}
              />
              Hoy
            </label>
            <button className="btn btn-secondary" disabled={pending || !add.treatmentId || (chosen?.requiresTooth && !selected)}>
              <Plus size={16} aria-hidden />
              {chosen?.requiresTooth ? (selected ? `Pieza ${selected}` : 'Elige pieza') : 'Agregar'}
            </button>
          </form>
          {data.treatments.length === 0 && (
            <p className="mt-2 text-xs text-warn">No hay tratamientos cargados. El administrador los carga en Configuración.</p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-4">
            <div>
              <dt className="eyebrow">Hoy</dt>
              <dd className="num text-2xl text-bone">{formatBs(sum(today))}</dd>
            </div>
            <div>
              <dt className="eyebrow">Próximas sesiones</dt>
              <dd className="num text-2xl text-muted">{formatBs(sum(later))}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="space-y-5">
        <section className="glass p-5">
          <h2 className="title-gold mb-3 text-lg">Notas de la atención</h2>
          <form
            className="space-y-3"
            onSubmit={(ev) => {
              ev.preventDefault()
              run(() => saveEncounterNotes({ encounterId: e.id, ...notes }))
            }}
          >
            <Field label="Motivo de consulta">
              {(id) => (
                <input
                  id={id}
                  className="field"
                  maxLength={300}
                  value={notes.chiefComplaint}
                  onChange={(ev) => setNotes({ ...notes, chiefComplaint: ev.target.value })}
                />
              )}
            </Field>
            <Field label="Evolución / notas clínicas">
              {(id) => (
                <textarea
                  id={id}
                  rows={6}
                  className="field"
                  maxLength={4000}
                  value={notes.notes}
                  onChange={(ev) => setNotes({ ...notes, notes: ev.target.value })}
                />
              )}
            </Field>
            <button className="btn btn-secondary w-full" disabled={pending}>
              Guardar notas
            </button>
          </form>
        </section>

        <section className="glass p-5">
          <h2 className="title-gold mb-3 text-lg">Insumos de hoy</h2>
          {data.supplies.length === 0 ? (
            <p className="text-sm text-muted">Los tratamientos de hoy no tienen receta de insumos.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.supplies.map((x) => (
                <li key={x.item} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted">{x.item}</span>
                  <span className={`num shrink-0 ${x.available < x.need ? 'text-bad' : 'text-bone'}`}>
                    −{x.need}{' '}
                    <span className="text-xs text-muted">
                      de {x.available} {x.unit}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {short.length > 0 && <p className="mt-3 text-xs text-bad">Faltan insumos: no se podrá finalizar hasta reponer en Inventario.</p>}
        </section>

        {data.canFinish && (
          <button className="btn btn-primary btn-xl w-full" disabled={pending || today.length === 0} onClick={() => setFinishing(true)}>
            <CheckCircle2 size={20} aria-hidden />
            FINALIZAR Y COBRAR
          </button>
        )}
        {today.length === 0 && <p className="text-center text-xs text-muted">Agrega al menos un tratamiento para hoy.</p>}
      </div>

      <FinishDialog open={finishing} onClose={() => setFinishing(false)} data={data} />
    </div>
  )
}

function PlanList({
  title,
  items,
  pending,
  onToggle,
  onRemove,
  toggleLabel,
}: {
  title: string
  items: ConsultaData['plan']
  pending: boolean
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  toggleLabel: string
}) {
  return (
    <div className="mb-3">
      <p className="eyebrow mb-1.5">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm text-bone">
                {i.treatmentName}
                <span className="block text-xs text-muted">
                  {i.tooth ? `Pieza ${i.tooth}${i.surfaces.length ? ` (${i.surfaces.join('')})` : ''}` : 'General'}
                </span>
              </span>
              <span className="num text-sm">{formatBs(i.priceCents)}</span>
              <button type="button" className="btn btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => onToggle(i.id)}>
                {toggleLabel}
              </button>
              <button
                type="button"
                className="btn btn-ghost p-1.5"
                disabled={pending}
                aria-label={`Quitar ${i.treatmentName}`}
                onClick={() => onRemove(i.id)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FinishDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: ConsultaData }) {
  return (
    <Modal open={open} onClose={onClose} title="Finalizar atención y cobrar">
      {open && <FinishBody data={data} onClose={onClose} />}
    </Modal>
  )
}

function FinishBody({ data, onClose }: { data: ConsultaData; onClose: () => void }) {
  const router = useRouter()
  const today = data.plan.filter((i) => i.status === 'in_progress')
  const subtotal = today.reduce((s, i) => s + i.priceCents, 0)
  // La misma clave en cada reintento: si la red falla y se vuelve a enviar, no se cobra dos veces.
  const [key] = useState(() => crypto.randomUUID())
  const [discount, setDiscount] = useState({ text: '', reason: '' })
  const discountCents = data.canDiscount ? (parseBs(discount.text || '0') ?? -1) : 0
  const total = subtotal - Math.max(0, discountCents)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [shortage, setShortage] = useState<Shortage[] | null>(null)
  const [result, setResult] = useState<FinishResult | null>(null)
  const amountCents = amount.trim() === '' ? total : parseBs(amount)

  const submit = (pay: boolean) => {
    setError('')
    setFields({})
    if (discountCents < 0 || discountCents > subtotal) return setFields({ discount: 'Descuento no válido.' })
    if (discountCents > 0 && discount.reason.trim().length < 3) return setFields({ discountReason: 'Escribe el motivo del descuento.' })
    const cents = pay ? amountCents : 0
    if (cents === null || cents < 0 || cents > total) return setFields({ amount: `Monto entre Bs. 0 y ${formatBs(total)}.` })
    start(async () => {
      const r = await finishEncounter({
        encounterId: data.encounter!.id,
        idempotencyKey: key,
        amountCents: cents,
        method: cents > 0 ? method : undefined,
        reference: reference || undefined,
        discountCents: Math.max(0, discountCents),
        discountReason: discount.reason || undefined,
      })
      if (r.ok) return setResult(r.data)
      if (r.error.code === 'STOCK_SHORTAGE') setShortage((r.error.data as Shortage[]) ?? [])
      setError(r.error.message)
      setFields(r.error.fields ?? {})
    })
  }

  if (result) {
    return (
      <div className="text-center" role="status">
        <CheckCircle2 size={56} className="mx-auto text-ok" aria-hidden />
        <p className="title-gold mt-3 text-2xl">Atención finalizada</p>
        <p className="mt-1 text-sm text-muted">
          Factura <span className="num text-bone">{result.number}</span>
        </p>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-left">
          <div className="glass p-3">
            <dt className="eyebrow">Total</dt>
            <dd className="num text-lg">{formatBs(result.totalCents)}</dd>
          </div>
          <div className="glass p-3">
            <dt className="eyebrow">Cobrado</dt>
            <dd className="num text-lg text-ok">{formatBs(result.paidCents)}</dd>
          </div>
          <div className="glass p-3">
            <dt className="eyebrow">Saldo</dt>
            <dd className={`num text-lg ${result.balanceCents ? 'text-warn' : ''}`}>{formatBs(result.balanceCents)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Se descontaron los insumos y la cita quedó como atendida.{result.balanceCents > 0 && ' El saldo queda en «Por cobrar» de Caja.'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose()
              router.refresh()
            }}
          >
            Listo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-1 text-sm">
        {today.map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            <span>
              {i.treatmentName}
              {i.tooth ? ` · pieza ${i.tooth}` : ''}
            </span>
            <span className="num">{formatBs(i.priceCents)}</span>
          </li>
        ))}
        <li className="flex justify-between border-t border-white/10 pt-2 text-muted">
          <span>Subtotal</span>
          <span className="num">{formatBs(subtotal)}</span>
        </li>
      </ul>

      {data.canDiscount && (
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <Field label="Descuento (Bs.)" error={fields.discount}>
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className="field num"
                placeholder="0"
                value={discount.text}
                onChange={(ev) => setDiscount({ ...discount, text: ev.target.value })}
              />
            )}
          </Field>
          <Field label="Motivo del descuento" error={fields.discountReason}>
            {(id) => (
              <input
                id={id}
                className="field"
                maxLength={300}
                value={discount.reason}
                onChange={(ev) => setDiscount({ ...discount, reason: ev.target.value })}
              />
            )}
          </Field>
        </div>
      )}
      <p className="flex justify-between text-lg font-semibold">
        <span>Total</span>
        <span className="num text-gold">{formatBs(total)}</span>
      </p>

      <fieldset>
        <legend className="label">Método de pago</legend>
        <div className="grid grid-cols-4 gap-2">
          {METHODS.map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-sm ${method === m ? 'border-gold/60 bg-gold/10 text-bone' : 'border-white/10 text-muted'}`}
            >
              <input type="radio" name="method" className="sr-only" checked={method === m} onChange={() => setMethod(m)} />
              {METHOD_LABEL[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Monto que paga hoy (Bs.)" error={fields.amount} hint="Vacío = total.">
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              className="field num"
              placeholder={String(total / 100)}
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
            />
          )}
        </Field>
        <Field label="Referencia (opcional)" hint="N.º de transferencia o QR.">
          {(id) => <input id={id} className="field" maxLength={80} value={reference} onChange={(ev) => setReference(ev.target.value)} />}
        </Field>
      </div>

      {shortage && shortage.length > 0 && (
        <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          <p className="font-semibold">Faltan insumos:</p>
          <ul className="mt-1 list-disc pl-5">
            {shortage.map((x) => (
              <li key={x.item}>
                {x.item}: se necesitan {x.need} {x.unit}, hay {x.available}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <Link href="/inventario" className="underline">
              Ir a Inventario
            </Link>{' '}
            o quita del plan lo que no se hará hoy.
          </p>
        </div>
      )}
      {error && !shortage && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn btn-ghost" disabled={pending} onClick={() => submit(false)}>
          Finalizar sin cobrar
        </button>
        <button className="btn btn-primary" disabled={pending} onClick={() => submit(true)}>
          <Wallet size={16} aria-hidden />
          {pending ? 'Guardando…' : 'Cobrar y finalizar'}
        </button>
      </div>
    </div>
  )
}

function Finished({ data, pending, run }: { data: ConsultaData; pending: boolean; run: Run }) {
  const e = data.encounter!
  const doneItems = data.plan.filter((i) => i.completedEncounterId === e.id)
  const todayFindings = data.findings.filter((f) => f.encounterId === e.id)
  const [form, setForm] = useState({ reason: '', notes: '' })
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
      <section className="glass p-5">
        <h2 className="title-gold text-lg">Atención {e.status === 'voided' ? 'anulada' : 'finalizada'}</h2>
        <p className="text-sm text-muted">
          {formatDateTime(e.startedAt)} → {e.finishedAt ? formatDateTime(e.finishedAt) : '—'}
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="eyebrow">Motivo</dt>
            <dd className="mt-1 text-bone">{e.chiefComplaint ?? '—'}</dd>
          </div>
          {e.notes && (
            <div>
              <dt className="eyebrow">Notas</dt>
              <dd className="mt-1 whitespace-pre-line text-bone">{e.notes}</dd>
            </div>
          )}
          <div>
            <dt className="eyebrow">Tratamientos realizados</dt>
            <dd className="mt-1 text-bone">
              {doneItems.length ? doneItems.map((i) => i.treatmentName + (i.tooth ? ` · ${i.tooth}` : '')).join(', ') : '—'}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Hallazgos</dt>
            <dd className="mt-1 text-bone">
              {todayFindings.length ? todayFindings.map((f) => `${f.tooth}: ${CONDITION_LABEL[f.condition]}`).join(', ') : '—'}
            </dd>
          </div>
        </dl>
        {data.invoice && (
          <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3 text-sm">
            <p>
              Factura <span className="num text-bone">{data.invoice.number}</span> · total{' '}
              <span className="num">{formatBs(data.invoice.totalCents)}</span> · cobrado{' '}
              <span className="num text-ok">{formatBs(data.invoice.paidCents)}</span>
            </p>
            {data.invoice.totalCents > data.invoice.paidCents && (
              <p className="mt-1 text-warn">
                Saldo pendiente: <span className="num">{formatBs(data.invoice.totalCents - data.invoice.paidCents)}</span> (se cobra en
                Caja).
              </p>
            )}
          </div>
        )}
      </section>
      <section className="glass p-5">
        <h2 className="title-gold mb-1 text-lg">Addendas</h2>
        <p className="mb-3 text-xs text-muted">
          La historia cerrada no se edita: las correcciones se agregan con motivo y quedan registradas.
        </p>
        {data.addenda.length > 0 && (
          <ul className="mb-4 space-y-2 text-sm">
            {data.addenda.map((x) => (
              <li key={x.id} className="rounded-xl border border-white/8 bg-black/15 p-3">
                <p className="text-xs text-muted">
                  {formatDateTime(x.createdAt)} · {x.author} · {x.reason}
                </p>
                <p className="mt-1 whitespace-pre-line text-bone">{x.notes}</p>
              </li>
            ))}
          </ul>
        )}
        <form
          className="space-y-2"
          onSubmit={(ev) => {
            ev.preventDefault()
            run(
              () => addAddendum({ patientId: data.patient.id, encounterId: e.id, ...form }),
              () => setForm({ reason: '', notes: '' }),
            )
          }}
        >
          <Field label="Motivo">
            {(id) => (
              <input
                id={id}
                className="field"
                maxLength={300}
                value={form.reason}
                onChange={(ev) => setForm({ ...form, reason: ev.target.value })}
              />
            )}
          </Field>
          <Field label="Corrección o nota">
            {(id) => (
              <textarea
                id={id}
                rows={3}
                className="field"
                maxLength={4000}
                value={form.notes}
                onChange={(ev) => setForm({ ...form, notes: ev.target.value })}
              />
            )}
          </Field>
          <button className="btn btn-secondary w-full" disabled={pending || form.reason.trim().length < 3 || !form.notes.trim()}>
            Agregar addenda
          </button>
        </form>
      </section>
    </div>
  )
}
