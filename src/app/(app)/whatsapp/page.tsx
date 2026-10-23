'use client'
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Play, Pause, StepForward, RotateCcw, Hand, Bot, ArrowLeft, BadgeCheck, Send, Megaphone, CalendarCheck, ShieldCheck, Clock } from 'lucide-react'
import { useDB, createAppointment, todayISO, addDays, fecha, byId, CLINIC, DEMO_APPT, DEMO_PATIENT } from '@/lib/data'
import { PageHeader } from '@/components/ui'

type Msg = { from: 'patient' | 'bot' | 'staff' | 'system'; text: string; quick?: string[]; at: string; tag?: string; book?: boolean }

const today = () => fecha(todayISO())
const CHATS: { id: string; name: string; sub: string; msgs: () => Msg[] }[] = [
  {
    id: 'nuevo',
    name: 'Mariela (nueva)',
    sub: 'Desde anuncio · agenda sola',
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
    sub: 'Paciente reconocido · fuera de horario',
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
    sub: 'Recordatorios 48 h y 24 h',
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
  const [shown, setShown] = useState(1)
  const [typing, setTyping] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [human, setHuman] = useState(false)
  const [extra, setExtra] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
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
    setChat(c)
    setShown(1)
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

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Asistente de WhatsApp (simulado)" title="WhatsApp de la clínica" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px_1fr]">
        <div className="space-y-3">
          <p className="eyebrow">Conversaciones de ejemplo</p>
          {CHATS.map((c) => (
            <button key={c.id} onClick={() => open(c)} aria-pressed={chat.id === c.id}
              className={`glass block w-full p-4 text-left transition-shadow duration-150 ${chat.id === c.id ? 'ring-1 ring-gold/50' : 'hover:ring-1 hover:ring-white/15'}`}>
              <span className="block text-bone">{c.name}</span>
              <span className="text-sm text-muted">{c.sub}</span>
            </button>
          ))}
          <div className="glass flex flex-wrap gap-2 p-3" role="group" aria-label="Reproducción">
            <button className="btn btn-primary flex-1" onClick={() => setPlaying(!playing)} disabled={done || human}>
              {playing ? <><Pause size={16} aria-hidden />Pausar</> : <><Play size={16} aria-hidden />Reproducir</>}
            </button>
            <button className="btn btn-secondary" onClick={step} disabled={done || playing || human}><StepForward size={16} aria-hidden />Paso</button>
            <button className="btn btn-ghost" onClick={() => open(chat)} aria-label="Reiniciar conversación"><RotateCcw size={16} /></button>
          </div>
          {booked && chat.id === 'nuevo' && done && (
            <Link href="/agenda" className="glass fade-in flex items-center gap-3 p-4 text-sm ring-1 ring-azure/50 hover:ring-azure">
              <CalendarCheck className="text-azure" aria-hidden />
              <span><span className="block text-bone">Ver la cita en la agenda</span><span className="text-muted">{booked.start} · {byId(db.cabinets, booked.cabinetId)?.name} · chip WhatsApp</span></span>
            </Link>
          )}
        </div>

        {/* Teléfono */}
        <div className="mx-auto w-full max-w-[380px]">
          <div className="rounded-[2.6rem] border border-white/15 bg-black p-2.5 shadow-[0_30px_60px_rgb(0_0_0/0.5),0_0_50px_rgb(201_169_97/0.12)]">
            <div className="flex h-[640px] flex-col overflow-hidden rounded-[2.1rem] bg-[#18191b]">
              <div className="flex items-center gap-3 border-b border-white/8 bg-[#232427] px-4 pb-3 pt-7">
                <ArrowLeft size={18} className="text-muted" aria-hidden />
                <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full border border-gold/50 bg-black font-display italic text-gold">A</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium text-bone">Alquimia Dental <BadgeCheck size={14} className="text-azure" aria-label="Cuenta de empresa verificada" /></span>
                  <span className="block truncate text-[0.68rem] text-muted">{human ? 'Paola (Recepción) está escribiendo' : `Cuenta de empresa · ${CLINIC.whatsapp}`}</span>
                </span>
              </div>
              {human && <p className="bg-gold/15 px-4 py-1.5 text-center text-xs text-gold-soft">Paola tomó el chat · el asistente está en pausa</p>}
              <div ref={body} className="flex-1 space-y-2 overflow-y-auto px-3 py-4" aria-live="polite" aria-label="Conversación">
                {[...msgs.slice(0, shown), ...extra].map((m, i) => <Bubble key={i} m={m} />)}
                {typing && (
                  <div className="ml-auto w-16 rounded-2xl rounded-br-sm bg-[#173054] px-3 py-2" aria-label="El asistente está escribiendo">
                    {[0, 1, 2].map((d) => <span key={d} className="mx-0.5 inline-block h-1.5 w-1.5 rounded-full bg-bone" style={{ animation: `typing 1s ${d * 0.15}s infinite` }} />)}
                  </div>
                )}
              </div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-white/8 bg-[#232427] p-2.5">
                <label className="sr-only" htmlFor="wa-input">Mensaje</label>
                <input id="wa-input" className="field rounded-full py-2 text-sm" disabled={!human} value={draft} onChange={(e) => setDraft(e.target.value)}
                  placeholder={human ? 'Escribe como Paola…' : 'Responde el asistente · toma el chat para escribir'} />
                <button className="btn btn-primary h-9 w-9 shrink-0 rounded-full p-0" disabled={!human || !draft.trim()} aria-label="Enviar"><Send size={15} /></button>
              </form>
            </div>
          </div>
          <button className={`btn mt-4 w-full ${human ? 'btn-secondary' : 'btn-primary'}`} onClick={() => { setHuman(!human); setPlaying(false); setTyping(false) }}>
            {human ? <><Bot size={16} aria-hidden />Devolver al asistente</> : <><Hand size={16} aria-hidden />Tomar el chat</>}
          </button>
        </div>

        <ul className="space-y-3 text-sm">
          {[
            { icon: ShieldCheck, t: 'Mismo número de 20 años', d: 'Se conserva el número histórico de la clínica, ahora con la API oficial de WhatsApp Business.' },
            { icon: Clock, t: 'Responde 24/7', d: 'Precios, ubicación y horarios al instante, también de noche y fines de semana.' },
            { icon: CalendarCheck, t: 'Agenda y confirma', d: 'Propone horarios libres reales y la cita aparece en la agenda con origen WhatsApp.' },
            { icon: Hand, t: 'El equipo manda', d: 'Recepción puede tomar cualquier conversación con un clic.' },
            { icon: Megaphone, t: 'Atribución', d: 'Cada chat que llega de un anuncio guarda su campaña para saber qué anuncio trae pacientes que pagan.' },
          ].map(({ icon: Icon, t, d }) => (
            <li key={t} className="glass flex gap-3 p-4">
              <Icon size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden />
              <span><span className="block text-bone">{t}</span><span className="text-muted">{d}</span></span>
            </li>
          ))}
          <li className="px-1 text-xs text-muted">Los recordatorios usan plantillas aprobadas por Meta; aquí solo se muestran como ejemplo. Sin envíos reales.</li>
        </ul>
      </div>
    </div>
  )
}

function Bubble({ m }: { m: Msg }) {
  if (m.from === 'system')
    return (
      <p className={`fade-in mx-auto max-w-[90%] rounded-xl px-3 py-1.5 text-center text-[0.72rem] ${m.tag === 'booked' ? 'border border-azure/40 bg-azure/15 text-[#bcd3ff]' : 'border border-gold/30 bg-gold/10 text-gold-soft'}`}>
        {m.tag === 'ad' && <Megaphone size={12} className="mr-1 inline" aria-hidden />}
        {m.text}
      </p>
    )
  const mine = m.from !== 'patient'
  return (
    <div className={`fade-in flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      {mine && (
        <span className="mb-0.5 px-1 text-[0.62rem] text-muted">
          {m.from === 'staff' ? 'Paola · Recepción' : m.tag ? `🤖 ${m.tag}` : '🤖 Asistente'}
        </span>
      )}
      <div
        className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-[0.84rem] leading-snug ${
          m.from === 'patient' ? 'rounded-bl-sm bg-white/10 text-bone' : m.from === 'staff' ? 'rounded-br-sm border border-gold/40 bg-gold/15 text-bone' : 'rounded-br-sm bg-[#173054] text-bone'
        }`}
      >
        {m.text}
        <span className="num mt-1 block text-right text-[0.6rem] text-muted">{m.at}</span>
      </div>
      {m.quick && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
          {m.quick.map((q) => <span key={q} className="rounded-full border border-azure/50 px-2.5 py-1 text-[0.72rem] text-[#9cc0ff]">{q}</span>)}
        </div>
      )}
    </div>
  )
}
