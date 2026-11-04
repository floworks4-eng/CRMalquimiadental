'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { PageHeader } from '../ui'
import type { SettingsData } from '@/server/queries/settings'
import { TABS, type Tab } from '@/lib/settings-tabs'

function TabLoading() {
  return <p role="status" aria-live="polite" aria-busy="true" className="glass p-5 text-sm text-muted">Cargando sección…</p>
}

const ClinicTab = dynamic(() => import('./clinic-tab').then((mod) => mod.ClinicTab), { loading: TabLoading })
const HoursTab = dynamic(() => import('./hours-tab').then((mod) => mod.HoursTab), { loading: TabLoading })
const TreatmentsTab = dynamic(() => import('./treatments-tab').then((mod) => mod.TreatmentsTab), { loading: TabLoading })
const TeamTab = dynamic(() => import('./team-tab').then((mod) => mod.TeamTab), { loading: TabLoading })
const ImportPatients = dynamic(() => import('./import-patients').then((mod) => mod.ImportPatients), { loading: TabLoading })
const ImportPaperRecords = dynamic(() => import('./import-paper-records').then((mod) => mod.ImportPaperRecords), { loading: TabLoading })

export function SettingsView({ data, tab }: { data: SettingsData; tab: Tab }) {
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Solo administrador" title="Configuración" />
      <nav aria-label="Secciones" className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-black/15 p-1">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link key={t} href={`/configuracion?tab=${t}`} aria-current={tab === t ? 'page' : undefined}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${tab === t ? 'bg-white/10 text-gold ring-1 ring-gold/30' : 'text-muted hover:text-bone'}`}>
            {TABS[t]}
          </Link>
        ))}
      </nav>
      {tab === 'clinica' && <ClinicTab data={data} />}
      {tab === 'horarios' && <HoursTab data={data} />}
      {tab === 'tratamientos' && <TreatmentsTab data={data} />}
      {tab === 'equipo' && <TeamTab data={data} />}
      {tab === 'importar' && <div className="space-y-5"><ImportPaperRecords /><ImportPatients /></div>}
    </div>
  )
}
