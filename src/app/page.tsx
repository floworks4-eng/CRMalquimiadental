'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Crown, Stethoscope, ConciergeBell, PlayCircle, CalendarPlus, QrCode, ArrowRight } from 'lucide-react'
import { setSession, resetDemo, setDemo, CLINIC, type Role } from '@/lib/data'
import { Wordmark } from '@/components/ui'

const ROLES: { role: Role; title: string; who: string; icon: typeof Crown; sees: string }[] = [
  { role: 'admin', title: 'Administrador', who: 'Doc · Director clínico', icon: Crown, sees: 'Todo: agenda, consulta, caja, inventario, analítica por campaña y equipo.' },
  { role: 'odontologo', title: 'Odontólogo', who: 'Dra. Valeria Mamani', icon: Stethoscope, sees: 'Solo su agenda y sus pacientes: anamnesis, odontograma 3D y plan.' },
  { role: 'recepcion', title: 'Recepción', who: 'Paola Condori', icon: ConciergeBell, sees: 'Agenda, check-in QR, caja y WhatsApp. Sin datos clínicos.' },
]

export default function Entrada() {
  const router = useRouter()
  const enter = (role: Role) => {
    setSession(role)
    router.push('/inicio')
  }
  const guided = () => {
    resetDemo()
    setSession('admin')
    setDemo(0)
    router.push('/whatsapp')
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-10 md:py-16">
      <div className="halo relative mx-auto text-center">
        <Wordmark size="lg" />
        <p className="mt-6 text-sm text-muted">Sistema clínico · {CLINIC.zone}</p>
      </div>

      <h1 className="eyebrow mt-12 text-center">¿Con qué rol entras?</h1>
      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {ROLES.map(({ role, title, who, icon: Icon, sees }) => (
          <li key={role}>
            <button
              onClick={() => enter(role)}
              className="glass group flex h-full w-full flex-col items-start p-6 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgb(201_169_97/0.5),0_18px_40px_rgb(0_0_0/0.4),0_0_30px_rgb(201_169_97/0.15)]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-gold/40 bg-gold/5 text-gold shadow-[0_0_20px_rgb(201_169_97/0.2)]">
                <Icon size={22} strokeWidth={1.5} aria-hidden />
              </span>
              <span className="title-gold mt-5 text-2xl">{title}</span>
              <span className="mt-1 text-sm text-bone">{who}</span>
              <span className="mt-3 flex-1 text-sm text-muted">{sees}</span>
              <span className="mt-5 inline-flex items-center gap-1 text-sm text-gold-soft">
                Entrar <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col items-center gap-3">
        <button onClick={guided} className="btn btn-primary btn-xl">
          <PlayCircle size={20} aria-hidden /> DEMO GUIADA · 5 MIN
        </button>
        <p className="text-xs text-muted">Empieza desde cero como Administrador y recorre WhatsApp → check-in → consulta → caja → analítica.</p>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Link href="/reservar" className="glass flex items-center gap-3 p-4 text-sm hover:ring-1 hover:ring-gold/40">
          <CalendarPlus className="text-gold" size={20} aria-hidden />
          <span><span className="block text-bone">Portal público /reservar</span><span className="text-muted">Versión real (requiere Supabase)</span></span>
        </Link>
        <Link href="/login" className="glass flex items-center gap-3 p-4 text-sm hover:ring-1 hover:ring-gold/40">
          <QrCode className="text-gold" size={20} aria-hidden />
          <span><span className="block text-bone">Acceso del equipo /login</span><span className="text-muted">Agenda, pacientes y recepción reales</span></span>
        </Link>
      </div>

      <p className="mt-auto pt-12 text-center text-xs text-muted/80">
        Datos ficticios · sin backend · Demo preparada por <span className="text-gold-soft">Lumen Labs</span>
      </p>
    </main>
  )
}
