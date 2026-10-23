'use client'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { MessageCircle, Globe, Megaphone, Archive, X, Lock } from 'lucide-react'
import { SOURCE_LABEL, STATUS_LABEL, initials, type ApptStatus, type PatientSource } from '@/lib/data'

export function Card({ children, className = '', title, action, as: Tag = 'section' }: {
  children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; as?: 'section' | 'div'
}) {
  return (
    <Tag className={`glass p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="title-gold text-lg">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </Tag>
  )
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="title-gold text-3xl md:text-4xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

const SOURCE_ICON = { whatsapp: MessageCircle, web: Globe, campaign: Megaphone, historico: Archive }
export function SourceChip({ source, campaign }: { source: PatientSource; campaign?: string }) {
  const Icon = SOURCE_ICON[source]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap ${
        source === 'campaign' ? 'border-gold/50 text-gold-soft' : source === 'whatsapp' ? 'border-azure/50 text-[#9cc0ff]' : 'border-white/15 text-muted'
      }`}
      title={campaign ? `Campaña: ${campaign}` : undefined}
    >
      <Icon size={12} aria-hidden />
      {SOURCE_LABEL[source]}
    </span>
  )
}

const STATUS_STYLE: Record<ApptStatus, string> = {
  agendada: 'text-muted border-white/15',
  confirmada: 'text-bone border-white/25',
  en_espera: 'text-warn border-warn/50 bg-warn/10',
  en_atencion: 'text-[#9cc0ff] border-azure/60 bg-azure/10',
  atendida: 'text-ok border-ok/40 bg-ok/10',
  no_asistio: 'text-bad border-bad/40',
  cancelada: 'text-muted border-white/10 line-through',
}
const STATUS_DOT: Record<ApptStatus, string> = {
  agendada: '○', confirmada: '●', en_espera: '◐', en_atencion: '▶', atendida: '✓', no_asistio: '✕', cancelada: '–',
}
export function StatusBadge({ status }: { status: ApptStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}>
      <span aria-hidden>{STATUS_DOT[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="glass px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-2xl text-bone">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full border border-gold/40 bg-gradient-to-b from-white/10 to-white/0 font-display text-gold"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  )
}

/** Modal accesible: foco inicial, Escape para cerrar, foco atrapado con <dialog>. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`glass glass-strong m-auto w-[calc(100%-2rem)] p-0 text-bone backdrop:bg-black/60 backdrop:backdrop-blur-sm ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
    >
      {open && (
        <div className="fade-in p-5 md:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={id} className="title-gold text-xl">{title}</h2>
            <button className="btn btn-ghost -mr-2 -mt-1 p-2" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId()
  const errId = error ? id + '-err' : hint ? id + '-hint' : undefined
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children(id, errId)}
      {error ? (
        <p id={errId} role="alert" className="mt-1 text-xs text-bad">{error}</p>
      ) : hint ? (
        <p id={errId} className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function NoAccess({ what }: { what: string }) {
  return (
    <div className="glass mx-auto mt-10 max-w-md p-8 text-center">
      <Lock className="mx-auto mb-3 text-gold" aria-hidden />
      <h1 className="title-gold text-2xl">Sin acceso</h1>
      <p className="mt-2 text-sm text-muted">Tu rol no tiene permiso para ver {what}. Los datos de salud solo los ve quien los necesita.</p>
    </div>
  )
}

/** Barra horizontal simple (gráficos hechos a mano, sin librerías). */
export function Bar({ value, max, color = 'var(--color-gold)', label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <div role="img" aria-label={label} className="h-2.5 w-full overflow-hidden rounded-full bg-white/8">
      <div className="h-full rounded-full transition-[width] duration-200" style={{ width: pct + '%', background: color, boxShadow: `0 0 12px ${color}` }} />
    </div>
  )
}

/** Wordmark de texto (sin logo oficial hasta que la clínica lo entregue). */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="inline-flex flex-col leading-none" aria-label="Alquimia Dental">
      <span className={`title-gold italic ${size === 'lg' ? 'text-5xl md:text-6xl' : 'text-2xl'}`}>Alquimia</span>
      <span className={`mt-1 self-end font-sans font-medium tracking-[0.42em] text-bone/80 ${size === 'lg' ? 'text-sm' : 'text-[0.6rem]'}`}>DENTAL</span>
    </span>
  )
}
