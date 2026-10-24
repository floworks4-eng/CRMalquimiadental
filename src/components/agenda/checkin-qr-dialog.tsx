'use client'
import { useEffect, useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { Modal } from '../ui'
import { issueCheckinToken } from '@/server/actions/checkin'
import { formatTime } from '@/lib/domain/time'
import type { AppointmentCard } from '@/server/queries/types'

type Issued = { url: string; qrSvg: string; expiresAt: string }

/** Recepcion muestra el QR (o copia el enlace) para que el paciente haga su check-in desde su celular. */
export function CheckinQrDialog({ appointment: a, onClose }: { appointment: AppointmentCard | null; onClose: () => void }) {
  return (
    <Modal open={!!a} onClose={onClose} title={a ? `Check-in · ${a.patient?.fullName ?? 'Paciente'}` : 'Check-in'}>
      {a && <Body key={a.id} a={a} />}
    </Modal>
  )
}

function Body({ a }: { a: AppointmentCard }) {
  const [issued, setIssued] = useState<Issued | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [round, setRound] = useState(0)

  // Cada vez que se abre (o se pide uno nuevo) se emite un enlace nuevo; el anterior deja de servir.
  useEffect(() => {
    let stale = false
    issueCheckinToken({ appointmentId: a.id }).then((r) => {
      if (stale) return
      if (r.ok) {
        setIssued(r.data)
        setError('')
      } else setError(r.error.message)
    })
    return () => {
      stale = true
    }
  }, [a.id, round])

  if (error) return <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>
  if (!issued) return <p className="text-sm text-muted" aria-busy="true">Generando el código…</p>
  return (
    <div className="text-center">
      <p className="text-sm text-muted">Cita de las <span className="num text-bone">{formatTime(a.startsAt)}</span> · {a.dentist.fullName}</p>
      <div
        role="img"
        aria-label="Código QR del check-in. El paciente lo escanea con la cámara de su celular."
        className="mx-auto my-5 w-full max-w-[260px] overflow-hidden rounded-2xl bg-bone p-3 shadow-[0_0_40px_rgb(201_169_97/0.25)]"
        // SVG generado en el servidor por la libreria qrcode a partir de nuestra propia URL; no contiene datos del usuario.
        dangerouslySetInnerHTML={{ __html: issued.qrSvg }}
      />
      <p className="text-xs text-muted">Vence a las <span className="num">{formatTime(issued.expiresAt)}</span>. Sirve una sola vez.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          className="btn btn-secondary text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(issued.url)
            setCopied(true)
          }}
        >
          <Copy size={14} aria-hidden />{copied ? 'Enlace copiado' : 'Copiar enlace (para WhatsApp)'}
        </button>
        <button className="btn btn-ghost text-xs" onClick={() => { setIssued(null); setCopied(false); setRound((n) => n + 1) }}>
          <RefreshCw size={14} aria-hidden />Generar otro
        </button>
      </div>
      <p className="mt-4 text-xs text-muted">Cuando el paciente envíe su ficha, pasará solo a «En sala de espera».</p>
    </div>
  )
}
