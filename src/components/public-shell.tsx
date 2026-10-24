import type { ReactNode } from 'react'
import Link from 'next/link'
import { Wordmark } from './ui'

/** Marco de las paginas publicas (check-in, reservas, textos legales). */
export function PublicShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto px-4 py-8 md:py-12 ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
      <header className="mb-6">
        <Link href="/reservar" aria-label="Alquimia Dental, reservar cita"><Wordmark /></Link>
      </header>
      {children}
      <footer className="mt-10 text-center text-xs text-muted">
        <Link href="/privacidad" className="hover:text-bone hover:underline">Privacidad</Link>
        <span aria-hidden> · </span>
        <Link href="/consentimiento" className="hover:text-bone hover:underline">Consentimiento</Link>
      </footer>
    </main>
  )
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass p-6" role="status">
      <h1 className="title-gold text-2xl">{title}</h1>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </div>
  )
}
