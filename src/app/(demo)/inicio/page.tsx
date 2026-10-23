'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, QrCode, Stethoscope, Clock } from 'lucide-react'
import {
  useDB, visibleAppointments, todayISO, nowHM, fechaLarga, byId, bs, startConsult, toMin, sessionUser,
  METHOD_LABEL, type DB, type Appointment, type PayMethod,
} from '@/lib/data'
import { Card, StatusBadge, SourceChip, Stat, Bar, Avatar } from '@/components/ui'

export default function Inicio() {
  const db = useDB()
  const router = useRouter()
  const role = db.session!.role
  const user = sessionUser(db)!
  const today = todayISO()
  const appts = visibleAppointments(db, today).filter((a) => a.status !== 'cancelada')
  const waiting = appts.filter((a) => a.status === 'en_espera').sort((a, b) => (b.checkedInAt ?? '').localeCompare(a.checkedInAt ?? ''))
  const inCare = appts.filter((a) => a.status === 'en_atencion')
  const upcoming = appts.filter((a) => ['agendada', 'confirmada'].includes(a.status))
  const h = +nowHM().slice(0, 2)
  const hello = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
  const name = role === 'admin' ? 'Doc' : user.name.split(' ').slice(0, 2).join(' ')
  const tx = db.transactions.filter((t) => t.date === today)
  const income = tx.filter((t) => t.kind === 'ingreso').reduce((s, t) => s + t.amount, 0)
  const open = toMin('20:00') - toMin('08:00')
  const occupancy = Math.round((appts.reduce((s, a) => s + a.duration, 0) / (open * db.cabinets.length)) * 100)
  const clinical = role !== 'recepcion'

  const start = (a: Appointment) => {
    startConsult(a.id)
    router.push(`/consulta/${a.id}`)
  }
  const next = waiting[0]

  return (
    <div className="fade-in">
      <div className="mb-6">
        <p className="eyebrow mb-1">{fechaLarga(today)} · La Paz</p>
        <h1 className="title-gold text-4xl md:text-5xl">{hello}, {name}</h1>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Citas de hoy" value={appts.length} hint={`${appts.filter((a) => a.status === 'atendida').length} atendidas`} />
        <Stat label="En sala de espera" value={waiting.length} hint={inCare.length ? `${inCare.length} en atención` : 'nadie en atención'} />
        {role === 'odontologo' ? (
          <Stat label="Próxima cita" value={upcoming[0]?.start ?? '—'} hint={upcoming[0] ? byId(db.patients, upcoming[0].patientId)?.name.split(' ').slice(0, 2).join(' ') : 'sin pendientes'} />
        ) : (
          <Stat label="Ingresos de hoy" value={bs(income)} hint={`${tx.filter((t) => t.kind === 'ingreso').length} cobros`} />
        )}
        {role === 'admin' ? (
          <Stat label="Ocupación de sillones" value={occupancy + ' %'} hint={`${db.cabinets.length} gabinetes · 08:00–20:00`} />
        ) : (
          <Stat label="Por confirmar" value={appts.filter((a) => a.status === 'agendada').length} hint="recordatorio 24 h enviado" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Próxima cita activa */}
          <section className="halo glass relative overflow-hidden p-6" aria-labelledby="next-title">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />
            <p id="next-title" className="eyebrow">Próxima cita activa</p>
            {next ? (
              <NextPatient db={db} a={next} clinical={clinical}>
                {clinical ? (
                  <button className="btn btn-primary btn-xl mt-6 w-full sm:w-auto" onClick={() => start(next)}>
                    <Stethoscope size={20} aria-hidden /> INICIAR ATENCIÓN MÉDICA
                  </button>
                ) : (
                  <p className="mt-5 text-sm text-muted">Avisado a {byId(db.users, next.dentistId)?.name}. La atención la inicia el odontólogo.</p>
                )}
              </NextPatient>
            ) : upcoming[0] ? (
              <NextPatient db={db} a={upcoming[0]} clinical={clinical}>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {clinical && (
                    <button className="btn btn-primary btn-xl" disabled aria-describedby="wait-hint">
                      <Stethoscope size={20} aria-hidden /> INICIAR ATENCIÓN MÉDICA
                    </button>
                  )}
                  {role !== 'odontologo' && (
                    <Link href={`/recepcion?cita=${upcoming[0].id}`} className="btn btn-secondary"><QrCode size={16} aria-hidden />Mostrar QR de check-in</Link>
                  )}
                  <p id="wait-hint" className="text-sm text-muted">Se activa cuando el paciente hace check-in.</p>
                </div>
              </NextPatient>
            ) : (
              <p className="mt-3 text-muted">No quedan pacientes por atender hoy.</p>
            )}
            {(waiting.length > 1 || inCare.length > 0) && (
              <ul className="mt-6 space-y-2 border-t border-white/8 pt-4 text-sm">
                {waiting.slice(1).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span><span className="num text-muted">{a.start}</span> · {byId(db.patients, a.patientId)?.name} <StatusBadge status={a.status} /></span>
                    {clinical && <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => start(a)}>Iniciar</button>}
                  </li>
                ))}
                {inCare.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span><span className="num text-muted">{a.start}</span> · {byId(db.patients, a.patientId)?.name} · {byId(db.cabinets, a.cabinetId)?.name} <StatusBadge status={a.status} /></span>
                    {clinical && <Link href={`/consulta/${a.id}`} className="btn btn-ghost px-3 py-1 text-xs">Continuar →</Link>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Card title="Citas de hoy por gabinete" action={<Link href="/agenda" className="btn btn-ghost px-3 py-1 text-xs">Agenda <ArrowRight size={14} aria-hidden /></Link>}>
            <div className="grid gap-4 md:grid-cols-3">
              {db.cabinets.map((c) => {
                const list = appts.filter((a) => a.cabinetId === c.id)
                if (role === 'odontologo' && !list.length) return null
                return (
                  <div key={c.id}>
                    <h3 className="mb-2 flex items-center justify-between text-sm font-medium text-bone">
                      {c.name}<span className="num text-xs text-muted">{list.length} citas</span>
                    </h3>
                    <ul className="space-y-2">
                      {list.map((a) => (
                        <li key={a.id} className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="num text-sm text-gold-soft">{a.start}</span>
                            <StatusBadge status={a.status} />
                          </div>
                          <p className="mt-1 truncate text-sm text-bone">{byId(db.patients, a.patientId)?.name}</p>
                          <p className="truncate text-xs text-muted">{byId(db.procedures, a.procedureId)?.name}</p>
                        </li>
                      ))}
                      {!list.length && <li className="text-xs text-muted">Libre todo el día</li>}
                    </ul>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {role !== 'odontologo' && <CashCard db={db} />}
          {role !== 'recepcion' && <StockCard db={db} />}
          {role === 'admin' && (
            <Card title="Origen de las citas de hoy">
              <ul className="space-y-3">
                {(['whatsapp', 'web', 'campaign'] as const).map((s) => {
                  const n = appts.filter((a) => a.source === s).length
                  return (
                    <li key={s}>
                      <div className="mb-1 flex justify-between text-sm"><SourceChip source={s} /><span className="num">{n}</span></div>
                      <Bar value={n} max={appts.length} label={`${n} de ${appts.length}`} color={s === 'campaign' ? '#c9a961' : s === 'whatsapp' ? '#2f7bff' : '#b5aea3'} />
                    </li>
                  )
                })}
              </ul>
              <Link href="/analitica" className="mt-4 inline-block text-sm text-gold-soft hover:underline">Ver analítica por campaña →</Link>
            </Card>
          )}
          {role === 'recepcion' && (
            <Card title="Por llegar">
              <ul className="space-y-2 text-sm">
                {upcoming.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="truncate"><span className="num text-muted">{a.start}</span> {byId(db.patients, a.patientId)?.name}</span>
                    <Link href={`/recepcion?cita=${a.id}`} className="btn btn-ghost px-2 py-1 text-xs" aria-label={`QR de check-in de ${byId(db.patients, a.patientId)?.name}`}><QrCode size={15} aria-hidden /></Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function NextPatient({ db, a, clinical, children }: { db: DB; a: Appointment; clinical: boolean; children: React.ReactNode }) {
  const p = byId(db.patients, a.patientId)!
  const allergies = [...(p.anamnesis?.allergies ?? []), p.anamnesis?.allergyOther].filter((x) => x && x !== 'Ninguna')
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={p.name} size={56} />
        <div className="min-w-0">
          <p className="font-display text-2xl text-bone md:text-3xl">{p.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={a.status} />
            <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden /><span className="num">{a.start}</span></span>
            · {byId(db.procedures, a.procedureId)?.name} · {byId(db.cabinets, a.cabinetId)?.name} · {byId(db.users, a.dentistId)?.name}
            <SourceChip source={a.source} />
          </p>
          {a.checkedInAt && <p className="mt-1 text-xs text-muted">Check-in a las <span className="num">{a.checkedInAt}</span></p>}
        </div>
      </div>
      {clinical && allergies.length > 0 && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          <AlertTriangle size={16} aria-hidden /> Alergia: {allergies.join(', ')}
        </p>
      )}
      {children}
    </div>
  )
}

function CashCard({ db }: { db: DB }) {
  const tx = db.transactions.filter((t) => t.date === todayISO())
  const by = (m: PayMethod) => tx.filter((t) => t.kind === 'ingreso' && t.method === m).reduce((s, t) => s + t.amount, 0)
  const income = tx.filter((t) => t.kind === 'ingreso').reduce((s, t) => s + t.amount, 0)
  const out = tx.filter((t) => t.kind === 'egreso').reduce((s, t) => s + t.amount, 0)
  return (
    <Card title="Estado de caja" action={<Link href="/caja" className="btn btn-ghost px-3 py-1 text-xs">Caja <ArrowRight size={14} aria-hidden /></Link>}>
      <p className="num text-3xl text-bone">{bs(income - out)}</p>
      <p className="text-xs text-muted">Neto de hoy · ingresos {bs(income)} − egresos {bs(out)}</p>
      <ul className="mt-4 space-y-3">
        {(['qr', 'transferencia', 'efectivo'] as const).map((m) => (
          <li key={m}>
            <div className="mb-1 flex justify-between text-sm"><span className="text-muted">{METHOD_LABEL[m]}</span><span className="num">{bs(by(m))}</span></div>
            <Bar value={by(m)} max={income} label={`${METHOD_LABEL[m]}: ${bs(by(m))}`} color={m === 'qr' ? '#2f7bff' : '#c9a961'} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function StockCard({ db }: { db: DB }) {
  const low = db.inventory.filter((i) => i.stock <= i.min)
  return (
    <Card title="Inventario" action={<Link href="/inventario" className="btn btn-ghost px-3 py-1 text-xs">Ver <ArrowRight size={14} aria-hidden /></Link>}>
      {low.length ? (
        <ul className="space-y-2 text-sm">
          {low.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><AlertTriangle size={14} className="text-warn" aria-hidden />{i.name}</span>
              <span className="num text-warn">{i.stock} / mín. {i.min}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Todo el stock está sobre el mínimo.</p>
      )}
    </Card>
  )
}
