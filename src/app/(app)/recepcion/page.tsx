'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { CheckCircle2, ExternalLink } from 'lucide-react'
import { useDB, visibleAppointments, todayISO, byId } from '@/lib/data'
import { PageHeader, StatusBadge, Card } from '@/components/ui'

export default function Page() {
  return <Suspense><Recepcion /></Suspense>
}

function Recepcion() {
  const db = useDB()
  const router = useRouter()
  const params = useSearchParams()
  const today = visibleAppointments(db, todayISO()).filter((a) => !['cancelada', 'no_asistio', 'atendida'].includes(a.status))
  const pending = today.filter((a) => ['agendada', 'confirmada'].includes(a.status))
  const id = params.get('cita') || pending[0]?.id
  const a = byId(db.appointments, id)
  const p = a && byId(db.patients, a.patientId)
  const [svg, setSvg] = useState('')
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!id) return
    const u = `${window.location.origin}/check-in?cita=${id}`
    QRCode.toString(u, { type: 'svg', margin: 1, color: { dark: '#1e1f21', light: '#f2eee6' } }).then((s) => {
      setSvg(s)
      setUrl(u)
    })
  }, [id])

  const checkedIn = a && ['en_espera', 'en_atencion'].includes(a.status)
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Recepción" title="Check-in por QR" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.1fr_auto]">
        <Card title="Llegadas de hoy">
          <ul className="space-y-1.5">
            {today.map((x) => (
              <li key={x.id}>
                <button
                  onClick={() => router.replace(`/recepcion?cita=${x.id}`)}
                  aria-current={x.id === id}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ${x.id === id ? 'bg-white/10 ring-1 ring-gold/40' : 'hover:bg-white/5'}`}
                >
                  <span className="min-w-0"><span className="num text-gold-soft">{x.start}</span> <span className="text-bone">{byId(db.patients, x.patientId)?.name}</span></span>
                  <StatusBadge status={x.status} />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <section className="halo glass relative flex flex-col items-center p-6 text-center" aria-live="polite">
          {a && p ? (
            <>
              <p className="eyebrow">Escanea con tu celular</p>
              <h2 className="title-gold mt-1 text-2xl">{p.name}</h2>
              <p className="text-sm text-muted">{a.start} · {byId(db.cabinets, a.cabinetId)?.name} · {byId(db.users, a.dentistId)?.name}</p>
              {checkedIn ? (
                <div className="my-8 flex flex-col items-center gap-3">
                  <CheckCircle2 size={72} className="text-ok drop-shadow-[0_0_16px_rgb(111_214_154/0.5)]" aria-hidden />
                  <p className="text-lg text-bone">En sala de espera</p>
                  <p className="text-sm text-muted">Anamnesis recibida a las <span className="num">{a.checkedInAt}</span>. Se avisó a {byId(db.users, a.dentistId)?.name}.</p>
                </div>
              ) : (
                <div
                  className="my-6 w-full max-w-[260px] overflow-hidden rounded-2xl bg-bone p-3 shadow-[0_0_40px_rgb(201_169_97/0.25)]"
                  role="img"
                  aria-label={`Código QR para el check-in de ${p.name}`}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              )}
              <p className="text-xs text-muted">El paciente llena su anamnesis (alergias, antecedentes, consentimiento) sin papel. Recepción no ve sus datos clínicos.</p>
              {url && (
                <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost mt-3 text-xs">
                  Abrir en otra pestaña <ExternalLink size={13} aria-hidden />
                </a>
              )}
            </>
          ) : (
            <p className="m-auto text-muted">No hay llegadas pendientes hoy.</p>
          )}
        </section>

        {/* Celular del paciente simulado (comparte datos con esta pestaña) */}
        {id && (
          <div className="mx-auto hidden w-[300px] shrink-0 lg:block">
            <p className="eyebrow mb-2 text-center">Celular del paciente (simulado)</p>
            <div className="rounded-[2.6rem] border border-white/15 bg-black p-2.5 shadow-[0_30px_60px_rgb(0_0_0/0.5),inset_0_0_0_1px_rgb(255_255_255/0.06)]">
              <div className="relative overflow-hidden rounded-[2.1rem] bg-ink">
                <div aria-hidden className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
                <iframe key={id} title="Check-in en el celular del paciente" src={`/check-in?cita=${id}&embed=1`} className="block h-[600px] w-full" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
