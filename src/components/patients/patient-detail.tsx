'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarPlus, Pencil } from 'lucide-react'
import { Modal } from '../ui'
import { SourceChip, StatusChip } from '../chips'
import { PatientForm } from './patient-form'
import { PATIENT_STATUS_LABEL } from './patients-view'
import { AppointmentDialog } from '../agenda/appointment-dialog'
import { formatDate, formatTime } from '@/lib/domain/time'
import { formatPhone } from '@/lib/domain/phone'
import type { BookingOptions, PatientDetail } from '@/server/queries/types'

export function PatientDetailView({ patient: p, options, canEdit, canBook, canAssignDentist, clinical }: {
  patient: PatientDetail; options: BookingOptions; canEdit: boolean; canBook: boolean; canAssignDentist: boolean
  /** Bloque clinico: el servidor solo lo arma para roles que pueden verlo; para recepcion ni siquiera viaja al navegador. */
  clinical?: React.ReactNode
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [booking, setBooking] = useState(false)
  const upcoming = p.appointments.filter((a) => ['scheduled', 'confirmed', 'checked_in', 'in_progress'].includes(a.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const past = p.appointments.filter((a) => !upcoming.includes(a))
  const Row = ({ a }: { a: PatientDetail['appointments'][number] }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 py-2.5 text-sm last:border-0">
      <span><span className="num text-gold-soft">{formatDate(a.startsAt)} {formatTime(a.startsAt)}</span> · <span className="text-bone">{a.treatment?.name ?? '—'}</span> · <span className="text-muted">{a.dentist.fullName}</span></span>
      <span className="flex gap-1.5"><SourceChip source={a.source} campaign={a.campaignName} /><StatusChip status={a.status} /></span>
    </li>
  )
  return (
    <>
      <Link href="/pacientes" className="btn btn-ghost -ml-3 mb-2 text-xs"><ArrowLeft size={14} aria-hidden />Pacientes</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Ficha del paciente · {PATIENT_STATUS_LABEL[p.status]}</p>
          <h1 className="title-gold text-3xl md:text-4xl">{p.fullName}</h1>
        </div>
        <div className="flex gap-2">
          {canEdit && <button className="btn btn-secondary" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden />Editar</button>}
          {canBook && <button className="btn btn-primary" onClick={() => setBooking(true)}><CalendarPlus size={16} aria-hidden />Nueva cita</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <section className="glass h-fit p-5">
          <h2 className="title-gold mb-3 text-lg">Datos</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="eyebrow">Celular</dt><dd className="num mt-1 text-bone">{formatPhone(p.phone)}</dd></div>
            {p.email && <div><dt className="eyebrow">Correo</dt><dd className="mt-1 text-bone">{p.email}</dd></div>}
            <div><dt className="eyebrow">Nacimiento</dt><dd className="mt-1 text-bone">{p.birthDate ? p.birthDate.split('-').reverse().join('/') : '—'}</dd></div>
            <div><dt className="eyebrow">Zona</dt><dd className="mt-1 text-bone">{p.zone ?? '—'}</dd></div>
            {p.address && <div><dt className="eyebrow">Dirección</dt><dd className="mt-1 text-bone">{p.address}</dd></div>}
            <div><dt className="eyebrow">Odontólogo asignado</dt><dd className="mt-1 text-bone">{p.primaryDentistName ?? 'Sin asignar'}</dd></div>
            <div><dt className="eyebrow">Origen de captación</dt><dd className="mt-1 flex flex-wrap items-center gap-2 text-bone"><SourceChip source={p.firstSource} />{p.campaignName}</dd></div>
          </dl>
        </section>

        <div className="space-y-5">
          {clinical}
          <section className="glass p-5">
            <h2 className="title-gold mb-2 text-lg">Próximas citas</h2>
            {upcoming.length ? <ul>{upcoming.map((a) => <Row key={a.id} a={a} />)}</ul> : <p className="text-sm text-muted">Sin citas próximas.</p>}
          </section>
          <section className="glass p-5">
            <h2 className="title-gold mb-2 text-lg">Historial de citas</h2>
            {past.length ? <ul>{past.map((a) => <Row key={a.id} a={a} />)}</ul> : <p className="text-sm text-muted">Todavía no hay citas pasadas.</p>}
          </section>
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Editar paciente">
        {editing && (
          <PatientForm
            mode="edit" options={options} canAssignDentist={canAssignDentist} patientId={p.id} expectedUpdatedAt={p.updatedAt} onDone={() => setEditing(false)}
            initial={{ fullName: p.fullName, phone: p.phone ?? '', email: p.email ?? '', birthDate: p.birthDate ?? '', sex: p.sex ?? '', zone: p.zone ?? '', address: p.address ?? '', primaryDentistId: p.primaryDentistId ?? '' }}
          />
        )}
      </Modal>
      <AppointmentDialog open={booking} onClose={() => setBooking(false)} options={options} preset={{ patient: { id: p.id, fullName: p.fullName, phone: p.phone } }} onCreated={() => { setBooking(false); router.refresh() }} />
    </>
  )
}
