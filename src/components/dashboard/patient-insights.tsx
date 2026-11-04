import { getPatientAnalytics } from '@/server/queries/analytics'
import { SOURCE_LABEL, type AppointmentSource } from '@/lib/domain/status'

const AGE_LABEL: Record<string, string> = {
  '0-17': 'Hasta 17', '18-34': '18 a 34', '35-49': '35 a 49', '50-64': '50 a 64', '65+': '65 o más', unknown: 'Edad sin registrar',
}

function Bars({ rows, total }: { rows: { label: string; total: number }[]; total: number }) {
  if (!rows.length) return <p className="mt-3 text-sm text-muted">Aún no hay datos para mostrar.</p>
  return <ul className="mt-4 space-y-3">{rows.map((row) => (
    <li key={row.label}>
      <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-bone">{row.label}</span><span className="num shrink-0 text-muted">{row.total}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-gold" style={{ width: `${total ? Math.max(2, row.total / total * 100) : 0}%` }} /></div>
    </li>
  ))}</ul>
}

export async function PatientInsights() {
  const d = await getPatientAnalytics()
  const sourceRows = d.sources.map((x) => ({ label: SOURCE_LABEL[x.key as AppointmentSource] ?? x.key, total: x.total }))
  const ageRows = d.ages.map((x) => ({ label: AGE_LABEL[x.key] ?? x.key, total: x.total }))
  const treatmentTotal = d.treatments.reduce((sum, x) => sum + x.total, 0)
  return <section className="mt-6" aria-labelledby="patients-insights-title">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div><p className="eyebrow">Conoce a tus pacientes</p><h2 id="patients-insights-title" className="title-gold mt-1 text-xl">Estadísticas de pacientes</h2></div>
      <p className="text-sm text-muted">{d.own ? 'Pacientes a tu cargo' : 'Pacientes registrados'} <strong className="num ml-2 text-2xl text-bone">{d.total}</strong></p>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="glass p-5"><h3 className="font-medium">¿Cómo llegaron?</h3><p className="mt-1 text-xs text-muted">Fuente registrada al crear la ficha</p><Bars rows={sourceRows} total={d.total} /></div>
      <div className="glass p-5"><h3 className="font-medium">Edades</h3><p className="mt-1 text-xs text-muted">Según la fecha de nacimiento registrada</p><Bars rows={ageRows} total={d.total} /></div>
      <div className="glass p-5"><h3 className="font-medium">Tratamientos más agendados</h3><p className="mt-1 text-xs text-muted">Citas vigentes o atendidas; no incluye canceladas</p><Bars rows={d.treatments.map((x) => ({ label: x.name, total: x.total }))} total={treatmentTotal} /></div>
    </div>
  </section>
}
