'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { Modal, Field } from '../ui'
import { SourceChip, StatusChip } from '../chips'
import { changeAppointmentStatus, getSlots, rescheduleAppointment } from '@/server/actions/agenda'
import { allowedTransitions, needsReason, STATUS_LABEL, type AppointmentStatus } from '@/lib/domain/status'
import { formatDayLong, formatTime, localDate, todayLaPaz } from '@/lib/domain/time'
import { can, type Role } from '@/server/auth/permissions'
import type { AppointmentCard, Slot } from '@/server/queries/types'

const ACTION: Partial<Record<AppointmentStatus, { label: string; kind: 'primary' | 'secondary' | 'ghost' }>> = {
  confirmed: { label: 'Confirmar', kind: 'secondary' },
  checked_in: { label: 'Llegó (check-in)', kind: 'primary' },
  no_show: { label: 'No asistió', kind: 'ghost' },
  cancelled: { label: 'Cancelar cita', kind: 'ghost' },
  scheduled: { label: 'Reabrir', kind: 'secondary' },
}

export function AppointmentPanel({ appointment: a, role, onClose, onChanged }: {
  appointment: AppointmentCard | null; role: Role; onClose: () => void; onChanged: () => void
}) {
  return (
    <Modal open={!!a} onClose={onClose} title={a?.patient?.fullName ?? 'Cita'}>
      {a && <Body key={a.id + a.updatedAt} a={a} role={role} onChanged={onChanged} />}
    </Modal>
  )
}

function Body({ a, role, onChanged }: { a: AppointmentCard; role: Role; onChanged: () => void }) {
  const [reason, setReason] = useState<{ to: AppointmentStatus; text: string } | null>(null)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const transitions = allowedTransitions(a.status, role)
  const canMove = can(role, 'agenda.manage') && (a.status === 'scheduled' || a.status === 'confirmed')

  const run = async (to: AppointmentStatus, text?: string) => {
    setPending(true)
    setError('')
    try {
      const r = await changeAppointmentStatus({ id: a.id, to, reason: text, expectedUpdatedAt: a.updatedAt })
      if (r.ok) return onChanged()
      setError(r.error.message)
    } catch (error) {
      unstable_rethrow(error)
      setError('No pudimos actualizar la cita. Revisa la agenda antes de intentar de nuevo.')
    } finally { setPending(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={a.status} /><SourceChip source={a.source} campaign={a.campaignName} />
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="eyebrow">Cuándo</dt><dd className="mt-1 text-bone">{formatDayLong(localDate(a.startsAt))} · <span className="num">{formatTime(a.startsAt)}–{formatTime(a.endsAt)}</span></dd></div>
        <div><dt className="eyebrow">Tratamiento</dt><dd className="mt-1 text-bone">{a.treatment?.name ?? '—'}</dd></div>
        <div><dt className="eyebrow">Odontólogo</dt><dd className="mt-1 text-bone">{a.dentist.fullName}</dd></div>
        <div><dt className="eyebrow">Gabinete</dt><dd className="mt-1 text-bone">{a.cabinet.name}</dd></div>
        {a.checkedInAt && <div><dt className="eyebrow">Llegó a las</dt><dd className="num mt-1 text-bone">{formatTime(a.checkedInAt)}</dd></div>}
        {a.notes && <div className="sm:col-span-2"><dt className="eyebrow">Notas</dt><dd className="mt-1 text-bone">{a.notes}</dd></div>}
        {a.cancellationReason && <div className="sm:col-span-2"><dt className="eyebrow">Motivo de cancelación</dt><dd className="mt-1 text-bone">{a.cancellationReason}</dd></div>}
      </dl>

      {error && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

      {reason ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (reason.text.trim().length < 3) return setError('Escribe el motivo (mínimo 3 letras).'); run(reason.to, reason.text) }}>
          <Field label={reason.to === 'cancelled' ? 'Motivo de la cancelación' : 'Motivo para reabrir'}>
            {(id) => <textarea id={id} rows={2} className="field" value={reason.text} onChange={(e) => setReason({ ...reason, text: e.target.value })} maxLength={300} autoFocus />}
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => { setReason(null); setError('') }}>Volver</button>
            <button className="btn btn-primary" disabled={pending}>Confirmar</button>
          </div>
        </form>
      ) : moving ? (
        <Reschedule a={a} onBack={() => setMoving(false)} onDone={onChanged} />
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-4">
          {transitions.map((to) => (
            <button key={to} className={`btn btn-${ACTION[to]?.kind ?? 'secondary'}`} disabled={pending} onClick={() => (needsReason(to) ? setReason({ to, text: '' }) : run(to))}>
              {ACTION[to]?.label ?? STATUS_LABEL[to]}
            </button>
          ))}
          {canMove && <button className="btn btn-secondary" onClick={() => setMoving(true)}>Reprogramar</button>}
          {can(role, 'encounters.read') && a.status !== 'cancelled' && a.status !== 'no_show' && (
            <Link href={`/consulta/${a.id}`} className="btn btn-primary">{a.status === 'completed' ? 'Ver atención' : a.status === 'in_progress' ? 'Continuar atención' : 'Abrir consulta'}</Link>
          )}
          {a.patient && can(role, 'patients.read_directory') && <Link href={`/pacientes/${a.patient.id}`} className="btn btn-ghost ml-auto">Ver paciente →</Link>}
          {transitions.length === 0 && !canMove && <p className="text-sm text-muted">No hay acciones disponibles para tu rol en este estado.</p>}
        </div>
      )}
    </div>
  )
}

