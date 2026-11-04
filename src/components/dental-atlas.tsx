'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { DentalWorkspace } from './dental-workspace'
import type { Dentition } from '@/lib/teeth'
import type { ToothMark } from './odontogram'
import { listDentalAppointments, loadDentalSession } from '@/server/actions/dental'
import { addFinding, removeFinding, startEncounter } from '@/server/actions/clinical'
import { formatTime, todayLaPaz } from '@/lib/domain/time'
import type { AppointmentCard } from '@/server/queries/types'
import type { ToothCondition } from '@/lib/domain/clinical'

type Session = NonNullable<Awaited<ReturnType<typeof loadDentalSession>>>

export function DentalAtlas() {
  const [date, setDate] = useState(todayLaPaz)
  const [appointments, setAppointments] = useState<AppointmentCard[]>([])
  const [appointmentId, setAppointmentId] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [trialMarks, setTrialMarks] = useState<Record<number, ToothMark>>({})
  const [selected, setSelected] = useState<number>()
  const [dentition, setDentition] = useState<Dentition>('permanente')
  const [surfaces, setSurfaces] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [writing, setWriting] = useState(false)
  const [pending, start] = useTransition()
  useEffect(() => {
    let stale = false
    listDentalAppointments(date)
      .then((items) => {
        if (!stale) {
          setAppointments(items)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!stale) {
          setError('No pudimos cargar las citas. Cambia de fecha para reintentar.')
          setLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [date])
  useEffect(() => {
    if (!appointmentId) return
    let stale = false
    loadDentalSession(appointmentId)
      .then((data) => {
        if (!stale) {
          setSession(data)
          setLoading(false)
          if (!data) setError('No pudimos abrir esta atención.')
        }
      })
      .catch(() => {
        if (!stale) {
          setError('No pudimos abrir la atención. Vuelve a seleccionarla.')
          setLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [appointmentId])
  const marks = useMemo(() => {
    if (!appointmentId) return trialMarks
    const result: Record<number, ToothMark> = {}
    for (const f of session?.findings ?? []) result[f.tooth] = { condition: f.condition, today: f.encounterId === session?.encounter?.id }
    return result
  }, [session, appointmentId, trialMarks])
  const editable = session?.encounter?.status === 'in_progress'
  async function mark(tooth: number, condition: ToothCondition) {
    if (!appointmentId) { setTrialMarks((m) => ({ ...m, [tooth]: { condition, today: true } })); return }
    if (!session?.encounter || !editable) return 'Inicia la atención para registrar hallazgos.'
    setWriting(true)
    try {
      const r = await addFinding({ encounterId: session.encounter.id, patientId: session.patient.id, tooth, condition, surfaces })
      if (!r.ok) return r.error.message
      const finding = {
        tooth,
        condition,
        surfaces: [...surfaces],
        encounterId: session.encounter.id,
        recordedAt: new Date().toISOString(),
        notes: null,
      }
      setSession({
        ...session,
        findings: [...session.findings.filter((f) => f.tooth !== tooth || f.encounterId !== finding.encounterId), finding],
      })
    } finally {
      setWriting(false)
    }
  }
  async function clear(tooth: number) {
    if (!appointmentId) { setTrialMarks((m) => { const next = { ...m }; delete next[tooth]; return next }); return }
    if (!session?.encounter || !editable) return 'Esta atención no se puede editar.'
    setWriting(true)
    try {
      const r = await removeFinding({ encounterId: session.encounter.id, tooth })
      if (!r.ok) return r.error.message
      setSession({ ...session, findings: session.findings.filter((f) => f.tooth !== tooth || f.encounterId !== session.encounter!.id) })
    } finally {
      setWriting(false)
    }
  }
  const startButton = !session?.encounter && session?.canStart ? (
            <button
              className="btn btn-primary ml-3"
              disabled={pending || writing}
              onClick={() =>
                start(async () => {
                  setError('')
                  try {
                    const r = await startEncounter(appointmentId)
                    if (!r.ok) {
                      setError(r.error.message)
                      return
                    }
                    setSession(await loadDentalSession(appointmentId))
                  } catch {
                    setError('No pudimos iniciar la atención. Intenta de nuevo.')
                  }
                })
              }
            >
              {pending ? 'Iniciando…' : 'Iniciar atención'}
            </button>
  ) : null
  return (
    <div className="space-y-4">
      <div className="grid items-end gap-3 sm:grid-cols-[180px_1fr]">
        <label className="text-sm text-muted">
          Fecha de la cita
          <input
            type="date"
            className="field mt-1"
            value={date}
            disabled={pending || writing}
            onChange={(e) => {
              if (!e.target.value) return
              setDate(e.target.value)
              setAppointments([])
              setAppointmentId('')
              setSession(null)
              setSelected(undefined)
              setLoading(true)
              setError('')
            }}
          />
        </label>
        <label className="text-sm text-muted">
          Paciente y atención
          <select
            className="field mt-1"
            value={appointmentId}
            disabled={pending || writing}
            onChange={(e) => {
              setAppointmentId(e.target.value)
              setSession(null)
              setSelected(undefined)
              setSurfaces([])
              setLoading(Boolean(e.target.value))
              setError('')
            }}
          >
            <option value="">Explorar sin paciente</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {formatTime(a.startsAt)} · {a.patient?.fullName ?? 'Sin paciente'} · {a.dentist.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading && (
        <p role="status" className="text-sm text-muted">
          Cargando atención…
        </p>
      )}
      {!loading && !appointments.length && (
        <p className="text-sm text-muted">No hay citas para esta fecha. Puedes explorar el modelo o elegir otra fecha.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      {session ? (
        <div className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-sm">
          <strong>{session.patient.fullName}</strong> ·{' '}
          {editable
            ? 'Atención en curso · los estados se guardan en su historia clínica.'
            : session.encounter
              ? 'Atención cerrada · solo lectura.'
              : 'Inicia la atención para guardar hallazgos.'}
          {startButton}
        </div>
      ) : (
        <p className="text-sm text-muted">Prueba sin paciente: toca un diente para marcar caries, curado u otro estado. Las marcas son temporales. Para guardarlas en una historia clínica, selecciona una atención.</p>
      )}
      <DentalWorkspace
        key={appointmentId}
        marks={marks}
        selected={selected}
        onSelect={(tooth) => {
          setSelected(tooth)
          setSurfaces(session?.findings.filter((f) => f.tooth === tooth).at(-1)?.surfaces ?? [])
        }}
        dentition={dentition}
        onDentitionChange={setDentition}
        initialView="3d"
        onMark={mark}
        onClear={clear}
        surfaces={surfaces}
        onSurfacesChange={setSurfaces}
        disabled={pending || Boolean(appointmentId && (loading || !editable))}
        temporary={!appointmentId}
        editingHint={appointmentId && !editable ? <>{loading ? "Cargando la atención…" : session?.encounter ? "Esta atención está cerrada. Sus registros son de solo lectura." : "Inicia la atención para guardar los hallazgos de este paciente."}{startButton}</> : undefined}
      />
    </div>
  )
}
