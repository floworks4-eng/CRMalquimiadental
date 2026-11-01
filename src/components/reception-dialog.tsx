'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CheckCircle2, ExternalLink, QrCode, ShieldCheck, ArrowRight } from 'lucide-react'
import { useDB, byId } from '@/lib/data'
import { Modal, Avatar } from './ui'

export function ReceptionDialog({ appointmentId, onClose }: { appointmentId?: string; onClose: () => void }) {
  const db = useDB()
  const appointment = byId(db.appointments, appointmentId)
  const patient = appointment && byId(db.patients, appointment.patientId)
  const [svg, setSvg] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setSvg(''); setError('')
    if (!appointmentId) return
    const target = `${window.location.origin}/check-in?cita=${encodeURIComponent(appointmentId)}`
    setUrl(target)
    QRCode.toString(target, { type: 'svg', margin: 1, color: { dark: '#303135', light: '#ffffff' } })
      .then(value => { if (!cancelled) setSvg(value) })
      .catch(() => { if (!cancelled) setError('No se pudo generar el código. Puedes abrir el formulario con el botón de abajo.') })
    return () => { cancelled = true }
  }, [appointmentId])
  const arrived = appointment && ['en_espera', 'en_atencion', 'atendida'].includes(appointment.status)
  return <Modal open={!!appointmentId} onClose={onClose} title="Recibir paciente">
    {appointment && patient ? <>
      <div className="flex items-center gap-3 rounded-xl bg-white/4 p-3"><Avatar name={patient.name} size={44} /><div><p className="text-sm font-semibold">{patient.name}</p><p className="mt-1 text-xs text-muted">{appointment.start} · {byId(db.cabinets, appointment.cabinetId)?.name}</p></div></div>
      {arrived ? <div className="py-8 text-center" role="status"><CheckCircle2 size={52} className="mx-auto mb-4 text-ok" aria-hidden /><h3 className="text-xl font-semibold">El paciente ya está registrado</h3><p className="mt-2 text-sm leading-relaxed text-muted">Su ficha fue recibida y ya aparece en la agenda con su estado actualizado.</p><Link href="/agenda?vista=espera" onClick={onClose} className="btn btn-primary mt-5">Ver sala de espera<ArrowRight size={16} aria-hidden /></Link></div> : <>
        <div className="mt-6 text-center"><span className="mb-2 inline-flex items-center gap-2 text-sm font-medium"><QrCode size={17} className="text-ok" aria-hidden />Escanear y completar la ficha</span><p className="text-sm leading-relaxed text-muted">El paciente escanea este código con su celular. Al enviar su ficha, aparecerá en la sala de espera.</p></div>
        {svg ? <div className="mx-auto my-5 w-[218px] rounded-2xl bg-white p-3" role="img" aria-label={`Código QR de registro de ${patient.name}`} dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="py-8 text-center text-sm text-muted" role="status">{error || 'Preparando código…'}</p>}
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary w-full">Abrir formulario en otra pestaña<ExternalLink size={16} aria-hidden /></a>
        <p className="mt-4 flex items-start justify-center gap-2 text-xs leading-relaxed text-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />Los datos clínicos de la ficha solo están disponibles para el profesional que atiende al paciente.</p>
      </>}
    </> : <p className="py-6 text-sm text-muted">No se encontró esta cita.</p>}
  </Modal>
}
