'use client'

import Link from 'next/link'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { changeAppointmentStatus } from '@/server/actions/agenda'
import { finishCare, startCare, type FinishCareResult } from '@/server/actions/workflow'
import { allowedTransitions, type AppointmentStatus } from '@/lib/domain/status'
import { formatDate, formatTime } from '@/lib/domain/time'
import { formatBs } from '@/lib/domain/money'
import { can, type Role } from '@/server/auth/permissions'
import type { AppointmentCard } from '@/server/queries/types'
import { Modal } from '../ui'

const STAGES: { label: string; statuses: AppointmentStatus[]; dot: string }[] = [
  { label: 'Por llegar', statuses: ['scheduled', 'confirmed'], dot: 'bg-muted' },
  { label: 'En espera', statuses: ['checked_in'], dot: 'bg-warn' },
  { label: 'En consulta', statuses: ['in_progress'], dot: 'bg-gold' },
  { label: 'Atendidos', statuses: ['completed'], dot: 'bg-ok' },
]

type CareAction = 'arrival' | 'start' | 'finish'
const ACTION_LABEL: Record<CareAction, string> = {
  arrival: 'Registrar llegada',
  start: 'Iniciar atención',
  finish: 'Finalizar atención',
}

type FlowProps = { appointments: AppointmentCard[]; role: Role; userId?: string }
type Receipt = FinishCareResult & { appointmentId: string }

function nextAction(appointment: AppointmentCard, role: Role): CareAction | null {
  if (allowedTransitions(appointment.status, role).includes('checked_in')) return 'arrival'
  if (appointment.status === 'checked_in' && can(role, 'encounters.write')) return 'start'
  if (appointment.status === 'in_progress' && can(role, 'encounters.finish')) return 'finish'
  return null
}

function chronology(a: AppointmentCard) {
  return Date.parse(a.status === 'checked_in' ? (a.checkedInAt ?? a.startsAt) : a.startsAt)
}

export function CareFlowBoard(props: FlowProps) {
  return <CareFlow {...props} mode="board" />
}

