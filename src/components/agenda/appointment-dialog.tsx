'use client'
import { useEffect, useState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { Modal, Field } from '../ui'
import { createAppointment, getSlots } from '@/server/actions/agenda'
import { createQuickPatient, listRecentPatientPicker, searchPatientPicker } from '@/server/actions/patients'
import { formatPhone } from '@/lib/domain/phone'
import { formatDayLong, formatTime, localDate, todayLaPaz } from '@/lib/domain/time'
import { SOURCE_LABEL } from '@/lib/domain/status'
import type { BookingOptions, Slot } from '@/server/queries/types'

type Patient = { id: string; fullName: string; phone?: string | null }
export type DialogPreset = { patient?: Patient; date?: string; startsAt?: string; dentistId?: string; cabinetId?: string }
const SOURCES = ['phone', 'whatsapp', 'walk_in', 'referral', 'web', 'campaign'] as const

export function AppointmentDialog({
  open,
  onClose,
  options,
  preset,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  options: BookingOptions
  preset?: DialogPreset
  onCreated: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Nueva cita" wide>
      {open && <Form key={JSON.stringify(preset ?? {})} options={options} preset={preset} onCancel={onClose} onCreated={onCreated} />}
    </Modal>
  )
}

function Form({
  options,
  preset,
  onCancel,
  onCreated,
}: {
  options: BookingOptions
  preset?: DialogPreset
  onCancel: () => void
  onCreated: () => void
}) {
  const [patient, setPatient] = useState<Patient | null>(preset?.patient ?? null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ q: string; items: Patient[] } | null>(null)
  const [creatingPatient, setCreatingPatient] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [patientError, setPatientError] = useState('')
  const [treatmentId, setTreatmentId] = useState(
    options.treatments.find((t) => t.name.startsWith('Consulta'))?.id ?? options.treatments[0]?.id ?? '',
  )
  const [dentistId, setDentistId] = useState(preset?.dentistId ?? '')
  const [date, setDate] = useState(preset?.date ?? todayLaPaz())
  const [loaded, setLoaded] = useState<{ key: string; slots: Slot[]; error?: string } | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [source, setSource] = useState<(typeof SOURCES)[number]>('phone')
  const [campaignId, setCampaignId] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [alternatives, setAlternatives] = useState<Slot[]>([])
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)

  const key = `${treatmentId}|${date}|${dentistId}|${reload}`
  const loading = !!treatmentId && !!date && loaded?.key !== key
  const slots = loaded?.key === key ? loaded.slots : []
  const dentistName = (id: string) => options.dentists.find((d) => d.id === id)?.fullName ?? '—'

  // Lista reciente al abrir y busqueda con debounce; ninguna respuesta vieja cambia la seleccion.
  useEffect(() => {
    if (patient || creatingPatient) return
    let stale = false
    if (q.trim().length === 1) return
    const t = setTimeout(() => {
      const search = q.trim() ? searchPatientPicker(q) : listRecentPatientPicker()
      search.then((items) => { if (!stale) setFound({ q, items }) }).catch(() => { if (!stale) setPatientError('No pudimos buscar pacientes. Intenta de nuevo.') })
    }, q.trim() ? 250 : 0)
    return () => { stale = true; clearTimeout(t) }
  }, [q, patient, creatingPatient])

  const createPatientHere = async () => {
    setPatientError('')
    setSaving(true)
    try {
      const r = await createQuickPatient({ fullName: newName, phone: newPhone, firstSource: source })
      if (!r.ok) { setPatientError(r.error.fields?.fullName ?? r.error.fields?.phone ?? r.error.message); return }
      setPatient(r.data)
      setCreatingPatient(false)
      setErrors((e) => ({ ...e, patient: '' }))
    } catch {
      setPatientError('No pudimos crear al paciente. Intenta de nuevo.')
    } finally { setSaving(false) }
  }

  // Horarios libres para el tratamiento, dia y odontologo elegidos.
  useEffect(() => {
    if (!treatmentId || !date) return
    let stale = false
    getSlots({ treatmentId, from: date, to: date, dentistId: dentistId || undefined }).then((r) => {
      if (stale) return
      setLoaded({ key, slots: r.ok ? r.data : [], error: r.ok ? undefined : r.error.message })
      if (r.ok && preset?.startsAt)
        setSlot(
          (cur) =>
            cur ??
            r.data.find(
              (s) =>
                new Date(s.start).getTime() === new Date(preset.startsAt!).getTime() &&
                (!preset.cabinetId || s.cabinetId === preset.cabinetId),
            ) ??
            null,
        )
    }).catch((error: unknown) => {
      unstable_rethrow(error)
      if (!stale) setLoaded({ key, slots: [], error: 'No pudimos cargar los horarios. Intenta de nuevo.' })
    })
    return () => {
      stale = true
    }
  }, [key, treatmentId, date, dentistId, preset?.startsAt, preset?.cabinetId])

  const pick = (s: Slot) => {
    setSlot(s)
    setErrors((e) => ({ ...e, slot: '' }))
    setFormError('')
  }
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (saving) return
    const err: Record<string, string> = {}
    if (!patient) err.patient = 'Elige un paciente.'
    if (!treatmentId) err.treatment = 'Elige un tratamiento.'
    if (!slot) err.slot = 'Elige un horario.'
    if (source === 'campaign' && !campaignId) err.campaign = 'Elige la campaña.'
    setErrors(err)
    if (Object.keys(err).length || !patient || !slot) return
    setSaving(true)
    setFormError('')
    try {
      const r = await createAppointment({
        patientId: patient.id,
        treatmentId,
        dentistId: slot.dentistId,
        cabinetId: slot.cabinetId,
        startsAt: slot.start,
        source,
        campaignId: source === 'campaign' ? campaignId : '',
        notes,
      })
      if (r.ok) return onCreated()
      setFormError(r.error.message)
      setAlternatives(r.error.code === 'SLOT_TAKEN' && Array.isArray(r.error.data) ? (r.error.data as Slot[]) : [])
      if (r.error.code === 'SLOT_TAKEN') {
        setSlot(null)
        setReload((n) => n + 1) // vuelve a pedir los horarios libres
      }
      for (const [k, v] of Object.entries(r.error.fields ?? {})) setErrors((e) => ({ ...e, [k]: v }))
    } catch (error) {
      unstable_rethrow(error)
      setFormError('No pudimos confirmar la cita. Revisa la agenda antes de intentar de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const when = (s: Slot) => `${formatDayLong(localDate(s.start))} · ${formatTime(s.start)} · ${dentistName(s.dentistId)}`
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        {patient ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/5 px-3 py-2">
            <span>
              <span className="eyebrow block">Paciente</span>
              <span className="text-bone">{patient.fullName}</span>
              {patient.phone !== undefined && <span className="num ml-2 text-xs text-muted">{formatPhone(patient.phone ?? null)}</span>}
            </span>
            {!preset?.patient && (
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => {
                  setPatient(null)
                  setQ('')
                }}
              >
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <Field label="Paciente" error={errors.patient} hint="Escribe al menos 2 letras del nombre o parte del celular">
            {(id, d) => (
              <>
                <input
                  id={id}
                  aria-describedby={d}
                  aria-invalid={!!errors.patient}
                  className="field"
                  autoComplete="off"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPatientError('') }}
                />
                {patientError && <p role="alert" className="mt-2 text-sm text-bad">{patientError}</p>}
                {creatingPatient ? (
                  <div className="mt-2 space-y-3 rounded-xl border border-gold/30 bg-gold/5 p-3">
                    <p className="text-sm font-medium">Paciente nuevo</p>
                    <label className="block text-xs text-muted">Nombre
                      <input className="field mt-1" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} autoFocus />
                    </label>
                    <label className="block text-xs text-muted">Celular (opcional)
                      <input className="field mt-1" value={newPhone} inputMode="tel" placeholder="+591 7XXXXXXX" onChange={(e) => setNewPhone(e.target.value)} />
                    </label>
                    <p className="text-xs text-muted">La ficha se crea con estos datos. Puedes completarla después en Pacientes.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn btn-primary" disabled={saving} onClick={createPatientHere}>{saving ? 'Creando…' : 'Crear y seleccionar'}</button>
                      <button type="button" className="btn btn-ghost" onClick={() => { setCreatingPatient(false); setPatientError('') }}>Volver a la lista</button>
                    </div>
                  </div>
                ) : found && found.q === q && (
                  <ul className="mt-2 space-y-1" aria-label={q.trim() ? 'Resultados' : 'Pacientes recientes'}>
                    {!q.trim() && <li className="pb-1 text-xs text-muted">Pacientes recientes</li>}
                    {found.items.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-left text-sm hover:border-gold/50"
                          onClick={() => setPatient(p)}
                        >
                          <span className="text-bone">{p.fullName}</span>
                          <span className="num text-muted">{formatPhone(p.phone ?? null)}</span>
                        </button>
                      </li>
                    ))}
                    {found.items.length === 0 && <li className="text-sm text-muted">No encontramos pacientes con ese nombre o celular.</li>}
                  </ul>
                )}
                {!creatingPatient && <button type="button" className="btn btn-secondary mt-2 min-h-11 text-xs" onClick={() => { setNewName(q); setCreatingPatient(true); setPatientError('') }}>+ Crear paciente nuevo</button>}
              </>
            )}
          </Field>
        )}
      </div>

      <Field label="Tratamiento" error={errors.treatment}>
        {(id, d) => (
          <select
            id={id}
            aria-describedby={d}
            className="field"
            disabled={options.treatments.length === 0}
            value={treatmentId}
            onChange={(e) => {
              setTreatmentId(e.target.value)
              setSlot(null)
            }}
          >
            {options.treatments.length === 0 && <option value="">Aún no hay tratamientos activos</option>}
            {options.treatments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.durationMin} min
              </option>
            ))}
          </select>
        )}
      </Field>
      {options.treatments.length === 0 && <p className="text-xs text-warn sm:col-span-2">Para confirmar citas, un administrador debe cargar un tratamiento en Configuración → Tratamientos. Puedes crear y seleccionar al paciente ahora.</p>}
      <Field label="Odontólogo">
        {(id) => (
          <select
            id={id}
            className="field"
            value={dentistId}
            onChange={(e) => {
              setDentistId(e.target.value)
              setSlot(null)
            }}
          >
            <option value="">Cualquiera disponible</option>
            {options.dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Fecha">
        {(id) => (
          <input
            id={id}
            type="date"
            min={todayLaPaz()}
            className="field"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setSlot(null)
            }}
          />
        )}
      </Field>

      <fieldset className="sm:col-span-2" aria-describedby={errors.slot ? 'slot-err' : undefined}>
        <legend className="label">Horarios libres · {date ? formatDayLong(date) : ''}</legend>
        {loading ? (
          <p className="text-sm text-muted" aria-busy="true">
            Buscando horarios…
          </p>
        ) : loaded?.error ? (
          <p role="alert" className="text-sm text-bad">
            {loaded.error}
          </p>
        ) : !treatmentId ? (
          <p className="text-sm text-muted">Los horarios aparecerán cuando haya un tratamiento activo.</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted">No hay horarios libres ese día con esos filtros. Prueba otra fecha u otro odontólogo.</p>
        ) : (
          <div className="grid max-h-44 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {slots.map((s) => {
              const on = slot?.start === s.start && slot.dentistId === s.dentistId
              return (
                <button
                  key={`${s.start}-${s.dentistId}`}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(s)}
                  className={`rounded-xl border px-2 py-1.5 text-center text-sm ${on ? 'border-azure bg-azure/15 text-bone' : 'border-white/10 text-muted hover:border-white/30'}`}
                >
                  <span className="num block text-bone">{formatTime(s.start)}</span>
                  {!dentistId && (
                    <span className="block truncate text-[0.65rem]">{dentistName(s.dentistId).replace(/^Dra?\.\s*/, '')}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {errors.slot && (
          <p id="slot-err" role="alert" className="mt-1 text-xs text-bad">
            {errors.slot}
          </p>
        )}
      </fieldset>

      <Field label="Origen">
        {(id) => (
          <select id={id} className="field" value={source} onChange={(e) => setSource(e.target.value as (typeof SOURCES)[number])}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {source === 'campaign' && (
        <Field label="Campaña" error={errors.campaign}>
          {(id, d) => (
            <select
              id={id}
              aria-describedby={d}
              aria-invalid={!!errors.campaign}
              className="field"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">Elegir…</option>
              {options.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <div className="sm:col-span-2">
        <Field label="Notas (opcional)" error={errors.notes}>
          {(id, d) => (
            <textarea
              id={id}
              rows={2}
              aria-describedby={d}
              className="field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          )}
        </Field>
      </div>

      {formError && (
        <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad sm:col-span-2">
          <p>{formError}</p>
          {alternatives.length > 0 && (
            <div className="mt-2">
              <p className="text-bone">Horarios cercanos libres:</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {alternatives.map((s) => (
                  <button
                    key={s.start + s.dentistId}
                    type="button"
                    className="btn btn-secondary px-3 py-1 text-xs"
                    onClick={() => {
                      setDate(localDate(s.start))
                      setSlot(s)
                      setFormError('')
                      setAlternatives([])
                    }}
                  >
                    {when(s)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={saving || !treatmentId}>
          {saving ? 'Guardando…' : 'Confirmar cita'}
        </button>
      </div>
    </form>
  )
}
