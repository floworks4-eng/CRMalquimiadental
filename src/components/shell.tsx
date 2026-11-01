'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Home, CalendarDays, Users, Package, Wallet, MessageCircle, BarChart3, ShieldCheck,
  Bell, RotateCcw, MoreHorizontal, Repeat, PlayCircle, Search, ChevronRight, HelpCircle,
  ArrowUpRight, FileImage, Route,
} from 'lucide-react'
import { useDB, useHydrated, can, sessionUser, visiblePatients, markNotificationsRead, resetDemo, setDemo, MODULE_LABEL, type Module } from '@/lib/data'
import { Avatar, Modal, NoAccess, Wordmark } from './ui'
import { DemoGuide } from './demo-guide'

type NavItem = { href: string; label: string; icon: typeof Home; module: Module; group: 'daily' | 'manage' }
const NAV: NavItem[] = [
  { href: '/inicio', label: 'Mi día', icon: Home, module: 'inicio', group: 'daily' },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, module: 'agenda', group: 'daily' },
  { href: '/pacientes', label: 'Pacientes', icon: Users, module: 'pacientes', group: 'daily' },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, module: 'whatsapp', group: 'daily' },
  { href: '/caja', label: 'Caja', icon: Wallet, module: 'caja', group: 'daily' },
  { href: '/inventario', label: 'Inventario', icon: Package, module: 'inventario', group: 'daily' },
  { href: '/analitica', label: 'Resultados', icon: BarChart3, module: 'analitica', group: 'manage' },
  { href: '/equipo', label: 'Mi equipo', icon: ShieldCheck, module: 'equipo', group: 'manage' },
]
const DETAIL_ROUTES = [
  { href: '/consulta', label: 'Atención del paciente', module: 'consulta' as Module },
  { href: '/recepcion', label: 'Recibir paciente', module: 'checkin' as Module },
  { href: '/ingesta', label: 'Importar pacientes', module: 'ingesta' as Module },
  { href: '/ruta', label: 'Guía del proyecto', module: 'ruta' as Module },
]
const ROLE_LABEL = { admin: 'Administrador', odontologo: 'Odontóloga', recepcion: 'Recepción' }

