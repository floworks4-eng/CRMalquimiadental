'use client'
import { useState, type FormEvent } from 'react'
import {
  useDB, createAppointment, updateAppointment, byId, todayISO, STATUS_LABEL, SOURCE_LABEL,
  type Appointment, type ApptStatus, type Source,
} from '@/lib/data'
import { Modal, Field } from './ui'

export const PHONE_RE = /^\+?591[67]\d{7}$/
const clean = (s: string) => s.replace(/[\s-]/g, '')

type Draft = Omit<Appointment, 'id' | 'createdAt' | 'patientId' | 'status'> & { patientId: string; newName: string; newPhone: string; status: ApptStatus }

export function AppointmentModal({ open, onClose, appt, preset }: {
  open: boolean
  onClose: () => void
  appt?: Appointment
  preset?: Partial<Appointment>
}) {
  return (
    <Modal open={open} onClose={onClose} title={appt ? 'Editar o mover cita' : 'Nueva cita'}>
      {open && <Form appt={appt} preset={preset} onDone={onClose} />}
    </Modal>
  )
}

function Form({ appt, preset, onDone }: { appt?: Appointment; preset?: Partial<Appointment>; onDone: () => void }) {
  const db = useDB()
  const role = db.session!.role
  const dentists = db.users.filter((u) => u.role !== 'recepcion' && (role !== 'odontologo' || u.id === db.session!.userId))
  const [d, setD] = useState<Draft>(() => ({
    patientId: appt?.patientId ?? '',
    newName: '',
    newPhone: '',
    dentistId: appt?.dentistId ?? preset?.dentistId ?? dentists[0].id,
    cabinetId: appt?.cabinetId ?? preset?.cabinetId ?? db.cabinets[0].id,
    date: appt?.date ?? preset?.date ?? todayISO(),
    start: appt?.start ?? preset?.start ?? '09:00',
    duration: appt?.duration ?? 30,
    procedureId: appt?.procedureId ?? 'consulta',
    source: appt?.source ?? 'whatsapp',
    campaignId: appt?.campaignId,
    status: appt?.status ?? 'confirmada',
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState('')
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const isNew = d.patientId === '__new'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (!d.patientId) err.patientId = 'Elige un paciente o crea uno nuevo.'
    if (isNew && d.newName.trim().length < 5) err.newName = 'Escribe nombre y apellido.'
    if (isNew && !PHONE_RE.test(clean(d.newPhone))) err.newPhone = 'Formato: +591 7XXXXXXX (8 dígitos que empiezan con 6 o 7).'
    if (!d.date) err.date = 'Elige una fecha.'
    if (!/^\d{2}:\d{2}$/.test(d.start)) err.start = 'Elige una hora.'
    else if (+d.start.slice(3) % 15) err.start = 'Usa intervalos de 15 minutos.'
    if (d.source === 'campaign' && !d.campaignId) err.campaignId = 'Indica la campaña de origen.'
    setErrors(err)
    setConflict('')
    if (Object.keys(err).length) return
    const base = {
      dentistId: d.dentistId, cabinetId: d.cabinetId, date: d.date, start: d.start, duration: d.duration,
      procedureId: d.procedureId, source: d.source, campaignId: d.source === 'campaign' ? d.campaignId : undefined,
    }
    const res = appt
      ? updateAppointment(appt.id, { ...base, status: d.status })
      : createAppointment({
          ...base,
          status: d.status,
          ...(isNew ? { newPatient: { name: d.newName.trim(), phone: d.newPhone.trim() } } : { patientId: d.patientId }),
        })
    if (res.error) setConflict(res.error)
    else onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Paciente" error={errors.patientId}>
          {(id, desc) => (
            <select id={id} aria-describedby={desc} aria-invalid={!!errors.patientId} className="field" value={d.patientId} disabled={!!appt}
              onChange={(e) => set('patientId', e.target.value)}>
              <option value="">Seleccionar…</option>
              {!appt && <option value="__new">+ Paciente nuevo</option>}
              {db.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </Field>
      </div>
      {isNew && (
        <>
          <Field label="Nombre completo" error={errors.newName}>
            {(id, desc) => <input id={id} aria-describedby={desc} aria-invalid={!!errors.newName} className="field" autoComplete="off" value={d.newName} onChange={(e) => set('newName', e.target.value)} />}
          </Field>
          <Field label="Celular (WhatsApp)" error={errors.newPhone} hint="Ficticio en la demo">
            {(id, desc) => <input id={id} aria-describedby={desc} aria-invalid={!!errors.newPhone} className="field" inputMode="tel" placeholder="+591 7XXXXXXX" value={d.newPhone} onChange={(e) => set('newPhone', e.target.value)} />}
          </Field>
        </>
      )}
      <Field label="Tratamiento">
        {(id) => (
          <select id={id} className="field" value={d.procedureId}
            onChange={(e) => setD((x) => ({ ...x, procedureId: e.target.value, duration: byId(db.procedures, e.target.value)!.minutes }))}>
            {db.procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </Field>
      <Field label="Odontólogo">
        {(id) => (
          <select id={id} className="field" value={d.dentistId} onChange={(e) => set('dentistId', e.target.value)}>
            {dentists.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </Field>
      <Field label="Gabinete">
        {(id) => (
          <select id={id} className="field" value={d.cabinetId} onChange={(e) => set('cabinetId', e.target.value)}>
            {db.cabinets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </Field>
      <Field label="Fecha" error={errors.date}>
        {(id, desc) => <input id={id} type="date" aria-describedby={desc} aria-invalid={!!errors.date} className="field" value={d.date} onChange={(e) => set('date', e.target.value)} />}
      </Field>
      <Field label="Hora" error={errors.start} hint="Atención 08:00–20:00">
        {(id, desc) => <input id={id} type="time" step={900} min="08:00" max="19:45" aria-describedby={desc} aria-invalid={!!errors.start} className="field" value={d.start} onChange={(e) => set('start', e.target.value)} />}
      </Field>
      <Field label="Duración">
        {(id) => (
          <select id={id} className="field" value={d.duration} onChange={(e) => set('duration', +e.target.value)}>
            {[30, 40, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        )}
      </Field>
      <Field label="Origen (atribución)">
        {(id) => (
          <select id={id} className="field" value={d.source} onChange={(e) => set('source', e.target.value as Source)}>
            {(['whatsapp', 'web', 'campaign'] as const).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        )}
      </Field>
      {d.source === 'campaign' && (
        <Field label="Campaña" error={errors.campaignId}>
          {(id, desc) => (
            <select id={id} aria-describedby={desc} aria-invalid={!!errors.campaignId} className="field" value={d.campaignId ?? ''} onChange={(e) => set('campaignId', e.target.value || undefined)}>
              <option value="">Seleccionar…</option>
              {db.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
      )}
      <Field label="Estado">
        {(id) => (
          <select id={id} className="field" value={d.status} onChange={(e) => set('status', e.target.value as ApptStatus)}>
            {(Object.keys(STATUS_LABEL) as ApptStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        )}
      </Field>
      {conflict && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad sm:col-span-2">⚠ {conflict}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button type="submit" className="btn btn-primary">{appt ? 'Guardar cambios' : 'Confirmar cita'}</button>
      </div>
    </form>
  )
}
