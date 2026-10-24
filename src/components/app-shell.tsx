'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  CalendarDays, Users, ConciergeBell, UserRound, LogOut, LayoutDashboard, Stethoscope, Wallet, Package, Settings, Menu, type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/server/actions/auth'
import { Avatar, Wordmark } from './ui'
import { NotificationBell } from './notification-bell'
import type { NotificationItem } from '@/server/actions/agenda'

const ICONS = {
  inicio: LayoutDashboard, agenda: CalendarDays, consulta: Stethoscope, recepcion: ConciergeBell, pacientes: Users, caja: Wallet,
  inventario: Package, configuracion: Settings, cuenta: UserRound,
} satisfies Record<string, LucideIcon>
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS }

export function AppShell({ user, clinic, items, notifications, children }: {
  user: { name: string; roleLabel: string }
  clinic: string
  items: NavItem[]
  notifications: NotificationItem[]
  children: React.ReactNode
}) {
  const path = usePathname()
  const active = (href: string) => path === href || path.startsWith(href + '/')
  const [more, setMore] = useState(false)
  // En el celular: 4 accesos fijos + "Más" con el resto.
  const mobile = items.slice(0, 4)
  const rest = items.slice(4)
  return (
    <div className="md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-secondary">Saltar al contenido</a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-white/8 bg-black/15 px-4 py-6 backdrop-blur-xl md:flex">
        <Link href="/inicio" className="mb-8 px-2"><Wordmark /></Link>
        <nav aria-label="Principal" className="flex-1 space-y-1">
          {items.map(({ href, label, icon }) => {
            const Icon = ICONS[icon]
            return (
              <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-150 ${active(href) ? 'bg-white/8 text-bone ring-1 ring-gold/30' : 'text-muted hover:bg-white/5 hover:text-bone'}`}>
                <Icon size={18} strokeWidth={1.5} className={active(href) ? 'text-gold' : ''} aria-hidden />{label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-4 space-y-2 border-t border-white/8 pt-4">
          <div className="flex items-center gap-3 px-2">
            <Avatar name={user.name} size={34} />
            <span className="min-w-0 text-sm"><span className="block truncate text-bone">{user.name}</span><span className="text-xs text-muted">{user.roleLabel}</span></span>
          </div>
          <form action={signOut}><button className="btn btn-ghost w-full justify-start text-xs"><LogOut size={14} aria-hidden />Cerrar sesión</button></form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/6 bg-[#1e1f21]/70 px-4 py-3 backdrop-blur-xl md:px-8">
          <Link href="/inicio" className="md:hidden" aria-label="Inicio"><Wordmark /></Link>
          <p className="hidden text-sm text-muted md:block">{clinic}</p>
          <div className="flex items-center gap-1">
            <NotificationBell initial={notifications} />
            <Link href="/cuenta" className="md:hidden" aria-label="Mi cuenta"><Avatar name={user.name} size={32} /></Link>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 pt-6 pb-28 md:px-8 md:pb-12">{children}</main>
      </div>

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 grid border-t border-white/10 bg-[#1e1f21]/85 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${mobile.length + (rest.length ? 1 : 0)}, minmax(0, 1fr))` }}>
        {mobile.map(({ href, label, icon }) => {
          const Icon = ICONS[icon]
          return (
            <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.7rem] ${active(href) ? 'text-gold' : 'text-muted'}`}>
              <Icon size={21} strokeWidth={1.5} aria-hidden />{label}
            </Link>
          )
        })}
        {rest.length > 0 && (
          <button type="button" aria-expanded={more} aria-controls="more-nav" onClick={() => setMore((v) => !v)}
            className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.7rem] ${more || rest.some((i) => active(i.href)) ? 'text-gold' : 'text-muted'}`}>
            <Menu size={21} strokeWidth={1.5} aria-hidden />Más
          </button>
        )}
      </nav>
      {more && (
        <div id="more-nav" className="glass glass-strong fixed inset-x-3 bottom-20 z-40 grid grid-cols-3 gap-2 p-3 md:hidden">
          {rest.map(({ href, label, icon }) => {
            const Icon = ICONS[icon]
            return (
              <Link key={href} href={href} onClick={() => setMore(false)} aria-current={active(href) ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 rounded-xl py-2 text-xs ${active(href) ? 'bg-white/8 text-gold' : 'text-muted'}`}>
                <Icon size={20} strokeWidth={1.5} aria-hidden />{label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
