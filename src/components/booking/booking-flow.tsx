'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Stethoscope } from 'lucide-react'
import { Field } from '../ui'
import { createPublicBooking, getPublicSlots, type BookingResult } from '@/server/actions/booking'
import { addDays, formatDayLong, formatTime, localDate, todayLaPaz } from '@/lib/domain/time'

type Treatment = { id: string; name: string; durationMin: number }
const WINDOW_DAYS = 21

export function BookingFlow({ treatments, utm, consentText, whatsappAvailable }: {
  treatments: Treatment[]
  utm: Record<string, string>
  consentText: string | null
  whatsappAvailable: boolean
}) {
  const [treatment, setTreatment] = useState<Treatment | null>(null)
  const [loaded, setLoaded] = useState<{ id: string; slots: string[]; error?: string } | null>(null)
  const [day, setDay] = useState('')
  const [slot, setSlot] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', consentData: false, consentWhatsapp: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<BookingResult | null>(null)

  // Horarios de las proximas 3 semanas, agrupados por dia (hora de La Paz).
  useEffect(() => {
    if (!treatment) return
    let stale = false
    const from = todayLaPaz()
    getPublicSlots({ treatmentId: treatment.id, from, to: addDays(from, WINDOW_DAYS) }).then((r) => {
      if (!stale) setLoaded({ id: treatment.id, slots: r.ok ? r.data : [], error: r.ok ? undefined : r.error.message })
    })
    return () => {
      stale = true
    }
  }, [treatment])
  const loading = !!treatment && loaded?.id !== treatment.id
  const byDay = new Map<string, string[]>()
  if (treatment && loaded?.id === treatment.id) for (const s of loaded.slots) byDay.set(localDate(s), [...(byDay.get(localDate(s)) ?? []), s])
  const days = [...byDay.keys()]

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!treatment || !slot) return
    setSaving(true)
    setErrors({})
    setFormError('')
    const r = await createPublicBooking({ treatmentId: treatment.id, startsAt: slot, ...form, utm })
    setSaving(false)
    if (r.ok) return setResult(r.data)
    setErrors(r.error.fields ?? {})
    setFormError(r.error.fields ? '' : r.error.message)
    if (r.error.code === 'SLOT_TAKEN') {
      setSlot('')
      setLoaded(null) // vuelve a pedir horarios
      setFormError('Ese horario acaba de ocuparse. Elige otro, por favor.')
    }
  }

  const step = !treatment ? 1 : !slot ? 2 : 3
  if (result) {
    return (
      <section className="glass fade-in p-6 text-center md:p-8" role="status">
        <CheckCircle2 size={56} className="mx-auto text-ok" aria-hidden />
        <h2 className="title-gold mt-3 text-3xl">¡Cita reservada!</h2>
        <p className="mt-2 text-bone">{result.treatment} · {formatDayLong(localDate(result.startsAt))} · <span className="num">{formatTime(result.startsAt)}</span></p>
        <p className="mt-1 text-sm text-muted">Código de reserva: <span className="num text-gold-soft">{result.code}</span></p>
        <div className="mx-auto mt-5 max-w-sm rounded-xl border border-gold/30 bg-gold/5 p-4 text-left text-sm">
          <p className="text-bone">Guarda este enlace para tu check-in:</p>
          <p className="mt-1 text-muted">El día de tu cita, ábrelo cuando llegues (se habilita 2 horas antes). Llenas tu ficha desde el celular, sin papeles.</p>
          <Link href={result.checkinUrl} className="mt-2 block break-all text-xs text-gold-soft underline">{result.checkinUrl}</Link>
        </div>
        <p className="mt-4 text-xs text-muted">Si necesitas cambiar o cancelar la cita, llama a la clínica.</p>
      </section>
    )
  }

  return (
    <section className="glass p-5 md:p-7">
      <ol className="mb-6 flex gap-2 text-xs" aria-label="Pasos">
        {['Tratamiento', 'Día y hora', 'Tus datos'].map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? 'step' : undefined} className={`flex-1 border-t-2 pt-2 ${step > i ? 'border-gold text-gold-soft' : 'border-white/10 text-muted'}`}>{i + 1}. {s}</li>
        ))}
      </ol>

      {!treatment ? (
        <fieldset>
          <legend className="title-gold mb-4 text-xl">¿Qué necesitas?</legend>
          {treatments.length === 0 && <p className="text-sm text-muted">Por ahora no hay tratamientos con reserva en línea. Llama a la clínica.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {treatments.map((t) => (
              <button key={t.id} type="button" onClick={() => { setTreatment(t); setDay(''); setSlot('') }} className="glass flex items-center gap-3 p-4 text-left hover:ring-1 hover:ring-gold/50">
                <Stethoscope className="shrink-0 text-gold" size={20} strokeWidth={1.5} aria-hidden />
                <span><span className="block text-sm text-bone">{t.name}</span><span className="text-xs text-muted">{t.durationMin} min</span></span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : !slot ? (
        <div>
          <button className="btn btn-ghost -ml-3 mb-2 text-xs" onClick={() => setTreatment(null)}><ArrowLeft size={14} aria-hidden />{treatment.name}</button>
          {loading ? (
            <p className="text-sm text-muted" aria-busy="true">Buscando horarios libres…</p>
          ) : loaded?.error ? (
            <p role="alert" className="text-sm text-bad">{loaded.error}</p>
          ) : days.length === 0 ? (
            <p className="text-sm text-muted">No hay horarios libres en las próximas semanas. Llama a la clínica, por favor.</p>
          ) : (
            <>
              <fieldset>
                <legend className="title-gold mb-3 text-xl">Elige el día</legend>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {days.map((d) => {
                    const [y, m, dd] = d.split('-').map(Number)
                    const label = new Intl.DateTimeFormat('es-BO', { weekday: 'short' }).format(new Date(y, m - 1, dd))
                    return (
                      <button key={d} type="button" aria-pressed={day === d} aria-label={formatDayLong(d)} onClick={() => setDay(d)}
                        className={`flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 text-sm ${day === d ? 'border-gold bg-gold/15 text-bone' : 'border-white/10 text-muted hover:border-white/25'}`}>
                        <span className="text-[0.7rem] uppercase">{label}</span>
                        <span className="num text-lg">{dd}</span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              {day && (
                <fieldset className="mt-5">
                  <legend className="title-gold mb-3 text-xl">Horarios · {formatDayLong(day)}</legend>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {(byDay.get(day) ?? []).map((s) => (
                      <button key={s} type="button" onClick={() => setSlot(s)} className="num rounded-xl border border-white/10 py-2 text-sm hover:border-azure hover:text-bone">{formatTime(s)}</button>
                    ))}
                  </div>
                </fieldset>
              )}
            </>
          )}
          {formError && <p role="alert" className="mt-4 text-sm text-bad">{formError}</p>}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <button type="button" className="btn btn-ghost -ml-3 text-xs" onClick={() => setSlot('')}>
            <ArrowLeft size={14} aria-hidden />{treatment.name} · {formatDayLong(localDate(slot))} · {formatTime(slot)}
          </button>
          <Field label="Nombre completo" error={errors.name}>
            {(id, d) => <input id={id} autoComplete="name" aria-describedby={d} aria-invalid={!!errors.name} className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </Field>
          <Field label="Celular (WhatsApp)" error={errors.phone} hint="Para confirmar tu cita">
            {(id, d) => <input id={id} inputMode="tel" autoComplete="tel" placeholder="7XXXXXXX" aria-describedby={d} aria-invalid={!!errors.phone} className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
          </Field>
          {consentText && <p className="max-h-28 overflow-y-auto whitespace-pre-line rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-muted" tabIndex={0} aria-label="Texto de autorización de datos">{consentText}</p>}
          <div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-[#c9a961]" checked={form.consentData} aria-invalid={!!errors.consentData} aria-describedby={errors.consentData ? 'e-consent' : undefined}
                onChange={(e) => setForm({ ...form, consentData: e.target.checked })} />
              <span className="text-muted">Autorizo a la clínica a usar mis datos para agendar y atenderme. <Link href="/privacidad" target="_blank" className="text-gold-soft underline">Privacidad</Link></span>
            </label>
            {errors.consentData && <p id="e-consent" role="alert" className="mt-1 text-xs text-bad">{errors.consentData}</p>}
          </div>
          {whatsappAvailable && (
            <label className="flex items-start gap-2 text-sm text-muted">
              <input type="checkbox" className="mt-1 accent-[#c9a961]" checked={form.consentWhatsapp} onChange={(e) => setForm({ ...form, consentWhatsapp: e.target.checked })} />
              <span>Quiero recibir recordatorios por WhatsApp (opcional).</span>
            </label>
          )}
          {formError && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{formError}</p>}
          <button className="btn btn-primary btn-xl w-full" disabled={saving}>{saving ? 'Reservando…' : 'CONFIRMAR CITA'}</button>
        </form>
      )}
    </section>
  )
}
