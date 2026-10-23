'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Modal } from '../ui'
import { SourceChip } from '../chips'
import { PatientForm } from './patient-form'
import { formatDateTime } from '@/lib/domain/time'
import { formatPhone } from '@/lib/domain/phone'
import { SOURCE_LABEL, type AppointmentSource } from '@/lib/domain/status'
import type { BookingOptions, PatientDirectoryItem, PatientStatus } from '@/server/queries/types'

export const PATIENT_STATUS_LABEL: Record<PatientStatus, string> = { new: 'Nuevo', active: 'Activo', in_treatment: 'En tratamiento', inactive: 'Inactivo' }

type Props = {
  items: PatientDirectoryItem[]
  total: number
  page: number
  pageSize: number
  options: Pick<BookingOptions, 'dentists' | 'campaigns'>
  canAssignDentist: boolean
}

export function PatientsView({ items, total, page, pageSize, options, canAssignDentist }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState(params.get('q') ?? '')
  const pages = Math.max(1, Math.ceil(total / pageSize))

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in patch)) next.delete('page')
    router.replace(`/pacientes?${next.toString()}`)
  }
  // Busqueda con debounce de 300 ms.
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return
    const t = setTimeout(() => go({ q: q || null }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">CRM</p>
          <h1 className="title-gold text-3xl md:text-4xl">Pacientes</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden />Nuevo paciente</button>
      </div>

      <div className="glass mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative">
          <span className="sr-only">Buscar por nombre o celular</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="field pl-9" type="search" placeholder="Buscar por nombre o celular…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">Origen
          <select className="field w-auto" value={params.get('source') ?? ''} onChange={(e) => go({ source: e.target.value || null })}>
            <option value="">Todos</option>
            {(Object.keys(SOURCE_LABEL) as AppointmentSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">Estado
          <select className="field w-auto" value={params.get('status') ?? ''} onChange={(e) => go({ status: e.target.value || null })}>
            <option value="">Todos</option>
            {(Object.keys(PATIENT_STATUS_LABEL) as PatientStatus[]).map((s) => <option key={s} value={s}>{PATIENT_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>

      <p className="mb-2 text-sm text-muted" aria-live="polite">{total} {total === 1 ? 'paciente' : 'pacientes'}</p>
      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">Lista de pacientes</caption>
          <thead className="hidden text-left md:table-header-group">
            <tr className="border-b border-white/8 text-xs uppercase tracking-wider text-muted">
              <th scope="col" className="px-4 py-3 font-medium">Paciente</th>
              <th scope="col" className="px-4 py-3 font-medium">Origen</th>
              <th scope="col" className="px-4 py-3 font-medium">Estado</th>
              <th scope="col" className="px-4 py-3 font-medium">Odontólogo</th>
              <th scope="col" className="px-4 py-3 font-medium">Próxima cita</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/6 px-4 py-3 last:border-0 hover:bg-white/[0.03] md:table-row md:p-0">
                <td className="w-full md:w-auto md:px-4 md:py-3">
                  <Link href={`/pacientes/${p.id}`} className="block text-bone hover:text-gold">{p.fullName}</Link>
                  <span className="num text-xs text-muted">{formatPhone(p.phone)}</span>
                </td>
                <td className="md:px-4"><SourceChip source={p.firstSource} /></td>
                <td className="text-muted md:px-4">{PATIENT_STATUS_LABEL[p.status]}</td>
                <td className="text-muted md:px-4">{p.primaryDentistName ?? '—'}</td>
                <td className="num text-muted md:px-4">{p.nextAppointmentAt ? formatDateTime(p.nextAppointmentAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="p-8 text-center text-sm text-muted">{params.toString() ? 'No hay pacientes con ese filtro.' : 'Aún no hay pacientes. Crea el primero con «Nuevo paciente».'}</p>
        )}
      </div>

      {pages > 1 && (
        <nav aria-label="Páginas" className="mt-4 flex items-center justify-between text-sm">
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>Anterior</button>
          <span className="num text-muted">Página {page} de {pages}</span>
          <button className="btn btn-secondary" disabled={page >= pages} onClick={() => go({ page: String(page + 1) })}>Siguiente</button>
        </nav>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo paciente">
        {creating && <PatientForm mode="create" options={options} canAssignDentist={canAssignDentist} onDone={(id) => { setCreating(false); if (id) router.push(`/pacientes/${id}`) }} />}
      </Modal>
    </>
  )
}
