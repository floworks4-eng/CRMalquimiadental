'use client'
import { Suspense, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, MapPin, Clock, Sparkles, Stethoscope, Smile, Baby, Activity, Gem, ArrowLeft } from 'lucide-react'
import {
  useDB, useHydrated, createAppointment, findConflict, todayISO, addDays, fecha, nowHM, toHM, toMin, byId, CLINIC, type Source,
} from '@/lib/data'
import { Field, Wordmark } from '@/components/ui'
import { PHONE_RE } from '@/components/appointment-modal'

const SPECIALTIES = [
  { id: 'limpieza', label: 'Limpieza dental', icon: Sparkles, procedureId: 'limpieza', dentistId: 'u-val', cabinetId: 'c2', minutes: 45 },
  { id: 'consulta', label: 'Consulta general', icon: Stethoscope, procedureId: 'consulta', dentistId: 'u-doc', cabinetId: 'c1', minutes: 30 },
  { id: 'ortodoncia', label: 'Evaluación de ortodoncia', icon: Smile, procedureId: 'consulta', dentistId: 'u-doc', cabinetId: 'c1', minutes: 30 },
  { id: 'endodoncia', label: 'Dolor / endodoncia', icon: Activity, procedureId: 'consulta', dentistId: 'u-ser', cabinetId: 'c3', minutes: 30 },
  { id: 'blanqueamiento', label: 'Blanqueamiento', icon: Gem, procedureId: 'blanqueamiento', dentistId: 'u-doc', cabinetId: 'c1', minutes: 60 },
  { id: 'ninos', label: 'Odontopediatría', icon: Baby, procedureId: 'consulta', dentistId: 'u-val', cabinetId: 'c2', minutes: 30 },
]

export default function Page() {
  return <Suspense><Portal /></Suspense>
}
function Portal() {
  return useHydrated() ? <Booking /> : null
}

