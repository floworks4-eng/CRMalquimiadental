'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { listNotifications, markNotificationsRead, type NotificationItem } from '@/server/actions/agenda'
import { formatTime } from '@/lib/domain/time'

const POLL_MS = 15_000

export function NotificationBell({ initial }: { initial: NotificationItem[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const unread = items.filter((n) => !n.readAt).length

  // Polling cada 15 s mientras la pestaña esta visible (Realtime llega mas adelante).
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') listNotifications().then(setItems).catch(() => {})
    }
    const t = setInterval(tick, POLL_MS)
    return () => clearInterval(t)
  }, [])

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

  const toggle = () => {
    setOpen(!open)
    if (open && unread) markNotificationsRead().then(() => setItems((l) => l.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))))
  }
  return (
    <div ref={box} className="relative">
      <button className="btn btn-ghost relative p-2" aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ''}`} aria-expanded={open} onClick={toggle}>
        <Bell size={20} strokeWidth={1.5} aria-hidden />
        {unread > 0 && (
          <span className="num absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-azure px-1 text-[0.65rem] font-semibold text-white shadow-[0_0_12px_#2f7bff]">{unread}</span>
        )}
      </button>
      {open && (
        <div className="glass glass-strong fade-in absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] p-2">
          <p className="eyebrow px-3 py-2">Notificaciones</p>
          {items.length === 0 && <p className="px-3 pb-3 text-sm text-muted">Sin notificaciones.</p>}
          <ul className="max-h-80 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/6"
                  onClick={() => {
                    setOpen(false)
                    markNotificationsRead().then(() => setItems((l) => l.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() }))))
                    if (n.href) router.push(n.href)
                  }}
                >
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-white/15' : 'bg-azure shadow-[0_0_8px_#2f7bff]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-bone">{n.title}</span>
                    {n.body && <span className="block text-muted">{n.body}</span>}
                    <span className="num text-xs text-muted">{formatTime(n.createdAt)}{!n.readAt && ' · nueva'}</span>
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
