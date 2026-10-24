'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { StatusChip, SourceChip } from '../chips'
import { AppointmentPanel } from './appointment-panel'
import { CheckinQrDialog } from './checkin-qr-dialog'
import { changeAppointmentStatus } from '@/server/actions/agenda'
import { formatDayLong, formatTime } from '@/lib/domain/time'
import type { Role } from '@/server/auth/permissions'
import type { AppointmentCard } from '@/server/queries/types'

const POLL_MS = 10_000

export function ReceptionBoard({ date, appointments, role }: { date: string; appointments: AppointmentCard[]; role: Role }) {
  const router = useRouter()
  const [selected, setSelected] = useState<AppointmentCard | null>(null)
  const [qrFor, setQrFor] = useState<AppointmentCard | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  // Se actualiza solo: la sala de espera cambia cuando los pacientes hacen check-in.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setNow(Date.now())
      router.refresh()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [router])

  const waiting = appointments.filter((a) => a.status === 'checked_in').sort((a, b) => (a.checkedInAt ?? '').localeCompare(b.checkedInAt ?? '')) // primero en llegar, primero
  const coming = appointments.filter((a) => a.status === 'scheduled' || a.status === 'confirmed')
  const rest = appointments.filter((a) => !waiting.includes(a) && !coming.includes(a))

  const act = async (a: AppointmentCard, to: 'confirmed' | 'checked_in') => {
    setBusy(a.id)
    setError('')
    const r = await changeAppointmentStatus({ id: a.id, to, expectedUpdatedAt: a.updatedAt })
    setBusy(null)
    if (r.ok) router.refresh()
    else setError(r.error.message)
  }
  const row = (a: AppointmentCard, actions: React.ReactNode) => (
    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 py-3 last:border-0">
      <button className="min-w-0 text-left" onClick={() => setSelected(a)}>
        <span className="num text-gold-soft">{formatTime(a.startsAt)}</span> <span className="text-bone">{a.patient?.fullName ?? 'Paciente'}</span>
        <span className="block text-xs text-muted">{a.treatment?.name ?? '—'} · {a.cabinet.name} · {a.dentist.fullName}</span>
      </button>
      <span className="flex flex-wrap items-center gap-2"><SourceChip source={a.source} campaign={a.campaignName} /><StatusChip status={a.status} />{actions}</span>
    </li>
  )

  return (
    <>
      <div className="mb-6">
        <p className="eyebrow mb-1">Recepción</p>
        <h1 className="title-gold text-3xl md:text-4xl">Llegadas de hoy</h1>
        <p className="mt-1 text-sm text-muted">{formatDayLong(date)} · se actualiza cada 10 segundos</p>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="glass halo relative p-5" aria-labelledby="wait-h">
          <h2 id="wait-h" className="title-gold mb-2 text-lg">En sala de espera <span className="num text-sm text-muted">({waiting.length})</span></h2>
          <ul>
            {waiting.map((a) => row(a, <span className="num text-xs text-warn">espera {Math.max(0, Math.round((now - new Date(a.checkedInAt ?? a.startsAt).getTime()) / 60000))} min</span>))}
            {waiting.length === 0 && <li className="py-3 text-sm text-muted">Nadie esperando.</li>}
          </ul>
        </section>
        <section className="glass p-5" aria-labelledby="come-h">
          <h2 id="come-h" className="title-gold mb-2 text-lg">Por llegar <span className="num text-sm text-muted">({coming.length})</span></h2>
          <ul>
            {coming.map((a) => row(a, (
              <>
                {a.status === 'scheduled' && <button className="btn btn-secondary px-3 py-1 text-xs" disabled={busy === a.id} onClick={() => act(a, 'confirmed')}>Confirmar</button>}
                <button className="btn btn-primary px-3 py-1 text-xs" disabled={busy === a.id} onClick={() => setQrFor(a)}>QR check-in</button>
                <button className="btn btn-ghost px-3 py-1 text-xs" disabled={busy === a.id} onClick={() => act(a, 'checked_in')} title="Registrar la llegada sin ficha digital">Llegó</button>
              </>
            )))}
            {coming.length === 0 && <li className="py-3 text-sm text-muted">No quedan citas por llegar hoy.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted">«QR check-in»: el paciente escanea y llena su ficha en su celular. «Llegó»: registra la llegada sin ficha digital.</p>
        </section>
      </div>
      {rest.length > 0 && (
        <section className="glass mt-5 p-5" aria-labelledby="rest-h">
          <h2 id="rest-h" className="title-gold mb-2 text-lg">Otras citas de hoy</h2>
          <ul>{rest.map((a) => row(a, null))}</ul>
        </section>
      )}
      <CheckinQrDialog appointment={qrFor} onClose={() => { setQrFor(null); router.refresh() }} />
      <AppointmentPanel appointment={selected} role={role} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); router.refresh() }} />
    </>
  )
}
