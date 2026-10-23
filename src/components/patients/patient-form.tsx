'use client'
import { useRouter } from 'next/navigation'
import { Field } from '../ui'
import { useActionForm } from '../use-action-form'
import { patientSchema } from '@/server/schemas/patients'
import { createPatient, updatePatient } from '@/server/actions/patients'
import { SOURCE_LABEL } from '@/lib/domain/status'
import type { BookingOptions } from '@/server/queries/types'

export type PatientFormValues = Record<string, string>
type Props = {
  mode: 'create' | 'edit'
  options: Pick<BookingOptions, 'dentists' | 'campaigns'>
  canAssignDentist: boolean
  initial?: PatientFormValues
  patientId?: string
  expectedUpdatedAt?: string
  onDone: (id?: string) => void
}
const SOURCES = ['phone', 'whatsapp', 'walk_in', 'referral', 'web', 'campaign'] as const

export function PatientForm({ mode, options, canAssignDentist, initial, patientId, expectedUpdatedAt, onDone }: Props) {
  const router = useRouter()
  const { form, submit, pending, formError } = useActionForm(
    patientSchema,
    async (v) => {
      const r = mode === 'create' ? await createPatient(v) : await updatePatient({ id: patientId, expectedUpdatedAt, data: v })
      if (r.ok) {
        router.refresh()
        onDone(mode === 'create' ? (r.data as { id: string }).id : undefined)
      }
      return r
    },
    { fullName: '', phone: '', email: '', birthDate: '', sex: '', zone: '', address: '', primaryDentistId: '', firstSource: 'phone', campaignId: '', ...initial },
  )
  const e = form.formState.errors
  const source = form.watch('firstSource')
  const reg = form.register
  const input = (id: string, d: string | undefined, name: string, extra: object = {}) => (
    <input id={id} aria-describedby={d} aria-invalid={!!e[name]} className="field" {...reg(name)} {...extra} />
  )
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Nombre completo" error={e.fullName?.message}>{(id, d) => input(id, d, 'fullName', { autoComplete: 'off' })}</Field>
      </div>
      <Field label="Celular (WhatsApp)" error={e.phone?.message} hint="Se usa para no duplicar pacientes">
        {(id, d) => input(id, d, 'phone', { inputMode: 'tel', placeholder: '+591 7XXXXXXX' })}
      </Field>
      <Field label="Fecha de nacimiento" error={e.birthDate?.message}>{(id, d) => input(id, d, 'birthDate', { type: 'date' })}</Field>
      <Field label="Correo (opcional)" error={e.email?.message}>{(id, d) => input(id, d, 'email', { type: 'email', autoComplete: 'off' })}</Field>
      <Field label="Sexo (opcional)" error={e.sex?.message}>
        {(id, d) => (
          <select id={id} aria-describedby={d} className="field" {...reg('sex')}>
            <option value="">—</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="X">Otro</option>
          </select>
        )}
      </Field>
      <Field label="Zona (opcional)" error={e.zone?.message}>{(id, d) => input(id, d, 'zone')}</Field>
      <Field label="Dirección (opcional)" error={e.address?.message}>{(id, d) => input(id, d, 'address')}</Field>
      {canAssignDentist && (
        <Field label="Odontólogo asignado (opcional)" error={e.primaryDentistId?.message}>
          {(id, d) => (
            <select id={id} aria-describedby={d} className="field" {...reg('primaryDentistId')}>
              <option value="">Sin asignar</option>
              {options.dentists.map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}
            </select>
          )}
        </Field>
      )}
      {mode === 'create' && (
        <>
          <Field label="¿Cómo llegó?" error={e.firstSource?.message}>
            {(id, d) => (
              <select id={id} aria-describedby={d} className="field" {...reg('firstSource')}>
                {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
              </select>
            )}
          </Field>
          {source === 'campaign' && (
            <Field label="Campaña" error={e.campaignId?.message}>
              {(id, d) => (
                <select id={id} aria-describedby={d} className="field" {...reg('campaignId')}>
                  <option value="">Sin campaña</option>
                  {options.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </Field>
          )}
        </>
      )}
      {formError && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad sm:col-span-2">{formError}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn btn-ghost" onClick={() => onDone()}>Cancelar</button>
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Guardando…' : mode === 'create' ? 'Crear paciente' : 'Guardar cambios'}</button>
      </div>
    </form>
  )
}
