'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Stethoscope, ConciergeBell, PlayCircle, CalendarPlus, QrCode, ArrowRight, ShieldCheck } from 'lucide-react'
import { setSession, resetDemo, setDemo, type Role } from '@/lib/data'
import { Wordmark } from '@/components/ui'

const ROLES: { role: Role; title: string; who: string; icon: typeof Stethoscope; description: string; color: string }[] = [
  { role: 'admin', title: 'Doctor', who: 'Doc · Director de la clínica', icon: ShieldCheck, description: 'Atiende a tus pacientes y lleva el control de tu clínica.', color: 'bg-[#544b39] text-[#efd7a4]' },
  { role: 'odontologo', title: 'Odontóloga', who: 'Dra. Valeria Mamani', icon: Stethoscope, description: 'Tu agenda, tus pacientes y sus planes de tratamiento.', color: 'bg-[#45464c] text-[#dedee5]' },
  { role: 'recepcion', title: 'Recepción', who: 'Paola Condori', icon: ConciergeBell, description: 'Organiza las citas, recibe a los pacientes y registra pagos.', color: 'bg-[#4a3e2e] text-[#ead3a7]' },
]

export default function Entrada() {
  const router = useRouter()
  const enter = (role: Role) => { setSession(role); router.push('/inicio') }
  const guided = () => { resetDemo(); setSession('admin'); setDemo(0); router.push('/whatsapp') }
  return <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-10 md:py-14">
    <header className="flex items-center justify-between gap-4"><Wordmark /><span className="rounded-full border border-gold/20 px-3 py-1.5 text-xs text-gold-soft">Demostración</span></header>
    <div className="mb-8 mt-14 text-center md:mt-20"><span className="soft-label">San Miguel · La Paz</span><h1 className="title-gold mt-5 text-3xl sm:text-[2.6rem]">Tu clínica, más simple.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">Las citas, tus pacientes y tu equipo en un solo lugar. <br className="hidden sm:block" />Elige tu perfil para empezar.</p></div>
    <ul className="grid gap-4 md:grid-cols-3">{ROLES.map(({ role, title, who, icon: Icon, description, color }) => <li key={role}><button onClick={() => enter(role)} className="glass group flex h-full w-full flex-col items-start p-6 text-left transition-colors hover:border-gold/40 hover:bg-[#414248]"><span className={`grid h-12 w-12 place-items-center rounded-2xl ${color}`}><Icon size={24} strokeWidth={1.6} aria-hidden /></span><span className="mt-5 text-xl font-semibold tracking-tight">{title}</span><span className="mt-2 text-xs text-muted">{who}</span><span className="mt-4 flex-1 text-sm leading-relaxed text-muted">{description}</span><span className="mt-6 flex w-full items-center justify-between border-t border-white/8 pt-4 text-sm font-medium text-gold">Entrar<ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden /></span></button></li>)}</ul>
    <div className="mt-7 text-center"><button onClick={guided} className="btn btn-ghost text-sm"><PlayCircle size={18} aria-hidden />Ver cómo funciona · recorrido de 5 minutos</button></div>
    <div className="mt-10 grid gap-3 border-t border-white/8 pt-6 sm:grid-cols-2"><Link href="/agendar-cita" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-white/4"><CalendarPlus className="text-muted" size={20} aria-hidden /><span className="flex-1"><span className="block font-medium">Reservar una cita</span><span className="mt-1 block text-xs text-muted">El portal que verán tus pacientes</span></span><ArrowRight size={16} className="text-muted" aria-hidden /></Link><Link href="/check-in" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-white/4"><QrCode className="text-muted" size={20} aria-hidden /><span className="flex-1"><span className="block font-medium">Registro de llegada</span><span className="mt-1 block text-xs text-muted">La ficha del paciente desde su celular</span></span><ArrowRight size={16} className="text-muted" aria-hidden /></Link></div>
    <p className="mt-auto pt-10 text-center text-[0.7rem] text-muted/80">Espacio de demostración con datos de ejemplo · Alquimia Dental</p>
  </main>
}
