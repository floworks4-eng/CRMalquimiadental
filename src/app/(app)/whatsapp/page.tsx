'use client'
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Play, Pause, StepForward, RotateCcw, Hand, Bot, ArrowLeft, Send, Megaphone, CalendarCheck, Search, MessageCircle, ChevronRight } from 'lucide-react'
import { useDB, createAppointment, todayISO, addDays, fecha, byId, CLINIC, DEMO_APPT, DEMO_PATIENT } from '@/lib/data'
import { PageHeader, Avatar } from '@/components/ui'

type Msg = { from: 'patient' | 'bot' | 'staff' | 'system'; text: string; quick?: string[]; at: string; tag?: string; book?: boolean }

const today = () => fecha(todayISO())
const CHATS: { id: string; name: string; sub: string; msgs: () => Msg[] }[] = [
  {
    id: 'nuevo',
    name: 'Mariela Quispe',
    sub: 'Consulta por una limpieza',
    msgs: () => [
      { from: 'system', at: '10:41', text: 'Llegó desde el anuncio «Limpieza San Miguel» (TikTok + Meta Ads). Se guarda la campaña para medir el resultado.', tag: 'ad' },
      { from: 'patient', at: '10:41', text: 'Hola 👋 vi su video en TikTok. ¿Cuánto cuesta la limpieza?' },
      { from: 'bot', at: '10:41', text: '¡Hola! Soy el asistente de Alquimia Dental 🦷 La limpieza dental (profilaxis) cuesta Bs. 150 [ejemplo] e incluye revisión. ¿Te reservo un horario?' },
      { from: 'patient', at: '10:42', text: '¿Dónde están ubicados?' },
      { from: 'bot', at: '10:42', text: `Estamos en ${CLINIC.zone} 📍 Atendemos ${CLINIC.hours}.` },
      { from: 'patient', at: '10:43', text: 'Ya, quiero agendar para hoy en la tarde' },
      { from: 'bot', at: '10:43', text: 'Perfecto. Hoy tengo libre con la Dra. Valeria Mamani:', quick: ['16:00', '17:30', '18:30'] },
      { from: 'patient', at: '10:43', text: '17:30' },
      { from: 'bot', at: '10:43', text: '¿Me confirmas tu nombre completo?' },
      { from: 'patient', at: '10:44', text: 'Mariela Quispe Laura' },
      { from: 'bot', at: '10:44', book: true, text: `Listo, Mariela ✅\nLimpieza dental · hoy ${today()} · 17:30\nGabinete 2 · Dra. Valeria Mamani\n\nTe enviaremos recordatorios. Al llegar, escanea el QR de recepción para llenar tu ficha sin papel.` },
      { from: 'system', at: '10:44', text: 'Cita creada en la agenda · origen WhatsApp · campaña «Limpieza San Miguel».', tag: 'booked' },
    ],
  },
  {
    id: 'conocido',
    name: 'Juan Carlos Quispe',
    sub: 'Quiere reprogramar su cita',
    msgs: () => [
      { from: 'system', at: '22:14', text: 'Número reconocido: Juan Carlos Quispe Mamani · ortodoncia en curso · Doc.', tag: 'id' },
      { from: 'patient', at: '22:14', text: 'Buenas noches, ¿me pueden cambiar mi control de ortodoncia?' },
      { from: 'bot', at: '22:14', text: `¡Hola, Juan Carlos! 👋 Te reconocí por tu número. Tu próximo control es el ${fecha(addDays(todayISO(), 7))} a las 08:30. Puedo moverlo a:`, quick: ['Lun 08:30', 'Mar 18:00', 'Hablar con recepción'] },
      { from: 'patient', at: '22:15', text: 'Hablar con recepción' },
      { from: 'bot', at: '22:15', text: 'Claro. Te paso con Paola de recepción; te responde mañana desde las 08:30 🙌' },
      { from: 'system', at: '22:15', text: 'Conversación marcada para el equipo. El asistente respondió fuera de horario: ningún mensaje queda sin respuesta.', tag: 'team' },
    ],
  },
  {
    id: 'recordatorios',
    name: 'Gabriela Rojas',
    sub: 'Cita confirmada para mañana',
    msgs: () => [
      { from: 'bot', at: 'Ayer 09:30', tag: 'Plantilla aprobada · recordatorio_48h', text: `Hola Gabriela 👋 Te esperamos el ${fecha(addDays(todayISO(), 1))} a las 09:30 para tu Limpieza dental en Alquimia Dental (San Miguel).\nResponde 1 para confirmar o 2 para reprogramar.` },
      { from: 'patient', at: 'Ayer 09:52', text: '1' },
      { from: 'bot', at: 'Ayer 09:52', text: '¡Gracias! Tu cita quedó confirmada ✅' },
      { from: 'bot', at: 'Hoy 09:30', tag: 'Plantilla aprobada · recordatorio_24h', text: `Mañana a las 09:30 te esperamos 🦷\n📍 ${CLINIC.zone}\nLlega 10 min antes y escanea el QR de recepción.` },
      { from: 'patient', at: 'Hoy 09:41', text: '👍 Gracias' },
    ],
  },
]

