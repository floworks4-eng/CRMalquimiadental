'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useDB, setDemo, byId, DEMO_APPT, type DB } from '@/lib/data'

const done = (d: DB, statuses: string[]) => statuses.includes(byId(d.appointments, DEMO_APPT)?.status ?? '')
const STEPS: { title: string; text: string; href: string; done: (d: DB) => boolean; extra?: { href: string; label: string }[] }[] = [
  {
    title: 'WhatsApp agenda la cita',
    text: 'Una paciente nueva escribe desde el anuncio de TikTok/Meta. Pulsa «Reproducir»: el asistente responde, propone horarios y agenda.',
    href: '/whatsapp',
    done: (d) => !!byId(d.appointments, DEMO_APPT),
    extra: [{ href: '/agenda', label: 'Ver en la agenda' }],
  },
  {
    title: 'Check-in con QR',
    text: 'Recepción muestra el QR. En el celular simulado, Mariela llena su anamnesis y envía: pasa a «En sala de espera» y la doctora recibe la alerta.',
    href: `/recepcion?cita=${DEMO_APPT}`,
    done: (d) => done(d, ['en_espera', 'en_atencion', 'atendida']),
  },
  {
    title: 'Iniciar atención y odontograma 3D',
    text: 'En Inicio pulsa INICIAR ATENCIÓN MÉDICA. Gira el odontograma, marca una caries y una corona: el plan de tratamiento se arma solo.',
    href: '/inicio',
    done: (d) => done(d, ['en_atencion', 'atendida']),
  },
  {
    title: 'Finalizar atención',
    text: 'Pulsa «Finalizar atención»: se descuentan los insumos, entra el cobro a caja y la cita queda atendida.',
    href: `/consulta/${DEMO_APPT}`,
    done: (d) => done(d, ['atendida']),
    extra: [{ href: '/inventario', label: 'Inventario' }, { href: '/caja', label: 'Caja' }],
  },
  {
    title: 'Analítica: de dónde vino',
    text: 'El embudo muestra el recorrido de Mariela: anuncio → WhatsApp → cita → atención → cobro. Así se mide qué anuncio trae pacientes que pagan.',
    href: '/analitica',
    done: (d) => done(d, ['atendida']),
  },
]

export function DemoGuide({ step }: { step: number }) {
  const db = useDB()
  const router = useRouter()
  const path = usePathname()
  const [min, setMin] = useState(false)
  const s = STEPS[step]
  const go = (i: number) => {
    setDemo(i)
    router.push(STEPS[i].href)
  }
  const here = path === s.href.split('?')[0]
  return (
    <aside
      aria-label="Demo guiada"
      className="glass glass-strong fade-in fixed inset-x-3 bottom-20 z-40 p-4 shadow-[0_0_40px_rgb(201_169_97/0.18)] md:inset-x-auto md:bottom-6 md:right-6 md:w-[22rem]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">Demo guiada · Paso {step + 1} de {STEPS.length}</p>
        <div className="flex">
          <button className="btn btn-ghost p-1.5" onClick={() => setMin(!min)} aria-label={min ? 'Expandir guía' : 'Minimizar guía'} aria-expanded={!min}>
            {min ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button className="btn btn-ghost p-1.5" onClick={() => setDemo(null)} aria-label="Salir de la demo guiada"><X size={16} /></button>
        </div>
      </div>
      <ol className="mt-2 flex gap-1.5" aria-hidden>
        {STEPS.map((x, i) => (
          <li key={i} className={`h-1 flex-1 rounded-full ${x.done(db) ? 'bg-gold' : i === step ? 'bg-azure' : 'bg-white/10'}`} />
        ))}
      </ol>
      {!min && (
        <div className="mt-3">
          <h2 className="title-gold flex items-center gap-2 text-lg">
            {s.title}
            {s.done(db) && <span className="inline-flex items-center gap-1 rounded-full border border-ok/40 px-2 py-0.5 font-sans text-[0.7rem] text-ok [text-shadow:none]"><Check size={12} aria-hidden />Hecho</span>}
          </h2>
          <p className="mt-1 text-sm text-muted">{s.text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!here && <Link href={s.href} className="btn btn-secondary px-3 py-1.5 text-xs">Ir a la pantalla</Link>}
            {s.extra?.map((e) => <Link key={e.href} href={e.href} className="btn btn-ghost px-3 py-1.5 text-xs">{e.label} →</Link>)}
          </div>
          <div className="mt-4 flex justify-between gap-2">
            <button className="btn btn-ghost px-3 py-1.5 text-xs" disabled={step === 0} onClick={() => go(step - 1)}>Anterior</button>
            {step < STEPS.length - 1 ? (
              <button className={`btn px-4 py-1.5 text-xs ${s.done(db) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => go(step + 1)}>Siguiente</button>
            ) : (
              <button className="btn btn-primary px-4 py-1.5 text-xs" onClick={() => setDemo(null)}>Terminar</button>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