export function ActiveCareQueue({ onPatientPage = false, ...props }: FlowProps & { onPatientPage?: boolean }) {
  const router = useRouter()
  const watch = !onPatientPage || props.appointments.some((a) => a.status === 'checked_in' || a.status === 'in_progress')
  useEffect(() => {
    if (!watch) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [router, watch])
  return <CareFlow {...props} mode={onPatientPage ? 'patient' : 'queue'} />
}

function CareFlow({ appointments, role, userId, mode }: FlowProps & { mode: 'board' | 'patient' | 'queue' }) {
  const router = useRouter()
  const heading = useId()
  const [isUpdating, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  const [confirmation, setConfirmation] = useState<AppointmentCard | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const running = useRef(false)
  const finishKeys = useRef(new Map<string, string>())
  const canReadConsultation = can(role, 'encounters.read')
  const visible = role === 'dentist' && userId ? appointments.filter((a) => a.dentist.id === userId) : appointments
  const stages = (mode === 'board' ? STAGES : [STAGES[2], STAGES[1]]).map((stage) => ({
    ...stage,
    cards: visible.filter((a) => stage.statuses.includes(a.status)).sort((a, b) => chronology(a) - chronology(b)),
  }))

  function run(a: AppointmentCard, action: CareAction) {
    if (running.current || isUpdating || nextAction(a, role) !== action) return
    running.current = true
    setPendingId(a.id)
    setError(null)
    startTransition(async () => {
      try {
        if (action === 'finish') {
          const key = finishKeys.current.get(a.id) ?? crypto.randomUUID()
          finishKeys.current.set(a.id, key)
          const result = await finishCare({ appointmentId: a.id, idempotencyKey: key })
          if (!result.ok) {
            setError({ id: a.id, message: result.error.message })
            return
          }
          finishKeys.current.delete(a.id)
          setReceipt({ appointmentId: a.id, ...result.data })
          setConfirmation(null)
        } else {
          const result =
            action === 'arrival'
              ? await changeAppointmentStatus({ id: a.id, to: 'checked_in', expectedUpdatedAt: a.updatedAt })
              : await startCare({ appointmentId: a.id })
          if (!result.ok) {
            setError({ id: a.id, message: result.error.message })
            return
          }
        }
        if (action !== 'arrival' && a.patient) {
          window.dispatchEvent(new CustomEvent('alquimia:journal-changed', { detail: { patientId: a.patient.id } }))
        }
        startTransition(() => router.refresh())
      } catch (cause) {
        unstable_rethrow(cause)
        setError({ id: a.id, message: 'No pudimos confirmar el cambio. Revisa tu conexión e inténtalo de nuevo.' })
      } finally {
        running.current = false
        setPendingId(null)
      }
    })
  }

  const hasActiveCards = stages.some((stage) => stage.cards.length > 0)
  if (mode === 'patient' && !hasActiveCards && !confirmation && !receipt) return null

  // Polling can move the appointment while the confirmation is open.
  const current = confirmation && visible.find((a) => a.id === confirmation.id && a.status === 'in_progress')
  const confirmationError = confirmation && error?.id === confirmation.id ? error.message : null

  return (
    <section aria-labelledby={heading} className="rounded-2xl border border-white/8 bg-black/10 p-3 sm:p-4">
      <h2 id={heading} className="mb-3 text-sm font-semibold text-bone">
        {mode === 'board' ? 'Flujo de atención' : mode === 'patient' ? 'Atención del paciente' : 'Cola de atención'}
      </h2>
      {receipt && (
        <div className="mb-3 rounded-xl border border-ok/20 bg-ok/5 p-3 text-sm">
          <p role="status">
            Atención finalizada.
            {receipt.invoiceId && ` Factura generada por ${formatBs(receipt.totalCents)}.`}
            {receipt.pendingSupplyCount > 0 && ` Insumos pendientes: ${receipt.pendingSupplyCount}.`}
          </p>
          {receipt.invoiceId && (
            <Link href={`/consulta/${receipt.appointmentId}`} className="btn btn-secondary mt-2 min-h-11 text-xs">
              Ver factura
            </Link>
          )}
        </div>
      )}
      {mode !== 'patient' || hasActiveCards ? (
        <div className={`grid gap-3 sm:grid-cols-2 ${mode === 'board' ? 'xl:grid-cols-4' : ''}`}>
          {stages
            .filter((stage) => mode !== 'patient' || stage.cards.length > 0)
            .map((stage) => (
              <section key={stage.label} aria-label={stage.label} className="min-w-0 rounded-xl bg-white/3 p-2.5">
                <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-bone">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${stage.dot}`} aria-hidden />
                  {stage.label}
                  <span className="num ml-auto text-muted">{stage.cards.length}</span>
                </h3>
                {stage.cards.length > 0 ? (
                  <ul className="space-y-2">
                    {stage.cards.map((a) => (
                      <li key={a.id}>
                        <CareFlowCard
                          appointment={a}
                          action={nextAction(a, role)}
                          onAction={(action) => (action === 'finish' ? setConfirmation(a) : run(a, action))}
                          disabled={isUpdating || pendingId !== null}
                          busy={pendingId === a.id}
                          error={error?.id === a.id && confirmation?.id !== a.id ? error.message : null}
                          patientPage={mode === 'patient'}
                          canReadConsultation={canReadConsultation}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-1 py-2 text-xs text-muted">Sin citas</p>
                )}
              </section>
            ))}
        </div>
      ) : null}
      {confirmation && (
        <Modal open onClose={() => setConfirmation(null)} title="Finalizar atención">
          <p className="text-sm text-bone">
            {current
              ? `Se cerrará la atención de ${confirmation.patient?.fullName ?? 'este paciente'}. Si corresponde, se emitirá la factura para cobrar en Caja.`
              : 'La cita ya no está en consulta. Revisa el estado actualizado.'}
          </p>
          {confirmationError && (
            <p role="alert" className="mt-3 text-sm text-bad">
              {confirmationError}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-secondary min-h-11" onClick={() => setConfirmation(null)}>
              Volver
            </button>
            <button
              type="button"
              className="btn btn-primary min-h-11"
              disabled={!current || isUpdating || pendingId !== null}
              onClick={() => current && run(current, 'finish')}
            >
              {pendingId === confirmation.id ? 'Finalizando…' : 'Confirmar cierre'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}

function CareFlowCard({
  appointment: a,
  action,
  onAction,
  disabled,
  busy,
  error,
  patientPage,
  canReadConsultation,
}: {
  appointment: AppointmentCard
  action: CareAction | null
  onAction: (action: CareAction) => void
  disabled: boolean
  busy: boolean
  error: string | null
  patientPage: boolean
  canReadConsultation: boolean
}) {
  const name = a.patient?.fullName ?? 'Paciente'
  const hasConsultation = canReadConsultation && (a.status === 'in_progress' || a.status === 'completed')
  return (
    <article className="rounded-lg border border-white/10 bg-ink-2 p-2.5 shadow-sm" aria-label={name} aria-busy={busy}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        {!patientPage && a.patient ? (
          <Link href={`/pacientes/${a.patient.id}`} prefetch={false} className="text-sm font-semibold text-bone hover:underline">
            {name}
          </Link>
        ) : (
          <p className="text-sm font-semibold text-bone">{patientPage ? (a.treatment?.name ?? 'Consulta') : name}</p>
        )}
        <time dateTime={a.startsAt} className="num text-xs text-gold-soft">
          {patientPage && `${formatDate(a.startsAt)} · `}
          {formatTime(a.startsAt)}
        </time>
      </div>
      <p className="mt-1 break-words text-xs text-muted">
        {a.dentist.fullName} · {a.cabinet.name}
      </p>
      {a.checkedInAt && (
        <p className="mt-1 text-xs text-muted">
          Llegó a las{' '}
          <time dateTime={a.checkedInAt} className="num">
            {formatTime(a.checkedInAt)}
          </time>
        </p>
      )}
      {action && (
        <button
          type="button"
          className="btn btn-primary mt-2 min-h-11 w-full px-2.5 text-xs"
          aria-label={`${ACTION_LABEL[action]} · ${name} · ${formatTime(a.startsAt)}`}
          disabled={disabled}
          onClick={() => onAction(action)}
        >
          {busy ? 'Actualizando…' : ACTION_LABEL[action]}
        </button>
      )}
      {hasConsultation && (
        <Link
          href={`/consulta/${a.id}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center text-xs text-gold-soft hover:underline"
        >
          {a.status === 'completed' ? 'Ver atención' : 'Abrir consulta'}
        </Link>
      )}
      {error && (
        <p role="alert" className="mt-2 break-words text-xs text-bad">
          {error}
        </p>
      )}
    </article>
  )
}
