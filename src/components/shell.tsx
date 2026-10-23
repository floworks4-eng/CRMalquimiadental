'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Home, CalendarDays, QrCode, Users, Stethoscope, Package, Wallet, MessageCircle, BarChart3, ScanText, ShieldCheck,
  Route, Bell, RotateCcw, MoreHorizontal, Repeat, PlayCircle,
} from 'lucide-react'
import { useDB, useHydrated, can, sessionUser, markNotificationsRead, resetDemo, setDemo, MODULE_LABEL, type Module, type Role } from '@/lib/data'
import { Avatar, Modal, NoAccess, Wordmark } from './ui'
import { DemoGuide } from './demo-guide'

const NAV: { href: string; label: string; icon: typeof Home; module: Module }[] = [
  { href: '/inicio', label: 'Inicio', icon: Home, module: 'inicio' },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, module: 'agenda' },
  { href: '/recepcion', label: 'Check-in', icon: QrCode, module: 'checkin' },
  { href: '/pacientes', label: 'Pacientes', icon: Users, module: 'pacientes' },
  { href: '/consulta', label: 'Consulta', icon: Stethoscope, module: 'consulta' },
  { href: '/inventario', label: 'Inventario', icon: Package, module: 'inventario' },
  { href: '/caja', label: 'Caja', icon: Wallet, module: 'caja' },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, module: 'whatsapp' },
  { href: '/analitica', label: 'Analítica', icon: BarChart3, module: 'analitica' },
  { href: '/ingesta', label: 'Ingesta OCR', icon: ScanText, module: 'ingesta' },
  { href: '/equipo', label: 'Equipo y roles', icon: ShieldCheck, module: 'equipo' },
  { href: '/ruta', label: 'Ruta 25 días', icon: Route, module: 'ruta' },
]
// Pestañas de la barra inferior en celular (la 4.ª es «Más»).
const MOBILE: Record<Role, string[]> = {
  admin: ['/inicio', '/agenda', '/analitica'],
  odontologo: ['/inicio', '/agenda', '/consulta'],
  recepcion: ['/inicio', '/agenda', '/recepcion'],
}
const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', odontologo: 'Odontólogo', recepcion: 'Recepción' }