const SLOTS = ['17:30', '18:30', '16:00']
function book() {
  // Intenta el horario elegido en el chat y, si ya está ocupado, el siguiente libre.
  for (const start of SLOTS) {
    const r = createAppointment({
      id: DEMO_APPT, newPatient: { id: DEMO_PATIENT, name: 'Mariela Quispe Laura', phone: '+591 7000 4321' }, dentistId: 'u-val', cabinetId: 'c2',
      date: todayISO(), start, duration: 45, procedureId: 'limpieza', source: 'whatsapp', campaignId: 'cmp-limpieza', status: 'confirmada',
    })
    if (!r.error) return
  }
}

export default function WhatsApp() {
  const db = useDB()
  const [chat, setChat] = useState(CHATS[0])
  const [shown, setShown] = useState(3)
  const [typing, setTyping] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [human, setHuman] = useState(false)
  const [extra, setExtra] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [chatQuery, setChatQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const msgs = chat.msgs()
  const done = shown >= msgs.length

  const step = () => {
    if (done) return
    const next = msgs[shown]
    if (next.book) book()
    setShown(shown + 1)
  }
  // Reproducción automática: el asistente "escribe" antes de cada respuesta.
  useEffect(() => {
    if (!playing || human) return
    if (done) return setPlaying(false)
    const bot = msgs[shown].from !== 'patient'
    if (bot) setTyping(true)
    const t = setTimeout(() => {
      setTyping(false)
      step()
    }, bot ? 1100 : 800)
    return () => clearTimeout(t)
  }, [playing, human, shown, chat.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: 'smooth' })
  }, [shown, typing, extra.length])

  const open = (c: (typeof CHATS)[number]) => {
    setMobileOpen(true)
    setChat(c)
    setShown(3)
    setPlaying(false)
    setTyping(false)
    setHuman(false)
    setExtra([])
  }
  const send = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    setExtra([...extra, { from: 'staff', text: draft.trim(), at: 'ahora' }])
    setDraft('')
  }
  const booked = byId(db.appointments, DEMO_APPT)

  return <div className="fade-in">
    <PageHeader title="WhatsApp" eyebrow="Las conversaciones de tus pacientes, junto a su agenda." />
    <section className="glass grid h-[calc(100dvh-285px)] min-h-[480px] overflow-hidden lg:h-[calc(100dvh-240px)] lg:max-h-[760px] lg:grid-cols-[285px_minmax(0,1fr)]" aria-label="Mensajes de la clínica">
      <aside className={`${mobileOpen ? 'hidden' : 'flex'} min-h-0 flex-col border-r border-white/8 bg-[#303135] lg:flex`}>
        <div className="border-b border-white/8 p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Conversaciones</h2><span className="filter-count text-gold">{CHATS.length}</span></div><label className="relative block"><Search size={15} className="absolute left-3 top-3.5 text-muted" aria-hidden /><span className="sr-only">Buscar conversación</span><input className="field border-transparent bg-white/4 pl-9 text-xs" placeholder="Buscar una conversación" value={chatQuery} onChange={e => setChatQuery(e.target.value)} /></label></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {CHATS.filter(c => c.name.toLowerCase().includes(chatQuery.toLowerCase())).map((c, index) => <button key={c.id} onClick={() => open(c)} aria-pressed={chat.id === c.id} className={`flex w-full items-start gap-3 rounded-xl p-3.5 text-left transition-colors ${chat.id === c.id ? 'bg-[#5b5140]' : 'hover:bg-white/4'}`}><Avatar name={c.name} size={42} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{c.name}</span><span className="text-[0.6rem] text-muted">{index === 0 ? '10:44' : index === 1 ? 'Ayer' : '09:41'}</span></span><span className="mt-1.5 block text-xs leading-relaxed text-muted">{c.sub}</span><span className="mt-2 inline-flex rounded-full bg-black/15 px-2 py-0.5 text-[0.6rem] text-gold">{c.id === 'recordatorios' ? 'Cita confirmada' : c.id === 'nuevo' ? 'Nuevo paciente' : 'Paciente de la clínica'}</span></span></button>)}
          {!CHATS.some(c => c.name.toLowerCase().includes(chatQuery.toLowerCase())) && <p className="p-6 text-center text-xs text-muted">No hay conversaciones con ese nombre.</p>}
        </div>
        <p className="flex items-start gap-2 border-t border-white/8 p-4 text-[0.65rem] leading-relaxed text-muted"><MessageCircle size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden />Conversaciones de demostración. No se envían mensajes reales.</p>
      </aside>
      <div className={`${mobileOpen ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col lg:flex`}>
        <header className="flex items-center justify-between gap-3 border-b border-white/8 bg-[#3a3b40] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><button className="-ml-2 rounded-lg p-2 text-muted lg:hidden" aria-label="Volver a conversaciones" onClick={() => setMobileOpen(false)}><ArrowLeft size={19} /></button><span className="hidden sm:block"><Avatar name={chat.name} size={40} /></span><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{chat.name}</h2><p className="mt-1 flex items-center gap-1.5 text-[0.65rem] text-muted"><span className={`h-1.5 w-1.5 rounded-full ${human ? 'bg-gold' : 'bg-gold'}`} aria-hidden />{human ? 'Paola · recepción' : 'Asistente de la clínica'}</p></div></div>
          <button className={`btn min-h-9 shrink-0 px-3 py-2 text-xs ${human ? 'btn-secondary' : 'btn-primary'}`} onClick={() => { setHuman(!human); setPlaying(false); setTyping(false) }}>{human ? <><Bot size={15} aria-hidden /><span className="hidden sm:inline">Activar asistente</span><span className="sm:hidden">Asistente</span></> : <><Hand size={15} aria-hidden /><span className="hidden sm:inline">Responder yo</span><span className="sm:hidden">Responder</span></>}</button>
        </header>
        {human && <p className="border-b border-gold/10 bg-gold/7 px-4 py-2 text-center text-xs text-gold-soft">Estás respondiendo como recepción. El asistente está en pausa.</p>}
        <div ref={body} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#27282c] p-4 sm:px-8 sm:py-5" style={{ backgroundImage: 'radial-gradient(#ffffff07 1px, transparent 1px)', backgroundSize: '20px 20px' }} aria-live="polite" aria-label="Conversación">
          <p className="mx-auto mb-5 w-fit rounded-lg bg-white/5 px-3 py-1.5 text-[0.65rem] text-muted">Conversación de ejemplo</p>
          {[...msgs.slice(0, shown), ...extra].map((m, i) => <Bubble key={i} m={m} />)}
          {typing && <div className="ml-auto w-16 rounded-2xl rounded-br-sm bg-[#5b5140] px-3 py-2" aria-label="El asistente está escribiendo">{[0,1,2].map(d => <span key={d} className="mx-0.5 inline-block h-1.5 w-1.5 rounded-full bg-bone" style={{ animation: `typing 1s ${d*0.15}s infinite` }} />)}</div>}
          {booked && chat.id === 'nuevo' && done && <Link href="/agenda" className="mx-auto mt-4 flex max-w-sm items-center gap-3 rounded-xl border border-gold/25 bg-[#5b4e36] p-4 text-xs"><CalendarCheck size={23} className="text-gold" aria-hidden /><span className="flex-1"><span className="block font-medium">Cita agendada a las {booked.start}</span><span className="mt-1 block text-muted">Ver en la agenda de la clínica</span></span><ChevronRight size={17} aria-hidden /></Link>}
        </div>
        <form onSubmit={send} className="flex items-center gap-3 border-t border-white/8 bg-[#3a3b40] p-3 sm:px-5"><label className="sr-only" htmlFor="wa-input">Mensaje</label><input id="wa-input" className="field rounded-xl border-transparent bg-[#27282c] text-sm" disabled={!human} value={draft} onChange={e => setDraft(e.target.value)} placeholder={human ? 'Escribe un mensaje…' : 'Elige «Responder yo» para escribir'} /><button className="btn btn-primary h-11 w-11 shrink-0 rounded-xl p-0" disabled={!human || !draft.trim()} aria-label="Enviar mensaje de demostración"><Send size={18} /></button></form>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 bg-[#35363a] px-4 py-2.5"><p className="text-[0.65rem] text-muted">Explora cómo responde el asistente</p><div className="flex items-center gap-1" role="group" aria-label="Reproducción de la demostración"><button className="btn btn-ghost min-h-8 px-2.5 py-1 text-xs text-gold" onClick={() => { setPlaying(!playing); setMobileOpen(true) }} disabled={done || human}>{playing ? <><Pause size={14} aria-hidden />Pausar</> : <><Play size={14} aria-hidden />Reproducir</>}</button><button className="btn btn-ghost min-h-8 px-2.5 py-1 text-xs" onClick={step} disabled={done || playing || human}><StepForward size={14} aria-hidden />Siguiente</button><button className="btn btn-ghost min-h-8 p-2" onClick={() => open(chat)} aria-label="Reiniciar conversación"><RotateCcw size={14} /></button></div></div>
      </div>
    </section>
  </div>
}