function Booking() {
  const db = useDB()
  const params = useSearchParams()
  const campaign = byId(db.campaigns, params.get('utm_campaign') ?? undefined)
  const [spec, setSpec] = useState<(typeof SPECIALTIES)[number]>()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [f, setF] = useState({ name: '', phone: '', consent: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState<string>()
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayISO(), i)).filter((d) => new Date(d + 'T12:00:00').getDay() !== 0).slice(0, 10)

  const slots = (() => {
    if (!spec || !date) return []
    const sat = new Date(date + 'T12:00:00').getDay() === 6
    const [from, to] = sat ? [9 * 60, 13 * 60] : [8 * 60 + 30, 19 * 60 + 30]
    const out: string[] = []
    for (let m = from; m + spec.minutes <= to; m += 30) {
      const start = toHM(m)
      if (date === todayISO() && start <= nowHM()) continue
      if (!findConflict(db, { id: 'x', date, start, duration: spec.minutes, cabinetId: spec.cabinetId, dentistId: spec.dentistId })) out.push(start)
    }
    return out
  })()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (f.name.trim().length < 5) err.name = 'Escribe tu nombre y apellido.'
    if (!PHONE_RE.test(f.phone.replace(/[\s-]/g, ''))) err.phone = 'Formato: +591 7XXXXXXX (8 dígitos).'
    if (!f.consent) err.consent = 'Acepta el uso de tus datos para agendar.'
    setErrors(err)
    if (Object.keys(err).length || !spec) return
    const source: Source = campaign ? 'campaign' : 'web'
    const r = createAppointment({
      newPatient: { name: f.name.trim(), phone: f.phone.trim() }, dentistId: spec.dentistId, cabinetId: spec.cabinetId, date, start: time,
      duration: spec.minutes, procedureId: spec.procedureId, source, campaignId: campaign?.id, status: 'agendada',
    })
    if (r.error) setErrors({ form: 'Ese horario acaba de ocuparse. Elige otro, por favor.' })
    else setDone(r.id)
  }

  const stepNo = !spec ? 1 : !date || !time ? 2 : 3
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Wordmark />
        <div className="space-y-0.5 text-right text-xs text-muted">
          <p className="flex items-center justify-end gap-1"><MapPin size={13} className="text-gold" aria-hidden />{CLINIC.zone}</p>
          <p className="flex items-center justify-end gap-1"><Clock size={13} className="text-gold" aria-hidden />{CLINIC.hours}</p>
        </div>
      </header>

      <div className="halo relative mt-10 text-center">
        <h1 className="title-gold text-4xl md:text-5xl">Agenda tu cita</h1>
        <p className="mt-2 text-muted">Elige el tratamiento, el día y la hora. Te confirmamos por WhatsApp.</p>
        {campaign && <p className="mt-2 text-xs text-gold-soft">Promoción: {campaign.name}</p>}
      </div>

      {done ? (
        <section className="glass fade-in mt-8 p-8 text-center" role="status">
          <CheckCircle2 size={60} className="mx-auto text-ok" aria-hidden />
          <h2 className="title-gold mt-3 text-3xl">¡Cita reservada!</h2>
          <p className="mt-2 text-bone">{spec?.label} · {fecha(date)} · {time}</p>
          <p className="text-sm text-muted">{byId(db.users, spec?.dentistId)?.name} · {CLINIC.zone}</p>
          <p className="mx-auto mt-4 max-w-sm text-sm text-muted">Te llegará la confirmación y un recordatorio por WhatsApp. Al llegar, escanea el QR de recepción para tu ficha digital.</p>
          <p className="mt-4 text-xs text-muted">La cita ya aparece en la agenda de la clínica con origen «{campaign ? 'Campaña' : 'Web'}».</p>
        </section>
      ) : (
        <section className="glass mt-8 p-5 md:p-7">
          <ol className="mb-6 flex gap-2 text-xs" aria-label="Pasos">
            {['Tratamiento', 'Día y hora', 'Tus datos'].map((s, i) => (
              <li key={s} aria-current={stepNo === i + 1 ? 'step' : undefined} className={`flex-1 border-t-2 pt-2 ${stepNo > i ? 'border-gold text-gold-soft' : 'border-white/10 text-muted'}`}>{i + 1}. {s}</li>
            ))}
          </ol>

          {!spec ? (
            <fieldset>
              <legend className="title-gold mb-4 text-xl">¿Qué necesitas?</legend>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {SPECIALTIES.map((s) => (
                  <button key={s.id} type="button" onClick={() => setSpec(s)} className="glass flex flex-col items-start gap-3 p-4 text-left hover:ring-1 hover:ring-gold/50">
                    <s.icon className="text-gold" size={22} strokeWidth={1.5} aria-hidden />
                    <span className="text-sm text-bone">{s.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : !date || !time ? (
            <div>
              <button className="btn btn-ghost -ml-3 mb-2 text-xs" onClick={() => { setSpec(undefined); setDate(''); setTime('') }}><ArrowLeft size={14} aria-hidden />{spec.label}</button>
              <fieldset>
                <legend className="title-gold mb-3 text-xl">Elige el día</legend>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {days.map((d) => {
                    const dt = new Date(d + 'T12:00:00')
                    return (
                      <button key={d} type="button" aria-pressed={date === d} onClick={() => { setDate(d); setTime('') }}
                        className={`flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 text-sm ${date === d ? 'border-gold bg-gold/15 text-bone' : 'border-white/10 text-muted hover:border-white/25'}`}>
                        <span className="text-[0.7rem] uppercase">{new Intl.DateTimeFormat('es-BO', { weekday: 'short' }).format(dt)}</span>
                        <span className="num text-lg">{dt.getDate()}</span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              {date && (
                <fieldset className="mt-5">
                  <legend className="title-gold mb-3 text-xl">Horarios libres · {fecha(date)}</legend>
                  {slots.length ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {slots.map((s) => (
                        <button key={s} type="button" onClick={() => setTime(s)} className="num rounded-xl border border-white/10 py-2 text-sm hover:border-azure hover:text-[#9cc0ff]">{s}</button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No quedan horarios este día. Prueba otro.</p>
                  )}
                </fieldset>
              )}
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4">
              <button type="button" className="btn btn-ghost -ml-3 text-xs" onClick={() => setTime('')}><ArrowLeft size={14} aria-hidden />{spec.label} · {fecha(date)} · {time}</button>
              <Field label="Nombre completo" error={errors.name}>
                {(id, d) => <input id={id} autoComplete="name" aria-describedby={d} aria-invalid={!!errors.name} className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
              </Field>
              <Field label="Celular (WhatsApp)" error={errors.phone} hint="Te confirmamos por aquí">
                {(id, d) => <input id={id} inputMode="tel" autoComplete="tel" placeholder="+591 7XXXXXXX" aria-describedby={d} aria-invalid={!!errors.phone} className="field" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-[#c9a961]" checked={f.consent} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? 'err-consent' : undefined} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
                <span className="text-muted">Acepto que Alquimia Dental use mis datos para agendar y recordarme la cita.</span>
              </label>
              {errors.consent && <p id="err-consent" role="alert" className="text-xs text-bad">{errors.consent}</p>}
              {errors.form && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{errors.form}</p>}
              <button className="btn btn-primary btn-xl w-full">CONFIRMAR CITA</button>
            </form>
          )}
        </section>
      )}
      <p className="mt-10 text-center text-xs text-muted/70">Demo con datos ficticios · Demo preparada por Lumen Labs</p>
    </main>
  )
}