export function Shell({ children }: { children: ReactNode }) {
  const db = useDB()
  const hydrated = useHydrated()
  const router = useRouter()
  const path = usePathname()
  const [more, setMore] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const role = db.session?.role
  const user = sessionUser(db)

  useEffect(() => {
    if (hydrated && !db.session) router.replace('/')
  }, [hydrated, db.session, router])

  if (!hydrated || !role || !user) return <div className="min-h-dvh" aria-busy="true" />

  const items = NAV.filter((n) => can(role, n.module))
  const current = NAV.find((n) => path.startsWith(n.href))
  const active = (href: string) => path.startsWith(href)
  const primary = MOBILE[role].map((h) => items.find((i) => i.href === h)!)

  return (
    <div className="md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-secondary">Saltar al contenido</a>
      {/* Barra lateral (laptop) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-white/8 bg-black/15 px-4 py-6 backdrop-blur-xl md:flex">
        <Link href="/inicio" className="mb-8 px-2"><Wordmark /></Link>
        <nav aria-label="Principal" className="flex-1 space-y-1 overflow-y-auto">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-150 ${
                active(href) ? 'bg-white/8 text-bone shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] ring-1 ring-gold/30' : 'text-muted hover:bg-white/5 hover:text-bone'
              }`}
            >
              <Icon size={18} strokeWidth={1.5} className={active(href) ? 'text-gold' : ''} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 space-y-2 border-t border-white/8 pt-4">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
            <Avatar name={user.name} size={34} />
            <span className="min-w-0 text-sm">
              <span className="block truncate text-bone">{user.name}</span>
              <span className="flex items-center gap-1 text-xs text-muted"><Repeat size={11} aria-hidden /> {ROLE_LABEL[role]} · cambiar</span>
            </span>
          </Link>
          <button className="btn btn-ghost w-full justify-start text-xs" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} aria-hidden /> Reiniciar demo
          </button>
          <p className="px-2 text-[0.65rem] text-muted/80">Demo preparada por Lumen Labs</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/6 bg-[#1e1f21]/70 px-4 py-3 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/inicio" className="md:hidden" aria-label="Inicio"><Wordmark /></Link>
            <p className="hidden text-sm text-muted md:block">
              {current?.label ?? 'Consulta'} <span className="text-white/20">·</span> Alquimia Dental · San Miguel
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!db.demo && role === 'admin' && (
              <button className="btn btn-secondary px-3 py-1.5 text-xs" onClick={() => { setDemo(0); router.push('/whatsapp') }}>
                <PlayCircle size={15} aria-hidden /> <span className="hidden sm:inline">Demo guiada</span>
              </button>
            )}
            <Bell_ userId={user.id} />
            <Link href="/" className="md:hidden" aria-label={`${user.name} · cambiar rol`}><Avatar name={user.name} size={32} /></Link>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-7xl px-4 pt-6 pb-28 md:px-8 md:pb-12">
          {current && !can(role, current.module) ? <NoAccess what={MODULE_LABEL[current.module].toLowerCase()} /> : children}
          <p className="mt-12 text-center text-xs text-muted/70 md:hidden">Demo preparada por Lumen Labs</p>
        </main>
      </div>

      {/* Barra inferior (celular) */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-[#1e1f21]/85 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl md:hidden">
        {primary.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.7rem] ${active(href) ? 'text-gold' : 'text-muted'}`}>
            <Icon size={21} strokeWidth={1.5} aria-hidden />{label}
          </Link>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.7rem] text-muted" aria-haspopup="dialog">
          <MoreHorizontal size={21} strokeWidth={1.5} aria-hidden />Más
        </button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Más módulos">
        <div className="grid grid-cols-2 gap-2">
          {items.filter((i) => !primary.includes(i)).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMore(false)} className="glass flex items-center gap-2 px-3 py-3 text-sm"><Icon size={18} className="text-gold" aria-hidden />{label}</Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/" onClick={() => setMore(false)} className="btn btn-secondary text-xs"><Repeat size={14} aria-hidden />Cambiar rol</Link>
          <button className="btn btn-ghost text-xs" onClick={() => { setMore(false); setConfirmReset(true) }}><RotateCcw size={14} aria-hidden />Reiniciar demo</button>
        </div>
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="¿Reiniciar la demo?">
        <p className="text-sm text-muted">Se borran las citas, cobros y cambios hechos en esta sesión y se vuelve a los datos de ejemplo.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { resetDemo(); setConfirmReset(false); router.push('/inicio') }}>Reiniciar</button>
        </div>
      </Modal>

      {db.demo && <DemoGuide step={db.demo.step} />}
    </div>
  )
}

function Bell_({ userId }: { userId: string }) {
  const db = useDB()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const mine = db.notifications.filter((n) => n.userId === userId)
  const unread = mine.filter((n) => !n.read).length
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button
        className="btn btn-ghost relative p-2"
        aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ''}`}
        aria-expanded={open}
        onClick={() => { setOpen(!open); if (open) markNotificationsRead(userId) }}
      >
        <Bell size={20} strokeWidth={1.5} aria-hidden />
        {unread > 0 && (
          <span className="num absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-azure px-1 text-[0.65rem] font-semibold text-white shadow-[0_0_12px_#2f7bff]">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="glass glass-strong fade-in absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] p-2">
          <p className="eyebrow px-3 py-2">Notificaciones</p>
          {mine.length === 0 && <p className="px-3 pb-3 text-sm text-muted">Sin notificaciones.</p>}
          <ul className="max-h-80 overflow-y-auto">
            {mine.map((n) => (
              <li key={n.id}>
                <button
                  className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/6"
                  onClick={() => { setOpen(false); markNotificationsRead(userId); router.push(n.href) }}
                >
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-white/15' : 'bg-azure shadow-[0_0_8px_#2f7bff]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-bone">{n.text}</span>
                    <span className="num text-xs text-muted">{n.at}{!n.read && ' · nueva'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