function Bubble({ m }: { m: Msg }) {
  if (m.from === 'system')
    return (
      <p className={`fade-in mx-auto max-w-[90%] rounded-xl px-3 py-1.5 text-center text-[0.72rem] ${m.tag === 'booked' ? 'border border-azure/40 bg-azure/15 text-gold' : 'border border-gold/30 bg-gold/10 text-gold-soft'}`}>
        {m.tag === 'ad' && <Megaphone size={12} className="mr-1 inline" aria-hidden />}
        {m.text}
      </p>
    )
  const mine = m.from !== 'patient'
  return (
    <div className={`fade-in flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      {mine && (
        <span className="mb-0.5 px-1 text-[0.62rem] text-muted">
          {m.from === 'staff' ? 'Paola · Recepción' : m.tag ? `${m.tag}` : 'Asistente de la clínica'}
        </span>
      )}
      <div
        className={`max-w-[90%] whitespace-pre-line rounded-2xl px-4 py-3 text-[0.84rem] leading-relaxed sm:max-w-[75%] ${
          m.from === 'patient' ? 'rounded-bl-sm bg-white/10 text-bone' : m.from === 'staff' ? 'rounded-br-sm border border-gold/40 bg-gold/15 text-bone' : 'rounded-br-sm bg-[#5b5140] text-bone'
        }`}
      >
        {m.text}
        <span className="num mt-1 block text-right text-[0.6rem] text-muted">{m.at}</span>
      </div>
      {m.quick && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
          {m.quick.map((q) => <span key={q} className="rounded-full border border-azure/50 px-2.5 py-1 text-[0.72rem] text-gold">{q}</span>)}
        </div>
      )}
    </div>
  )
}