export function Shell({ children }: { children: ReactNode }) {
  const db = useDB()
  const hydrated = useHydrated()
  const router = useRouter()
  const path = usePathname()
  const [more, setMore] = useState(false)
  const [help, setHelp] = useState(false)
  const [account, setAccount] = useState(false)
  const [search, setSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const role = db.session?.role
  const user = sessionUser(db)

  useEffect(() => { if (hydrated && !db.session) router.replace('/') }, [hydrated, db.session, router])
  useEffect(() => { setMore(false); setSearch(false); setHelp(false) }, [path])

  if (!hydrated || !role || !user) return <div className="min-h-dvh" aria-busy="true" />

  const items = NAV.filter(n => can(role, n.module))
  const current = [...DETAIL_ROUTES, ...NAV].find(n => path.startsWith(n.href))
  const active = (href: string) => path.startsWith(href) || (href === '/agenda' && (path.startsWith('/consulta') || path.startsWith('/recepcion'))) || (href === '/pacientes' && path.startsWith('/ingesta'))
  const primary = items.filter(i => ['/inicio', '/agenda', '/pacientes'].includes(i.href))
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const matches = visiblePatients(db).filter(p => normalize(p.name + p.phone).includes(normalize(query))).slice(0, 7)
  const unread = db.notifications.filter(n => n.userId === user.id && !n.read).length
  const renderLink = ({ href, label, icon: Icon }: NavItem) => (
    <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className="app-nav-link">
      <Icon size={20} strokeWidth={1.65} aria-hidden />
      <span className="flex-1">{label}</span>
      {href === '/agenda' && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />}
    </Link>
  )

  return (
    <div className="app-shell md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-secondary">Saltar al contenido</a>
      <aside className="app-sidebar">
        <Link href="/inicio" className="mb-9 px-4"><Wordmark /></Link>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="mb-3 px-4 text-[0.65rem] font-medium tracking-[0.16em] text-muted">TU CLÍNICA</p>
        <nav aria-label="Principal" className="space-y-1">{items.filter(n => n.group === 'daily').map(renderLink)}</nav>
        {items.some(n => n.group === 'manage') && <>
          <p className="mb-3 mt-8 px-4 text-[0.65rem] font-medium tracking-[0.16em] text-muted">ADMINISTRACIÓN</p>
          <nav aria-label="Administración" className="space-y-1">{items.filter(n => n.group === 'manage').map(renderLink)}</nav>
        </>}
        </div>
        <div className="shrink-0 pt-5">
          <button className="app-nav-link w-full text-left" onClick={() => setHelp(true)}><HelpCircle size={20} strokeWidth={1.65} aria-hidden />¿Necesitas ayuda?</button>
          <div className="mt-4 border-t border-white/10 pt-4">
            <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5" onClick={() => setAccount(true)} aria-label={`Cuenta de ${user.name}`}>
              <Avatar name={user.name} size={38} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{user.name}</span><span className="text-xs text-muted">{ROLE_LABEL[role]}</span></span>
              <MoreHorizontal size={18} className="text-muted" aria-hidden />
            </button>
          </div>
          <p className="mt-4 px-3 text-[0.65rem] text-muted/70">Alquimia Dental · San Miguel</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="app-topbar">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/inicio" className="md:hidden" aria-label="Mi día"><Wordmark /></Link>
            <div className="hidden items-center gap-2.5 text-sm md:flex"><span className="text-muted">Tu clínica</span><ChevronRight size={14} className="text-muted/60" aria-hidden /><span>{current?.label ?? 'Mi día'}</span></div>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <button className="search-trigger md:w-64" onClick={() => { setQuery(''); setSearch(true) }} aria-label="Buscar un paciente"><Search size={17} aria-hidden /><span className="hidden md:inline">Buscar un paciente…</span></button>
            <span className="hidden rounded-full border border-gold/20 px-2.5 py-1 text-[0.65rem] text-gold-soft lg:inline-flex">Datos de ejemplo</span>
            <BellMenu userId={user.id} unread={unread} />
            <button className="md:hidden" onClick={() => setAccount(true)} aria-label="Mi cuenta"><Avatar name={user.name} size={34} /></button>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8 lg:px-10">
          {current && !can(role, current.module) ? <NoAccess what={MODULE_LABEL[current.module].toLowerCase()} /> : children}
        </main>
      </div>

      <nav aria-label="Principal en celular" className="app-bottom-nav">
        {primary.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className={`flex flex-col items-center gap-1.5 rounded-xl py-2 text-[0.7rem] ${active(href) ? 'text-gold' : 'text-muted'}`}><Icon size={21} strokeWidth={active(href) ? 2.2 : 1.6} aria-hidden />{label}</Link>)}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-1.5 rounded-xl py-2 text-[0.7rem] text-muted" aria-haspopup="dialog"><MoreHorizontal size={21} aria-hidden />Más</button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Más opciones">
        <div className="grid grid-cols-2 gap-3">{items.filter(i => !primary.includes(i)).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="quick-action flex-col items-start"><Icon size={24} className="text-gold" aria-hidden /><span className="text-sm">{label}</span></Link>)}</div>
        <button className="btn btn-ghost mt-4 w-full" onClick={() => { setMore(false); setHelp(true) }}><HelpCircle size={18} aria-hidden />Ayuda y guía</button>
      </Modal>
      <Modal open={search} onClose={() => setSearch(false)} title="Buscar un paciente">
        <label className="relative mb-4 block"><Search size={18} className="absolute left-3.5 top-3.5 text-muted" aria-hidden /><span className="sr-only">Nombre o teléfono</span><input autoFocus className="field pl-11" placeholder="Escribe un nombre o teléfono" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <p className="mb-2 text-xs text-muted">{query ? 'Resultados' : 'Pacientes de tu clínica'}</p>
        <ul>{matches.map(p => <li key={p.id}><Link href={`/pacientes/${p.id}`} onClick={() => setSearch(false)} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-white/5"><Avatar name={p.name} size={40} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="text-xs text-muted">{p.phone}</span></span><ChevronRight size={17} className="text-muted" aria-hidden /></Link></li>)}</ul>
        {!matches.length && <p className="py-8 text-center text-sm text-muted">No encontramos pacientes con esos datos.</p>}
        <Link href="/pacientes" onClick={() => setSearch(false)} className="btn btn-secondary mt-4 w-full">Ver todos los pacientes<ArrowUpRight size={16} aria-hidden /></Link>
      </Modal>
      <Modal open={account} onClose={() => setAccount(false)} title="Tu cuenta">
        <div className="flex items-center gap-3"><Avatar name={user.name} size={48} /><div><p className="font-medium">{user.name}</p><p className="text-sm text-muted">{ROLE_LABEL[role]} · Alquimia Dental</p></div></div>
        <p className="mt-5 text-sm leading-relaxed text-muted">Estás usando la demostración del sistema. Puedes explorar cómo trabaja cada integrante del equipo.</p>
        <div className="mt-5 flex flex-wrap gap-2"><Link href="/" className="btn btn-secondary"><Repeat size={16} aria-hidden />Cambiar perfil</Link><button className="btn btn-ghost" onClick={() => { setAccount(false); setConfirmReset(true) }}><RotateCcw size={16} aria-hidden />Reiniciar demo</button></div>
      </Modal>
      <Modal open={help} onClose={() => setHelp(false)} title="¿Qué necesitas hacer?">
        <div className="space-y-3">
          <Link href="/agenda" className="quick-action"><span className="icon-tile"><CalendarDays size={22} aria-hidden /></span><span><span className="block font-medium">Organizar las citas</span><span className="text-xs text-muted">Agenda, llegadas y pacientes en espera</span></span></Link>
          <Link href="/pacientes" className="quick-action"><span className="icon-tile"><Users size={22} aria-hidden /></span><span><span className="block font-medium">Encontrar un paciente</span><span className="text-xs text-muted">Su ficha, historial y próximas citas</span></span></Link>
          {can(role, 'ingesta') && <Link href="/ingesta" className="quick-action"><span className="icon-tile"><FileImage size={22} aria-hidden /></span><span><span className="block font-medium">Importar pacientes</span><span className="text-xs text-muted">Ver demostración de importación</span></span></Link>}
        </div>
        {role === 'admin' && <div className="mt-5 flex flex-wrap gap-2"><button className="btn btn-secondary text-xs" onClick={() => { setHelp(false); setDemo(0); router.push('/whatsapp') }}><PlayCircle size={16} aria-hidden />Recorrido guiado</button><Link href="/ruta" className="btn btn-ghost text-xs"><Route size={16} aria-hidden />Guía del proyecto</Link></div>}
      </Modal>
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="¿Reiniciar la demostración?">
        <p className="text-sm leading-relaxed text-muted">Las citas, cobros y cambios de esta demostración se reemplazarán por los datos de ejemplo originales.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancelar</button><button className="btn btn-primary" onClick={() => { resetDemo(); setConfirmReset(false); router.push('/inicio') }}>Reiniciar</button></div>
      </Modal>
      {db.demo && <DemoGuide step={db.demo.step} />}
    </div>
  )
}

function BellMenu({ userId, unread }: { userId: string; unread: number }) {
  const db = useDB()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const mine = db.notifications.filter(n => n.userId === userId)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  return <div ref={box} className="relative">
    <button className="btn btn-ghost relative p-2.5" aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ''}`} aria-expanded={open} onClick={() => { setOpen(!open); if (open) markNotificationsRead(userId) }}><Bell size={21} strokeWidth={1.6} aria-hidden />{unread > 0 && <span className="absolute right-1 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[0.6rem] font-semibold text-ink">{unread}</span>}</button>
    {open && <div className="glass glass-strong fade-in absolute right-0 z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] p-2 shadow-xl"><p className="px-3 py-3 text-sm font-semibold">Notificaciones</p>{!mine.length && <p className="px-3 pb-3 text-sm text-muted">No tienes avisos pendientes.</p>}<ul className="max-h-80 overflow-y-auto">{mine.map(n => <li key={n.id}><button className="flex w-full gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/5" onClick={() => { setOpen(false); markNotificationsRead(userId); router.push(n.href) }}><span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-white/15' : 'bg-gold'}`} /><span className="min-w-0 flex-1"><span className="block leading-relaxed">{n.text}</span><span className="mt-1 block text-xs text-muted">{n.at}{!n.read && ' · nueva'}</span></span></button></li>)}</ul></div>}
  </div>
}
