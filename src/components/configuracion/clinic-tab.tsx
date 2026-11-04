'use client'
import { useState } from 'react'
import { Field } from '../ui'
import { updateClinic } from '@/server/actions/settings'
import type { SettingsData } from '@/server/queries/settings'
import { useSave } from './use-save'

export function ClinicTab({ data }: { data: SettingsData }) {
  const [f, setF] = useState(data.clinic)
  const { pending, fields, run, status } = useSave()
  const input = (k: keyof typeof f, label: string, hint?: string) => (
    <Field label={label} error={fields[k]} hint={hint}>{(id) => <input id={id} className="field" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>
  )
  return (
    <section className="glass max-w-2xl p-5">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => updateClinic(f)) }}>
        {input('name', 'Nombre de la clínica')}
        <div className="grid gap-3 sm:grid-cols-2">
          {input('legalName', 'Razón social')}
          {input('nit', 'NIT')}
          {input('phone', 'Teléfono')}
          {input('whatsappNumber', 'WhatsApp')}
        </div>
        {input('address', 'Dirección')}
        {status}
        <button className="btn btn-primary" disabled={pending}>Guardar</button>
      </form>
    </section>
  )
}
