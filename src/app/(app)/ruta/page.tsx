'use client'
import { Flag } from 'lucide-react'
import { PageHeader, Card } from '@/components/ui'

const PHASES = [
  { n: 1, from: 1, to: 5, title: 'Cimientos y migración', items: ['WhatsApp Business API con el número histórico', 'Base de datos, roles y accesos', 'Migración de Excel y fichas en papel con revisión humana'] },
  { n: 2, from: 6, to: 12, title: 'Construcción', items: ['Agenda por gabinete y check-in QR', 'Ficha, odontograma 3D y plan de tratamiento', 'Inventario por receta y caja', 'Asistente de WhatsApp y /agendar-cita'] },
  { n: 3, from: 13, to: 18, title: 'Lanzamiento de campañas', items: ['Videos orgánicos de TikTok', 'Meta Ads geolocalizados (San Miguel y alrededores)', 'Atribución por campaña y plantillas de recordatorio aprobadas'] },
  { n: 4, from: 19, to: 22, title: 'Piloto', items: ['Operación real con el equipo', 'Ajustes diarios', 'Hito: primer paciente real de campaña atendido y cobrado'] },
  { n: 5, from: 23, to: 25, title: 'Capacitación y entrega', items: ['Capacitación por rol', 'Guías breves de uso', 'Entrega y soporte'] },
]
const MILESTONE = 22

export default function Ruta() {
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Plan de implementación" title="Ruta de 25 días" />
      <Card>
        <div className="relative pt-8" aria-hidden>
          <div className="flex h-3 overflow-hidden rounded-full">
            {PHASES.map((p) => (
              <div key={p.n} style={{ width: `${((p.to - p.from + 1) / 25) * 100}%`, opacity: 0.45 + p.n * 0.11 }} className="border-r-2 border-ink bg-gradient-to-r from-gold to-gold-soft last:border-0" />
            ))}
          </div>
          <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${(MILESTONE / 25) * 100}%` }}>
            <Flag size={16} className="mx-auto text-azure drop-shadow-[0_0_8px_#2f7bff]" />
          </div>
          <div className="num mt-2 flex justify-between text-xs text-muted"><span>Día 1</span><span>Día 25</span></div>
        </div>
        <p className="mt-2 text-sm text-muted"><Flag size={13} className="mr-1 inline text-azure" aria-hidden />Hito del primer paciente real: hasta el día {MILESTONE}.</p>
      </Card>
      <ol className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {PHASES.map((p) => (
          <li key={p.n} className={`glass p-5 ${p.n === 4 ? 'ring-1 ring-azure/50' : ''}`}>
            <p className="eyebrow">Fase {p.n} · días {p.from}–{p.to}</p>
            <h2 className="title-gold mt-1 text-lg">{p.title}</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              {p.items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="text-gold">·</span>{i}</li>)}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
