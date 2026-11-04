'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import {
  CalendarDays,
  Users,
  ConciergeBell,
  UserRound,
  LogOut,
  LayoutDashboard,
  Stethoscope,
  Wallet,
  Package,
  Settings,
  MoreHorizontal,
  Search,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/server/actions/auth'
import { Avatar, Modal, Wordmark } from './ui'

const ICONS = {
  inicio: LayoutDashboard,
  agenda: CalendarDays,
  consulta: Stethoscope,
  dientes: Stethoscope,
  recepcion: ConciergeBell,
  pacientes: Users,
  caja: Wallet,
  inventario: Package,
  configuracion: Settings,
  cuenta: UserRound,
} satisfies Record<string, LucideIcon>
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS }

export function AppShell({
  user,
  clinic,
  items,
  notifications,
  children,
}: {
  user: { name: string; roleLabel: string }
  clinic: string
  items: NavItem[]
  notifications: React.ReactNode
  children: React.ReactNode
}) {
  const path = usePathname()
  const router = useRouter()
  const [more, setMore] = useState(false)
  const [search, setSearch] = useState(false)
  const active = (href: string) =>
    path === href || path.startsWith(href + '/') || (href === '/agenda' && (path.startsWith('/consulta') || path.startsWith('/recepcion')))
  const current = path.startsWith('/consulta') ? 'Atención del paciente' : (items.find((i) => active(i.href))?.label ?? 'Tu clínica')
  const primary = items.filter((i) => ['/inicio', '/agenda', '/pacientes'].includes(i.href))
  const daily = items.filter((i) => !['configuracion', 'cuenta'].includes(i.icon))
  const management = items.filter((i) => i.icon === 'configuracion')
  const rest = items.filter((i) => !primary.includes(i))
  const find = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = String(new FormData(e.currentTarget).get('q') ?? '').trim()
    setSearch(false)
    router.push(`/pacientes${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  }
  const renderLink = ({ href, label, icon }: NavItem) => {
    const Icon = ICONS[icon]
    return (
      <Link key={href} href={href} onClick={() => setMore(false)} aria-current={active(href) ? 'page' : undefined} className="app-nav-link">
        <Icon size={20} strokeWidth={1.65} aria-hidden />
        <span className="flex-1">{label}</span>
      </Link>
    )
  }
  return (
    <div className="app-shell md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-secondary">
        Saltar al contenido
      </a>
      <aside className="app-sidebar">
        <Link href="/inicio" className="mb-9 px-4">
          <Wordmark />
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-3 px-4 text-[0.65rem] font-medium tracking-[0.16em] text-muted">TU CLÍNICA</p>
          <nav aria-label="Principal" className="space-y-1">
            {daily.map(renderLink)}
          </nav>
          {management.length > 0 && (
            <>
              <p className="mb-3 mt-8 px-4 text-[0.65rem] font-medium tracking-[0.16em] text-muted">ADMINISTRACIÓN</p>
              <nav aria-label="Administración" className="space-y-1">
                {management.map(renderLink)}
              </nav>
            </>
          )}
        </div>
        <div className="shrink-0 pt-5">
          <div className="border-t border-white/10 pt-4">
            <Link href="/cuenta" className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
              <Avatar name={user.name} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="text-xs text-muted">{user.roleLabel}</span>
              </span>
              <MoreHorizontal size={18} className="text-muted" aria-hidden />
            </Link>
            <form action={signOut}>
              <button className="btn btn-ghost mt-2 w-full justify-start text-xs">
                <LogOut size={15} aria-hidden />
                Cerrar sesión
              </button>
            </form>
          </div>
          <p className="mt-3 truncate px-3 text-[0.65rem] text-muted/70">{clinic}</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="app-topbar">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/inicio" className="md:hidden" aria-label="Mi día">
              <Wordmark />
            </Link>
            <div className="hidden min-w-0 items-center gap-2.5 text-sm md:flex">
              <span className="truncate text-muted">{clinic}</span>
              <ChevronRight size={14} className="shrink-0 text-muted/60" aria-hidden />
              <span className="shrink-0">{current}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <form onSubmit={find} className="search-trigger hidden w-64 md:flex">
              <Search size={17} className="shrink-0" aria-hidden />
              <label className="sr-only" htmlFor="global-patient-search">
                Buscar un paciente
              </label>
              <input
                id="global-patient-search"
                name="q"
                placeholder="Buscar un paciente…"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                autoComplete="off"
              />
              <button type="submit" className="sr-only">
                Buscar
              </button>
            </form>
            <button className="search-trigger md:hidden" onClick={() => setSearch(true)} aria-label="Buscar un paciente">
              <Search size={17} />
            </button>
            {notifications}
            <Link href="/cuenta" className="md:hidden" aria-label="Mi cuenta">
              <Avatar name={user.name} size={34} />
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8 lg:px-10">
          {children}
        </main>
      </div>
      <nav aria-label="Principal en celular" className="app-bottom-nav">
        {primary.map(({ href, label, icon }) => {
          const Icon = ICONS[icon]
          return (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? 'page' : undefined}
              className={`flex flex-col items-center gap-1.5 rounded-xl py-2 text-[0.7rem] ${active(href) ? 'text-gold' : 'text-muted'}`}
            >
              <Icon size={21} strokeWidth={active(href) ? 2.2 : 1.6} aria-hidden />
              {label}
            </Link>
          )
        })}
        <button
          onClick={() => setMore(true)}
          className="flex flex-col items-center gap-1.5 rounded-xl py-2 text-[0.7rem] text-muted"
          aria-haspopup="dialog"
        >
          <MoreHorizontal size={21} aria-hidden />
          Más
        </button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Más opciones">
        <div className="grid grid-cols-2 gap-3">
          {rest.map(({ href, label, icon }) => {
            const Icon = ICONS[icon]
            return (
              <Link key={href} href={href} onClick={() => setMore(false)} className="quick-action flex-col items-start">
                <Icon size={24} className="text-gold" aria-hidden />
                <span className="text-sm">{label}</span>
              </Link>
            )
          })}
        </div>
        <form action={signOut}>
          <button className="btn btn-ghost mt-4 w-full">
            <LogOut size={16} aria-hidden />
            Cerrar sesión
          </button>
        </form>
      </Modal>
      <Modal open={search} onClose={() => setSearch(false)} title="Buscar un paciente">
        <form onSubmit={find} className="space-y-4">
          <label className="block">
            <span className="label">Nombre o celular</span>
            <input autoFocus name="q" className="field" placeholder="Escribe un nombre o teléfono" autoComplete="off" />
          </label>
          <button className="btn btn-primary w-full">
            <Search size={17} aria-hidden />
            Buscar en pacientes
          </button>
        </form>
      </Modal>
    </div>
  )
}
