'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import { Field } from '../ui'
import { SignatureField } from '../signature-pad'
import { ALLERGY_OPTIONS, CONDITION_OPTIONS, checkinSchema, type CheckinInput } from '@/server/schemas/checkin'
import { submitCheckin } from '@/server/actions/checkin'
import { formatTime } from '@/lib/domain/time'
import type { CheckinContext } from '@/server/public/context'

type Name = FieldPath<CheckinInput>
const STEPS: { title: string; fields: Name[] }[] = [
  { title: 'Tus datos', fields: ['birthDate', 'emergencyContactName', 'emergencyContactPhone'] },
  { title: 'Tu salud', fields: ['allergies', 'allergyOther', 'conditions', 'medications', 'reason'] },
  { title: 'Consentimiento y firma', fields: ['consentData', 'consentClinical', 'signatureName', 'signature'] },
]
const stepOf = (field: string) => Math.max(0, STEPS.findIndex((s) => (s.fields as string[]).includes(field)))

export function CheckinForm({ token, ctx }: { token: string; ctx: CheckinContext }) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)
  const form = useForm<CheckinInput>({
    resolver: zodResolver(checkinSchema as never) as never,
    mode: 'onTouched',
    defaultValues: {
      token, allergies: [], conditions: [], pregnancy: false, anticoagulants: false,
      consentClinical: false as unknown as true, consentData: false as unknown as true, consentWhatsapp: false, signature: '',
    },
  })
  const e = form.formState.errors
  const legal = (type: CheckinContext['consents'][number]['type']) => ctx.consents.find((c) => c.type === type)

  // "Ninguna"/"Ninguno" excluye al resto de opciones y viceversa.
  const toggle = (name: 'allergies' | 'conditions', value: string, none: string) => {
    const cur = form.getValues(name) ?? []
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : value === none ? [none] : [...cur.filter((v) => v !== none), value]
    form.setValue(name, next, { shouldValidate: !!e[name] || form.formState.isSubmitted, shouldTouch: true })
  }
  const allergies = useWatch({ control: form.control, name: 'allergies' }) ?? []
  const conditions = useWatch({ control: form.control, name: 'conditions' }) ?? []
  const options = (name: 'allergies' | 'conditions', list: readonly string[], none: string, cur: string[]) => (
    <div className="grid grid-cols-2 gap-2">
      {list.map((o) => (
        <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${cur.includes(o) ? 'border-gold/60 bg-gold/10 text-bone' : 'border-white/10 text-muted'}`}>
          <input type="checkbox" className="accent-[#c9a961]" checked={cur.includes(o)} onChange={() => toggle(name, o, none)} />
          {o}
        </label>
      ))}
    </div>
  )

  const next = async () => {
    if (await form.trigger(STEPS[step].fields)) setStep(step + 1)
  }
  const submit = form.handleSubmit(async () => {
    setPending(true)
    setFormError('')
    const r = await submitCheckin({ ...form.getValues(), token })
    setPending(false)
    if (r.ok) return setDone(true)
    const fields = Object.entries(r.error.fields ?? {})
    for (const [k, msg] of fields) form.setError(k as Name, { message: msg })
    if (fields.length) setStep(Math.min(...fields.map(([k]) => stepOf(k))))
    setFormError(r.error.message)
  })

  if (done) {
    return (
      <div className="glass fade-in p-6 text-center" role="status">
        <CheckCircle2 size={56} className="mx-auto text-ok" aria-hidden />
        <h1 className="title-gold mt-3 text-2xl">¡Gracias, {ctx.firstName}!</h1>
        <p className="mt-2 text-sm text-muted">Ya estás en sala de espera. {ctx.dentist ? `${ctx.dentist} te llamará en un momento.` : 'Te llamarán en un momento.'}</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="glass fade-in space-y-4 p-5">
      <div>
        <p className="eyebrow">Check-in · paso {step + 1} de 3</p>
        <h1 className="title-gold mt-1 text-2xl">{STEPS[step].title}</h1>
        <p className="mt-1 text-sm text-muted">
          Hola, {ctx.firstName}. Tu cita es a las <span className="num text-bone">{formatTime(ctx.startsAt)}</span>
          {ctx.treatment ? ` · ${ctx.treatment}` : ''}.
        </p>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-gold' : 'bg-white/10'}`} />)}
        </div>
      </div>

      {/* Los tres pasos estan siempre montados (para no perder lo escrito); solo se muestra uno. */}
      <div hidden={step !== 0} className="space-y-4">
        {ctx.needsBirthDate && (
          <Field label="Fecha de nacimiento" error={e.birthDate?.message}>
            {(id, d) => <input id={id} type="date" aria-describedby={d} aria-invalid={!!e.birthDate} className="field" {...form.register('birthDate')} />}
          </Field>
        )}
        <Field label="Contacto de emergencia (nombre)" error={e.emergencyContactName?.message}>
          {(id, d) => <input id={id} autoComplete="off" aria-describedby={d} aria-invalid={!!e.emergencyContactName} className="field" {...form.register('emergencyContactName')} />}
        </Field>
        <Field label="Celular del contacto" error={e.emergencyContactPhone?.message}>
          {(id, d) => <input id={id} inputMode="tel" aria-describedby={d} aria-invalid={!!e.emergencyContactPhone} className="field" {...form.register('emergencyContactPhone')} />}
        </Field>
      </div>

      <div hidden={step !== 1} className="space-y-4">
        <fieldset aria-describedby={e.allergies ? 'e-all' : undefined}>
          <legend className="label">¿Tienes alergias?</legend>
          {options('allergies', ALLERGY_OPTIONS, 'Ninguna', allergies)}
          <label className="label mt-2" htmlFor="allergyOther">Otra alergia</label>
          <input id="allergyOther" className="field" {...form.register('allergyOther')} />
          {e.allergies && <p id="e-all" role="alert" className="mt-1 text-xs text-bad">{e.allergies.message}</p>}
        </fieldset>
        <fieldset aria-describedby={e.conditions ? 'e-con' : undefined}>
          <legend className="label">Antecedentes médicos</legend>
          {options('conditions', CONDITION_OPTIONS, 'Ninguno', conditions)}
          {e.conditions && <p id="e-con" role="alert" className="mt-1 text-xs text-bad">{e.conditions.message}</p>}
        </fieldset>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2 text-muted"><input type="checkbox" className="accent-[#c9a961]" {...form.register('pregnancy')} />Estoy embarazada</label>
          <label className="flex items-center gap-2 text-muted"><input type="checkbox" className="accent-[#c9a961]" {...form.register('anticoagulants')} />Tomo anticoagulantes</label>
        </div>
        <Field label="Medicamentos que tomas (opcional)" error={e.medications?.message}>
          {(id, d) => <input id={id} aria-describedby={d} className="field" {...form.register('medications')} />}
        </Field>
        <Field label="Motivo de tu visita" error={e.reason?.message}>
          {(id, d) => <textarea id={id} rows={2} aria-describedby={d} aria-invalid={!!e.reason} className="field" {...form.register('reason')} />}
        </Field>
      </div>

      <div hidden={step !== 2} className="space-y-4">
        {(['data_processing', 'clinical_treatment'] as const).map((t) => {
          const c = legal(t)
          return c ? (
            <div key={t} tabIndex={0} aria-label={t === 'data_processing' ? 'Texto de autorización de datos' : 'Texto del consentimiento informado'}
              className="max-h-32 overflow-y-auto whitespace-pre-line rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-muted">
              {c.body}
            </div>
          ) : null
        })}
        <div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-[#c9a961]" aria-invalid={!!e.consentData} aria-describedby={e.consentData ? 'e-cd' : undefined} {...form.register('consentData')} />
            <span>Autorizo el uso de mis datos personales y de salud para mi atención.</span>
          </label>
          {e.consentData && <p id="e-cd" role="alert" className="mt-1 text-xs text-bad">{e.consentData.message}</p>}
        </div>
        <div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-[#c9a961]" aria-invalid={!!e.consentClinical} aria-describedby={e.consentClinical ? 'e-cc' : undefined} {...form.register('consentClinical')} />
            <span>Leí y acepto el consentimiento informado.</span>
          </label>
          {e.consentClinical && <p id="e-cc" role="alert" className="mt-1 text-xs text-bad">{e.consentClinical.message}</p>}
        </div>
        {legal('whatsapp_reminders') && (
          <label className="flex items-start gap-2 text-sm text-muted">
            <input type="checkbox" className="mt-1 accent-[#c9a961]" {...form.register('consentWhatsapp')} />
            <span>Quiero recibir recordatorios de mis citas por WhatsApp (opcional).</span>
          </label>
        )}
        <p className="text-xs text-muted">
          Textos completos: <Link href="/consentimiento" target="_blank" className="text-gold-soft underline">consentimiento</Link> ·{' '}
          <Link href="/privacidad" target="_blank" className="text-gold-soft underline">privacidad</Link>
        </p>
        <Field label="Escribe tu nombre completo" error={e.signatureName?.message}>
          {(id, d) => <input id={id} autoComplete="name" aria-describedby={d} aria-invalid={!!e.signatureName} className="field font-display text-lg italic" {...form.register('signatureName')} />}
        </Field>
        <div>
          <p className="label">Dibuja tu firma</p>
          <SignatureField
            onChange={(v) => form.setValue('signature', v, { shouldValidate: true, shouldTouch: true })}
            invalid={!!e.signature}
            describedBy={e.signature ? 'e-sig' : undefined}
          />
          {e.signature && <p id="e-sig" role="alert" className="mt-1 text-xs text-bad">{e.signature.message}</p>}
          <p className="mt-1 text-xs text-muted">Si no puedes firmar en la pantalla, avisa en recepción.</p>
        </div>
      </div>

      {formError && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{formError}</p>}
      <div className="flex gap-2 pt-1">
        {step > 0 && <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>Atrás</button>}
        {/* Claves distintas: si React reutilizara el mismo <button>, el clic en "Continuar" del paso 2 podria terminar enviando el formulario. */}
        {step < STEPS.length - 1 ? (
          <button key="next" type="button" className="btn btn-primary flex-1" onClick={(ev) => { ev.preventDefault(); next() }}>Continuar</button>
        ) : (
          <button key="send" type="submit" className="btn btn-primary flex-1" disabled={pending}>{pending ? 'Enviando…' : 'Enviar y entrar a sala de espera'}</button>
        )}
      </div>
    </form>
  )
}
