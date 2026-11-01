'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Plus, Search, FileUp, ArrowUpRight, Users } from 'lucide-react'
import { Modal, Avatar, PageHeader } from '../ui'
import { PatientForm } from './patient-form'
import { formatDateTime } from '@/lib/domain/time'
import { formatPhone } from '@/lib/domain/phone'
import { SOURCE_LABEL, type AppointmentSource } from '@/lib/domain/status'
import type { BookingOptions, PatientDirectoryItem, PatientStatus } from '@/server/queries/types'

export const PATIENT_STATUS_LABEL: Record<PatientStatus, string> = {
  new: 'Nuevo',
  active: 'Activo',
  in_treatment: 'En tratamiento',
  inactive: 'Inactivo',
}

type Props = {
  items: PatientDirectoryItem[]
  total: number
  page: number
  pageSize: number
  options: Pick<BookingOptions, 'dentists' | 'campaigns'>
  canAssignDentist: boolean
  canImport?: boolean
}

export function PatientsView({ items, total, page, pageSize, options, canAssignDentist, canImport = false }: Props) {
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
      <PageHeader title="Pacientes" eyebrow="Sus fichas, sus próximas citas y toda su información en un solo lugar.">
        {canImport && (
          <Link href="/configuracion?tab=importar" className="btn btn-secondary">
            <FileUp size={16} aria-hidden />
            Importar pacientes
          </Link>
        )}
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={17} aria-hidden />
          Nuevo paciente
        </button>
      </PageHeader>
      <section className="glass overflow-hidden" aria-label="Directorio de pacientes">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 p-4 sm:p-5">
          <label className="relative w-full sm:max-w-sm">
            <span className="sr-only">Buscar por nombre o celular</span>
            <Search size={18} className="absolute left-3.5 top-3.5 text-muted" aria-hidden />
            <input
              className="field pl-11"
              type="search"
              placeholder="Buscar por nombre o celular…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            Origen
            <select
              className="field min-h-10 w-auto py-1 text-xs"
              value={params.get('source') ?? ''}
              onChange={(e) => go({ source: e.target.value || null })}
            >
              <option value="">Todos los orígenes</option>
              {(Object.keys(SOURCE_LABEL) as AppointmentSource[]).map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABEL[source]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto px-3 py-3 sm:px-5" role="group" aria-label="Filtrar pacientes por estado">
          {[{ value: '', label: 'Todos' }, ...Object.entries(PATIENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))].map(
            (status) => (
              <button
                key={status.value}
                className="filter-chip"
                aria-pressed={(params.get('status') ?? '') === status.value}
                onClick={() => go({ status: status.value || null })}
              >
                {status.label}
              </button>
            ),
          )}
        </div>
        <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(100px,0.8fr)_minmax(100px,1fr)_minmax(110px,0.9fr)_24px] gap-5 border-y border-white/6 bg-white/2 px-6 py-3 text-[0.65rem] uppercase tracking-wider text-muted lg:grid">
          <span>Paciente</span>
          <span>Estado</span>
          <span>Profesional</span>
          <span>Próxima cita</span>
          <span />
        </div>
        <ul>
          {items.map((p) => (
            <li key={p.id} className="border-b border-white/7 last:border-0">
              <Link
                href={`/pacientes/${p.id}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-white/4 sm:px-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(100px,0.8fr)_minmax(100px,1fr)_minmax(110px,0.9fr)_24px]"
              >
                <span className="flex min-w-0 items-center gap-3.5">
                  <Avatar name={p.fullName} size={46} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium group-hover:text-gold">{p.fullName}</span>
                    <span className="mt-1 block text-xs text-muted">{formatPhone(p.phone)}</span>
                    <span className="mt-2 inline-block rounded-full bg-white/6 px-2 py-1 text-[0.65rem] text-gold-soft lg:hidden">
                      {PATIENT_STATUS_LABEL[p.status]}
                    </span>
                  </span>
                </span>
                <span className="hidden lg:block">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1.5 text-[0.7rem] ${p.status === 'in_treatment' ? 'bg-azure/10 text-gold-soft' : p.status === 'inactive' ? 'bg-white/5 text-muted' : 'bg-gold/10 text-gold-soft'}`}
                  >
                    {PATIENT_STATUS_LABEL[p.status]}
                  </span>
                </span>
                <span className="hidden text-xs text-muted lg:block">{p.primaryDentistName ?? 'Sin asignar'}</span>
                <span className="hidden text-xs text-muted sm:block">
                  {p.nextAppointmentAt ? formatDateTime(p.nextAppointmentAt) : 'Sin cita programada'}
                </span>
                <ArrowUpRight size={18} className="text-muted group-hover:text-gold sm:hidden lg:block" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {items.length === 0 && (
          <div className="empty-state">
            <span className="icon-tile">
              <Users size={24} aria-hidden />
            </span>
            <h2 className="font-semibold">{params.toString() ? 'No encontramos pacientes' : 'Agrega tu primer paciente'}</h2>
            <p className="max-w-sm text-sm text-muted">
              {params.toString() ? 'Prueba con otro nombre o cambia los filtros.' : 'Crea una ficha con «Nuevo paciente» para empezar.'}
            </p>
          </div>
        )}
        <p className="border-t border-white/8 px-5 py-4 text-xs text-muted" aria-live="polite">
          {total} {total === 1 ? 'paciente' : 'pacientes'} · Selecciona un nombre para abrir su ficha
        </p>
      </section>
      {pages > 1 && (
        <nav aria-label="Páginas" className="mt-4 flex items-center justify-between text-sm">
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>
            Anterior
          </button>
          <span className="num text-muted">
            Página {page} de {pages}
          </span>
          <button className="btn btn-secondary" disabled={page >= pages} onClick={() => go({ page: String(page + 1) })}>
            Siguiente
          </button>
        </nav>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo paciente">
        {creating && (
          <PatientForm
            mode="create"
            options={options}
            canAssignDentist={canAssignDentist}
            onDone={(id) => {
              setCreating(false)
              if (id) router.push(`/pacientes/${id}`)
            }}
          />
        )}
      </Modal>
    </>
  )
}
