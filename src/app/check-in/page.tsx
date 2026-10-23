'use client'
import { Suspense, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useDB, useHydrated, byId, checkIn, todayISO, fecha, nowHM, CLINIC, type AnamnesisData } from '@/lib/data'
import { Field, Wordmark } from '@/components/ui'
import { PHONE_RE } from '@/components/appointment-modal'

const ALLERGIES = ['Ninguna', 'Penicilina', 'Látex', 'Anestésicos locales', 'AINE (ibuprofeno)']
const CONDITIONS = ['Ninguno', 'Diabetes', 'Hipertensión', 'Cardiopatía', 'Embarazo', 'Anticoagulantes', 'Asma']

export default function Page() {
  return <Suspense><CheckIn /></Suspense>
}

function CheckIn() {
  return useHydrated() ? <CheckInForm /> : null
}

function CheckInForm() {
  const db = useDB()
  const params = useSearchParams()
  const embed = params.has('embed')
  const a = byId(db.appointments, params.get('cita') ?? undefined)
  const p = a && byId(db.patients, a.patientId)
  const [step, setStep] = useState(0)
  const [sent, setSent] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [f, setF] = useState({
    name: p?.name ?? '', birthDate: p?.birthDate ?? '', phone: p?.phone ?? '', emergencyContact: '',
    allergies: [] as string[], allergyOther: '', conditions: [] as string[], medications: '', reason: '',
    consent: false, reminders: true, signature: '',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const toggle = (k: 'allergies' | 'conditions', v: string, none: string) =>
    set(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : v === none ? [none] : [...f[k].filter((x) => x !== none), v])

  if (!a && !params.get('cita')) return <Picker />

  const validate = () => {
    const e: Record<string, string> = {}
    if (step === 0) {
      if (f.name.trim().length < 5) e.name = 'Escribe tu nombre y apellido.'
      if (!f.birthDate) e.birthDate = 'Indica tu fecha de nacimiento.'
      else if (f.birthDate > todayISO()) e.birthDate = 'La fecha no puede ser futura.'
      if (!PHONE_RE.test(f.phone.replace(/[\s-]/g, ''))) e.phone = 'Formato: +591 7XXXXXXX.'
      if (f.emergencyContact.trim().length < 3) e.emergencyContact = 'Indica un contacto de emergencia.'
    }
    if (step === 1) {
      if (!f.allergies.length && !f.allergyOther.trim()) e.allergies = 'Marca «Ninguna» o indica tu alergia.'
      if (!f.conditions.length) e.conditions = 'Marca «Ninguno» o tus antecedentes.'
      if (f.reason.trim().length < 3) e.reason = 'Cuéntanos el motivo de tu visita.'
    }
    if (step === 2) {
      if (!f.consent) e.consent = 'Necesitamos tu consentimiento para atenderte.'
      if (f.signature.trim().length < 5) e.signature = 'Escribe tu nombre completo como firma.'
    }
    setErrors(e)
    return !Object.keys(e).length
  }
  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (!validate()) return
    if (step < 2) return setStep(step + 1)
    const anamnesis: AnamnesisData = {
      allergies: f.allergies, allergyOther: f.allergyOther.trim(), conditions: f.conditions, medications: f.medications.trim(),
      reason: f.reason.trim(), emergencyContact: f.emergencyContact.trim(), consent: f.consent, signature: f.signature.trim(), submittedAt: nowHM(),
    }
    if (a) checkIn(a.id, { name: f.name.trim(), phone: f.phone.trim(), birthDate: f.birthDate }, anamnesis)
    setSent(true)
  }

  const check = (k: 'allergies' | 'conditions', v: string, none: string) => (
    <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${f[k].includes(v) ? 'border-gold/60 bg-gold/10 text-bone' : 'border-white/10 text-muted'}`}>
      <input type="checkbox" className="accent-[#c9a961]" checked={f[k].includes(v)} onChange={() => toggle(k, v, none)} />
      {v}
    </label>
  )

  return (
    <main className={`mx-auto max-w-md px-4 ${embed ? 'pb-6 pt-10' : 'py-8'}`}>
      <div className="mb-5 flex items-center justify-between">
        <Wordmark />
        <span className="flex items-center gap-1 text-xs text-muted"><ShieldCheck size={14} className="text-gold" aria-hidden />Datos protegidos</span>
      </div>
      {sent ? (
        <div className="glass fade-in p-6 text-center" role="status">
          <CheckCircle2 size={56} className="mx-auto text-ok" aria-hidden />
          <h1 className="title-gold mt-3 text-2xl">¡Gracias, {f.name.split(' ')[0]}!</h1>
          <p className="mt-2 text-sm text-muted">Ya estás en sala de espera. {a ? `${byId(db.users, a.dentistId)?.name} te llamará en un momento.` : 'Recepción te llamará en un momento.'}</p>
          {!a && <p className="mt-3 text-xs text-warn">Modo demostración: este celular no comparte datos con la recepción.</p>}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="glass fade-in space-y-4 p-5">
          <div>
            <p className="eyebrow">Check-in · paso {step + 1} de 3</p>
            <h1 className="title-gold mt-1 text-2xl">{['Tus datos', 'Tu salud', 'Consentimiento'][step]}</h1>
            {a ? (
              <p className="mt-1 text-sm text-muted">Cita de hoy {fecha(a.date)} · {a.start} · {byId(db.procedures, a.procedureId)?.name}</p>
            ) : (
              <p className="mt-1 text-xs text-warn">Modo demostración: no se encontró la cita en este dispositivo.</p>
            )}
            <div className="mt-3 flex gap-1.5" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-gold' : 'bg-white/10'}`} />)}</div>
          </div>

          {step === 0 && (
            <>
              <Field label="Nombre completo" error={errors.name}>
                {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.name} className="field" autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} />}
              </Field>
              <Field label="Fecha de nacimiento" error={errors.birthDate}>
                {(id, d) => <input id={id} type="date" max={todayISO()} aria-describedby={d} aria-invalid={!!errors.birthDate} className="field" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} />}
              </Field>
              <Field label="Celular" error={errors.phone}>
                {(id, d) => <input id={id} inputMode="tel" aria-describedby={d} aria-invalid={!!errors.phone} className="field" placeholder="+591 7XXXXXXX" value={f.phone} onChange={(e) => set('phone', e.target.value)} />}
              </Field>
              <Field label="Contacto de emergencia (nombre y celular)" error={errors.emergencyContact}>
                {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.emergencyContact} className="field" value={f.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} />}
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <fieldset aria-describedby={errors.allergies ? 'err-all' : undefined}>
                <legend className="label">¿Tienes alergias?</legend>
                <div className="grid grid-cols-2 gap-2">{ALLERGIES.map((v) => check('allergies', v, 'Ninguna'))}</div>
                <label className="label mt-2" htmlFor="other">Otra alergia</label>
                <input id="other" className="field" value={f.allergyOther} onChange={(e) => set('allergyOther', e.target.value)} />
                {errors.allergies && <p id="err-all" role="alert" className="mt-1 text-xs text-bad">{errors.allergies}</p>}
              </fieldset>
              <fieldset aria-describedby={errors.conditions ? 'err-con' : undefined}>
                <legend className="label">Antecedentes médicos</legend>
                <div className="grid grid-cols-2 gap-2">{CONDITIONS.map((v) => check('conditions', v, 'Ninguno'))}</div>
                {errors.conditions && <p id="err-con" role="alert" className="mt-1 text-xs text-bad">{errors.conditions}</p>}
              </fieldset>
              <Field label="Medicamentos que tomas (opcional)">
                {(id) => <input id={id} className="field" value={f.medications} onChange={(e) => set('medications', e.target.value)} />}
              </Field>
              <Field label="Motivo de la consulta" error={errors.reason}>
                {(id, d) => <textarea id={id} rows={2} aria-describedby={d} aria-invalid={!!errors.reason} className="field" value={f.reason} onChange={(e) => set('reason', e.target.value)} />}
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-muted" tabIndex={0} aria-label="Texto del consentimiento">
                Autorizo a {CLINIC.name} a registrar mis datos personales y de salud para mi atención odontológica. Declaro que la
                información entregada es verdadera. Entiendo que puedo pedir acceso o corrección de mis datos y que solo el personal
                clínico autorizado verá mi historia. [Texto de ejemplo: la clínica entregará su consentimiento oficial.]
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-[#c9a961]" checked={f.consent} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? 'err-cons' : undefined} onChange={(e) => set('consent', e.target.checked)} />
                <span>Leí y acepto el consentimiento informado.</span>
              </label>
              {errors.consent && <p id="err-cons" role="alert" className="-mt-2 text-xs text-bad">{errors.consent}</p>}
              <label className="flex items-start gap-2 text-sm text-muted">
                <input type="checkbox" className="mt-1 accent-[#c9a961]" checked={f.reminders} onChange={(e) => set('reminders', e.target.checked)} />
                <span>Quiero recibir recordatorios por WhatsApp.</span>
              </label>
              <Field label="Firma (escribe tu nombre completo)" error={errors.signature}>
                {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.signature} className="field font-display text-lg italic" value={f.signature} onChange={(e) => set('signature', e.target.value)} />}
              </Field>
            </>
          )}

          <div className="flex gap-2 pt-1">
            {step > 0 && <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>Atrás</button>}
            <button type="submit" className="btn btn-primary flex-1">{step < 2 ? 'Continuar' : 'Enviar y entrar a sala de espera'}</button>
          </div>
        </form>
      )}
      {!embed && <p className="mt-8 text-center text-xs text-muted/70">Demo preparada por Lumen Labs</p>}
    </main>
  )
}

function Picker() {
  const db = useDB()
  const list = db.appointments.filter((a) => a.date === todayISO() && ['agendada', 'confirmada'].includes(a.status))
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Wordmark />
      <div className="glass mt-6 p-5">
        <h1 className="title-gold text-2xl">Check-in</h1>
        <p className="mt-1 text-sm text-muted">Escanea el QR que te muestra recepción. Para la demo, elige un paciente con cita hoy:</p>
        <ul className="mt-4 space-y-2">
          {list.map((a) => (
            <li key={a.id}>
              <Link href={`/check-in?cita=${a.id}`} className="glass flex justify-between px-3 py-2.5 text-sm hover:ring-1 hover:ring-gold/40">
                <span>{byId(db.patients, a.patientId)?.name}</span><span className="num text-gold-soft">{a.start}</span>
              </Link>
            </li>
          ))}
          {!list.length && <li className="text-sm text-muted">No hay citas pendientes de check-in.</li>}
        </ul>
      </div>
      <p className="mt-8 text-center text-xs text-muted/70">Demo preparada por Lumen Labs</p>
    </main>
  )
}
