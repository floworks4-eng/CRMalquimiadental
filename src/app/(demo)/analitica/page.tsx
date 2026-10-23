'use client'
import { Check, Circle } from 'lucide-react'
import { useDB, todayISO, byId, bs, toMin, SOURCE_LABEL, DEMO_APPT, type Source } from '@/lib/data'
import { PageHeader, Card, Stat, Bar, SourceChip } from '@/components/ui'

const BASE_BY_SOURCE: Record<Source, number> = { whatsapp: 48, web: 17, campaign: 22 } // mes en curso [ejemplo]
const n = (x: number) => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export default function Analitica() {
  const db = useDB()
  const today = todayISO()
  const todays = db.appointments.filter((a) => a.date === today && a.status !== 'cancelada')
  const fresh = db.appointments.filter((a) => a.createdAt.startsWith(today)) // creadas hoy en la demo
  const paidBy = (ids: string[]) => db.transactions.filter((t) => t.appointmentId && ids.includes(t.appointmentId)).reduce((s, t) => s + t.amount, 0)

  const campaigns = db.campaigns.map((c) => {
    const live = fresh.filter((a) => a.campaignId === c.id)
    const appts = c.appts + live.length
    const attended = c.attended + live.filter((a) => a.status === 'atendida').length
    const revenue = c.revenue + paidBy(live.map((a) => a.id))
    return { ...c, conversations: c.conversations + live.filter((a) => a.source === 'whatsapp').length, appts, attended, revenue }
  })
  const sum = (k: 'reach' | 'conversations' | 'appts' | 'attended' | 'revenue' | 'spend') => campaigns.reduce((s, c) => s + c[k], 0)
  const funnel = [
    { label: 'Atraer', hint: 'vistas TikTok + alcance Meta', v: sum('reach') },
    { label: 'Contactar', hint: 'conversaciones de WhatsApp', v: sum('conversations') },
    { label: 'Agendar', hint: 'citas creadas', v: sum('appts') },
    { label: 'Atender', hint: 'pacientes atendidos', v: sum('attended') },
    { label: 'Cobrar', hint: bs(sum('revenue')) + ' cobrados', v: sum('attended') },
  ]
  const bySource = (['whatsapp', 'web', 'campaign'] as const).map((s) => ({ s, v: BASE_BY_SOURCE[s] + fresh.filter((a) => a.source === s).length }))
  const maxSource = Math.max(...bySource.map((x) => x.v))
  const open = toMin('20:00') - toMin('08:00')
  const occ = db.cabinets.map((c) => ({ c, pct: Math.round((todays.filter((a) => a.cabinetId === c.id).reduce((s, a) => s + a.duration, 0) / open) * 100) }))
  const demo = byId(db.appointments, DEMO_APPT)

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Marketing con trazabilidad · cifras [ejemplo] + datos en vivo de la demo" title="Analítica" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ocupación hoy" value={Math.round(occ.reduce((s, o) => s + o.pct, 0) / occ.length) + ' %'} hint="capacidad ociosa = oportunidad" />
        <Stat label="Citas del mes" value={bySource.reduce((s, x) => s + x.v, 0)} hint="todas las fuentes" />
        <Stat label="Costo por cita" value={bs(sum('spend') / sum('appts'))} hint={`inversión ${bs(sum('spend'))}`} />
        <Stat label="Retorno de campañas" value={`${(sum('revenue') / sum('spend')).toFixed(1).replace('.', ',')}×`} hint="ingreso ÷ inversión" />
      </div>

      {demo && (
        <section className="halo glass relative mb-5 p-5" aria-labelledby="trace">
          <h2 id="trace" className="title-gold text-lg">Recorrido de {byId(db.patients, demo.patientId)?.name}</h2>
          <ol className="mt-4 grid gap-2 sm:grid-cols-5">
            {[
              { t: 'Anuncio', d: `${byId(db.campaigns, demo.campaignId)?.name ?? '—'} (TikTok + Meta)`, ok: true },
              { t: 'Contacto', d: `${SOURCE_LABEL[demo.source]} · asistente`, ok: true },
              { t: 'Cita', d: `${demo.start} · ${byId(db.cabinets, demo.cabinetId)?.name}`, ok: true },
              { t: 'Atención', d: demo.checkedInAt ? `Check-in ${demo.checkedInAt}` : 'pendiente', ok: demo.status === 'atendida' },
              { t: 'Cobro', d: paidBy([demo.id]) ? bs(paidBy([demo.id])) : 'pendiente', ok: paidBy([demo.id]) > 0 },
            ].map((s) => (
              <li key={s.t} className={`rounded-xl border p-3 ${s.ok ? 'border-gold/50 bg-gold/10' : 'border-white/10'}`}>
                <p className="flex items-center gap-1.5 text-sm text-bone">
                  {s.ok ? <Check size={14} className="text-gold" aria-hidden /> : <Circle size={12} className="text-muted" aria-hidden />}
                  {s.t}<span className="sr-only">{s.ok ? ' (hecho)' : ' (pendiente)'}</span>
                </p>
                <p className="mt-1 text-xs text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Embudo · Atraer → Cobrar">
          <ol className="space-y-3">
            {funnel.map((s, i) => (
              <li key={s.label}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-bone">{i + 1}. {s.label} <span className="text-xs text-muted">· {s.hint}</span></span>
                  <span className="num">{n(s.v)}{i > 0 && i < 4 && <span className="ml-2 text-xs text-muted">{((s.v / funnel[i - 1].v) * 100).toFixed(1).replace('.', ',')} %</span>}</span>
                </div>
                <div className="mx-auto h-7 rounded-lg" style={{
                  width: `${12 + 88 * (Math.log10(Math.max(1, s.v)) / Math.log10(funnel[0].v))}%`,
                  background: `linear-gradient(90deg, rgb(201 169 97 / ${0.35 + i * 0.12}), rgb(47 123 255 / ${0.15 + i * 0.12}))`,
                  boxShadow: '0 0 16px rgb(201 169 97 / 0.2)',
                }} aria-hidden />
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">Ancho en escala logarítmica para que se lean todas las etapas.</p>
        </Card>

        <div className="space-y-5">
          <Card title="Ocupación de sillones · hoy">
            <ul className="space-y-3">
              {occ.map(({ c, pct }) => (
                <li key={c.id}>
                  <div className="mb-1 flex justify-between text-sm"><span>{c.name}</span><span className="num">{pct} %</span></div>
                  <Bar value={pct} max={100} label={`${c.name}: ${pct} %`} color={pct < 40 ? '#f2b84b' : '#c9a961'} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Citas por origen · mes">
            <ul className="space-y-3">
              {bySource.map(({ s, v }) => (
                <li key={s}>
                  <div className="mb-1 flex justify-between text-sm"><SourceChip source={s} /><span className="num">{v}</span></div>
                  <Bar value={v} max={maxSource} label={`${SOURCE_LABEL[s]}: ${v}`} color={s === 'whatsapp' ? '#2f7bff' : s === 'campaign' ? '#c9a961' : '#b5aea3'} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card title="Campañas" className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wider text-muted">
                {['Campaña', 'Inversión', 'Alcance', 'Chats', 'Citas', 'Atendidos', 'Ingresos', 'Costo / cita'].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="num">
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-white/6 last:border-0">
                  <td className="py-2.5 pr-3 font-sans"><span className="block text-bone">{c.name}</span><span className="text-xs text-muted">{c.channel}</span></td>
                  <td className="pr-3">{bs(c.spend)}</td>
                  <td className="pr-3">{n(c.reach)}</td>
                  <td className="pr-3">{c.conversations}</td>
                  <td className="pr-3">{c.appts}</td>
                  <td className="pr-3">{c.attended}</td>
                  <td className="pr-3 text-gold-soft">{bs(c.revenue)}</td>
                  <td className="pr-3">{c.spend ? bs(c.spend / c.appts) : 'orgánico'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Inversión y alcance [ejemplo]. En producción vienen de Meta Ads y TikTok; las citas, atenciones y cobros salen del sistema.</p>
      </Card>
    </div>
  )
}