function Reschedule({ a, onBack, onDone }: { a: AppointmentCard; onBack: () => void; onDone: () => void }) {
  const [date, setDate] = useState(localDate(a.startsAt) < todayLaPaz() ? todayLaPaz() : localDate(a.startsAt))
  const [loaded, setLoaded] = useState<{ date: string; slots: Slot[]; error?: string } | null>(null)
  const [pick, setPick] = useState<(Slot & { date: string }) | null>(null)
  const requestId = useRef(0)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [started, setStarted] = useState(false)

  const load = async (d: string) => {
    const id = ++requestId.current
    setPick(null)
    setLoaded(null)
    setStarted(true)
    if (!a.treatment) return setLoaded({ date: d, slots: [], error: 'Esta cita no tiene tratamiento. Cancélala y crea una nueva.' })
    try {
      const r = await getSlots({ treatmentId: a.treatment.id, from: d, to: d, dentistId: a.dentist.id })
      if (id === requestId.current) setLoaded({ date: d, slots: r.ok ? r.data : [], error: r.ok ? undefined : r.error.message })
    } catch (error) {
      unstable_rethrow(error)
      if (id === requestId.current) setLoaded({ date: d, slots: [], error: 'No pudimos cargar los horarios. Intenta de nuevo.' })
    }
  }
  const save = async () => {
    if (pending) return
    if (!pick || pick.date !== date || loaded?.date !== date) return setError('Elige un horario.')
    setPending(true)
    setError('')
    try {
      const r = await rescheduleAppointment({ id: a.id, startsAt: pick.start, cabinetId: pick.cabinetId, expectedUpdatedAt: a.updatedAt })
      if (r.ok) return onDone()
      setError(r.error.message)
      await load(date)
    } catch (error) {
      unstable_rethrow(error)
      setError('No pudimos reprogramar la cita. Revisa la agenda antes de intentar de nuevo.')
    } finally { setPending(false) }
  }
  return (
    <div className="space-y-3 border-t border-white/8 pt-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Nueva fecha">{(id) => <input id={id} type="date" min={todayLaPaz()} className="field" value={date} disabled={pending} onChange={(e) => { requestId.current++; setDate(e.target.value); setPick(null); setLoaded(null); setStarted(false); setError('') }} />}</Field>
        <button type="button" className="btn btn-secondary" disabled={pending || !date} onClick={() => load(date)}>Ver horarios</button>
      </div>
      {started && (loaded?.date === date ? (
        loaded.error ? <p role="alert" className="text-sm text-bad">{loaded.error}</p> :
        loaded.slots.length === 0 ? <p className="text-sm text-muted">No hay horarios libres ese día con {a.dentist.fullName}.</p> : (
          <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
            {loaded.slots.map((s) => (
              <button key={s.start} type="button" disabled={pending} aria-pressed={pick?.start === s.start} onClick={() => { setPick({ ...s, date }); setError('') }}
                className={`num rounded-xl border px-2 py-1.5 text-sm ${pick?.start === s.start ? 'border-azure bg-azure/15 text-bone' : 'border-white/10 text-muted hover:border-white/30'}`}>{formatTime(s.start)}</button>
            ))}
          </div>
        )
      ) : <p className="text-sm text-muted" aria-busy="true">Buscando…</p>)}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>Volver</button>
        <button className="btn btn-primary" disabled={pending || !pick || pick.date !== date || loaded?.date !== date} onClick={save}>Guardar cambio</button>
      </div>
    </div>
  )
}
