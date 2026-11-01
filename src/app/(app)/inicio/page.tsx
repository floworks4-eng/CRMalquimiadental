'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowRight, ArrowUpRight, CalendarPlus, CalendarDays, Users, MessageCircle, Wallet,
  Clock3, Check, ChevronRight, AlertCircle, Stethoscope, Sun, Moon, Package, CheckCircle2,
} from 'lucide-react'
import {
  useDB, visibleAppointments, todayISO, nowHM, fechaLarga, byId, bs, startConsult, sessionUser,
  can, type Appointment,
} from '@/lib/data'
import { Avatar, StatusBadge } from '@/components/ui'
import { AppointmentModal } from '@/components/appointment-modal'

export default function Inicio() {
  const db = useDB()
  const router = useRouter()
  const [create, setCreate] = useState(false)
  const role = db.session!.role
  const user = sessionUser(db)!
  const today = todayISO()
  const appts = visibleAppointments(db, today).filter(a => !['cancelada', 'no_asistio'].includes(a.status))
  const waiting = appts.filter(a => a.status === 'en_espera').sort((a, b) => (a.checkedInAt ?? a.start).localeCompare(b.checkedInAt ?? b.start))
  const inCare = appts.filter(a => a.status === 'en_atencion')
  const upcoming = appts.filter(a => ['agendada', 'confirmada'].includes(a.status))
  const completed = appts.filter(a => a.status === 'atendida').length
  const clinical = can(role, 'consulta')
  const featured = (clinical ? inCare.find(a => a.dentistId === user.id) : undefined) ?? waiting[0] ?? upcoming[0] ?? inCare[0]
  const patient = featured && byId(db.patients, featured.patientId)
  const allergies = clinical && patient ? [...(patient.anamnesis?.allergies ?? []), patient.anamnesis?.allergyOther].filter(a => a && a !== 'Ninguna') : []
  const hour = +nowHM().slice(0, 2)
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const name = role === 'admin' ? 'Doc' : user.name.replace(/^(Dra?\.?\s+)/, '').split(' ')[0]
  const GreetingIcon = hour < 19 ? Sun : Moon
  const transactions = db.transactions.filter(t => t.date === today)
  const income = transactions.reduce((sum, t) => sum + (t.kind === 'ingreso' ? t.amount : -t.amount), 0)
  const low = db.inventory.filter(i => i.stock <= i.min)
  const confirmation = appts.filter(a => a.status === 'agendada')
  const progress = appts.length ? Math.round(completed / appts.length * 100) : 0
  const flow = [
    { label: 'Por llegar', count: upcoming.length, color: '#cabce9', state: 'pendientes' },
    { label: 'En espera', count: waiting.length, color: '#f0c884', state: 'espera' },
    { label: 'En consulta', count: inCare.length, color: '#aacaed', state: 'atencion' },
    { label: 'Atendidos', count: completed, color: '#9de2b7', state: 'atendidas' },
  ]

  const openConsult = (a: Appointment) => { if (a.status === 'en_espera') startConsult(a.id); router.push(`/consulta/${a.id}`) }

  return <div className="fade-in">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div><p className="mb-2 flex items-center gap-2 text-sm text-muted"><GreetingIcon size={17} className="text-gold" aria-hidden />{fechaLarga(today)}</p><h1 className="title-gold text-[2rem] md:text-[2.4rem]">{greeting}, {name}<span className="text-gold">.</span></h1><p className="mt-2 text-sm text-muted">Un vistazo a tu clínica. Todo listo para empezar.</p></div>
      <button className="btn btn-primary" onClick={() => setCreate(true)}><CalendarPlus size={18} aria-hidden />Agendar una cita</button>
    </div>

    <section aria-label="El día en números" className="mb-7 grid grid-cols-4 gap-2 sm:gap-3">
      {flow.map(({ label, count, color, state }) => <Link key={state} href={`/agenda?vista=${state}`} className="glass group flex items-center justify-between gap-2 px-2.5 py-3.5 transition-colors hover:border-white/20 sm:px-4 sm:py-4 md:px-5">
        <div><p className="flex items-center gap-1.5 whitespace-nowrap text-[0.6rem] text-muted sm:text-xs"><span className="hidden h-1.5 w-1.5 rounded-full sm:inline-block" style={{ background: color }} aria-hidden />{label}</p><p className="num mt-2 text-2xl font-semibold sm:text-3xl">{String(count).padStart(2, '0')}</p></div><span className="hidden h-9 w-9 place-items-center rounded-full bg-white/4 sm:grid text-muted transition-colors group-hover:bg-white/10 group-hover:text-bone"><ArrowUpRight size={17} aria-hidden /></span>
      </Link>)}
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,1fr)]">
      <section className="glass home-patient relative overflow-hidden p-5 sm:p-7" aria-labelledby="next-patient">
        <div className="mb-6 flex items-center justify-between gap-3"><h2 id="next-patient" className="flex items-center gap-2 text-sm font-medium text-[#eee9df]"><span className="relative inline-flex h-2 w-2 rounded-full bg-gold" aria-hidden />{featured?.status === 'en_atencion' ? 'Tu consulta está en curso' : 'Tu siguiente paciente'}</h2><span className="rounded-full bg-[#ffffff0c] px-2.5 py-1 text-[0.65rem] text-[#e7ddc9]">{featured ? 'HOY' : 'AL DÍA'}</span></div>
        {featured && patient ? <>
          <div className="flex items-center gap-4 sm:gap-5"><Avatar name={patient.name} size={68} /><div className="min-w-0"><h3 className="text-xl font-semibold tracking-tight sm:text-[1.65rem]">{patient.name}</h3><p className="mt-1.5 text-sm text-[#dbd8d3]">{byId(db.procedures, featured.procedureId)?.name}</p><div className="mt-3"><StatusBadge status={featured.status} /></div></div></div>
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
            <div><p className="text-[0.7rem] text-[#cbc5ba]">Hora de la cita</p><p className="mt-1 flex items-center gap-1.5 text-sm font-medium"><Clock3 size={14} className="text-[#cbc5ba]" aria-hidden />{featured.start}<span className="text-xs font-normal text-[#cbc5ba]">· {featured.duration} min</span></p></div>
            <div><p className="text-[0.7rem] text-[#cbc5ba]">Consultorio</p><p className="mt-1 text-sm font-medium">{byId(db.cabinets, featured.cabinetId)?.name}</p></div>
            <div className="col-span-2 sm:col-span-1"><p className="text-[0.7rem] text-[#cbc5ba]">Profesional</p><p className="mt-1 text-sm font-medium">{byId(db.users, featured.dentistId)?.name}</p></div>
          </div>
          {allergies && allergies.length > 0 && <p className="mt-4 flex items-center gap-2 text-xs text-warn"><AlertCircle size={14} aria-hidden />Alergia: {allergies.join(', ')}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {clinical && ['en_espera', 'en_atencion'].includes(featured.status) ? <button className="btn btn-primary" onClick={() => openConsult(featured)}><Stethoscope size={17} aria-hidden />{featured.status === 'en_atencion' ? 'Continuar consulta' : 'Atender paciente'}<ArrowRight size={17} aria-hidden /></button> : can(role, 'checkin') && ['agendada', 'confirmada'].includes(featured.status) ? <Link href={`/agenda?recibir=${featured.id}`} className="btn btn-primary">Recibir paciente<ArrowRight size={17} aria-hidden /></Link> : <Link href="/agenda?vista=espera" className="btn btn-primary">Ver sala de espera<ArrowRight size={17} aria-hidden /></Link>}
            <Link href={`/pacientes/${patient.id}`} className="btn btn-ghost text-[#eee9df]">Ver ficha<ArrowUpRight size={16} aria-hidden /></Link>
          </div>
        </> : <div className="flex min-h-[245px] flex-col items-start justify-center"><span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gold/15"><CheckCircle2 size={28} className="text-gold" aria-hidden /></span><h3 className="text-2xl font-semibold">Todo al día</h3><p className="mt-2 max-w-sm text-sm leading-relaxed text-[#dbd8d3]">No hay pacientes pendientes para hoy. Puedes revisar la agenda o programar una nueva cita.</p><Link href="/agenda" className="btn btn-primary mt-5">Abrir agenda<ArrowRight size={16} aria-hidden /></Link></div>}
      </section>

      <section aria-labelledby="quick-actions"><div className="mb-4 flex items-center justify-between"><h2 id="quick-actions" className="section-heading">¿Qué necesitas hacer?</h2><span className="text-[0.65rem] text-muted">ACCESOS RÁPIDOS</span></div><div className="grid gap-3">
        <button className="quick-action" onClick={() => setCreate(true)}><span className="icon-tile"><CalendarPlus size={22} aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Nueva cita</span><span className="mt-1 block text-xs text-muted">Reserva un horario en la agenda</span></span><ChevronRight size={17} className="text-muted" aria-hidden /></button>
        <Link href="/pacientes" className="quick-action"><span className="icon-tile bg-[#44454c] text-[#e4e1d9]"><Users size={22} aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Buscar un paciente</span><span className="mt-1 block text-xs text-muted">Abre su ficha e historial</span></span><ChevronRight size={17} className="text-muted" aria-hidden /></Link>
        {can(role, 'caja') ? <Link href="/caja" className="quick-action"><span className="icon-tile bg-[#4a3f2e] text-[#ead3a6]"><Wallet size={22} aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Registrar un pago</span><span className="mt-1 block text-xs text-muted">Cobros y movimientos de caja</span></span><ChevronRight size={17} className="text-muted" aria-hidden /></Link> : <Link href="/agenda?vista=espera" className="quick-action"><span className="icon-tile bg-[#44454c] text-[#e4e1d9]"><Stethoscope size={22} aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Sala de espera</span><span className="mt-1 block text-xs text-muted">Pacientes listos para su consulta</span></span><ChevronRight size={17} className="text-muted" aria-hidden /></Link>}
      </div></section>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,1fr)]">
      <section className="glass p-5 sm:p-6" aria-labelledby="day-progress">
        <div className="flex items-center justify-between gap-3"><h2 id="day-progress" className="section-heading">Así va tu día</h2><Link href="/agenda" className="flex items-center gap-1 text-xs text-gold">Ver agenda<ArrowUpRight size={14} aria-hidden /></Link></div>
        <div className="mt-5 flex items-end justify-between"><p className="text-sm text-muted"><span className="text-xl font-semibold text-bone">{completed}</span> de {appts.length} pacientes atendidos</p><span className="num text-sm text-gold">{progress}%</span></div>
        <div className="mt-3 flex h-2 gap-1 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-label="Pacientes atendidos hoy" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {confirmation.length > 0 ? <Link href="/agenda?vista=pendientes" className="flex items-start gap-3 rounded-xl bg-white/3 p-3.5"><span className="mt-0.5 text-warn"><Clock3 size={18} aria-hidden /></span><span><span className="block text-sm">{confirmation.length} {confirmation.length === 1 ? 'cita por confirmar' : 'citas por confirmar'}</span><span className="mt-1 block text-xs text-muted">Revisa las llegadas pendientes<ArrowRight size={11} className="ml-1 inline" aria-hidden /></span></span></Link> : <div className="flex items-start gap-3 rounded-xl bg-white/3 p-3.5"><Check size={18} className="mt-0.5 text-gold" aria-hidden /><span><span className="block text-sm">Citas confirmadas</span><span className="mt-1 block text-xs text-muted">Las próximas citas están listas</span></span></div>}
          {can(role, 'inventario') && low.length > 0 ? <Link href="/inventario" className="flex items-start gap-3 rounded-xl bg-white/3 p-3.5"><Package size={18} className="mt-0.5 text-gold" aria-hidden /><span><span className="block text-sm">{low.length} {low.length === 1 ? 'insumo por reponer' : 'insumos por reponer'}</span><span className="mt-1 block text-xs text-muted">Consulta lo que necesita la clínica<ArrowRight size={11} className="ml-1 inline" aria-hidden /></span></span></Link> : <Link href="/agenda" className="flex items-start gap-3 rounded-xl bg-white/3 p-3.5"><CalendarDays size={18} className="mt-0.5 text-gold" aria-hidden /><span><span className="block text-sm">Agenda organizada</span><span className="mt-1 block text-xs text-muted">{appts.length} citas en {db.cabinets.length} consultorios</span></span></Link>}
        </div>
      </section>
      {can(role, 'caja') ? <section className="glass flex flex-col p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="section-heading">Caja de hoy</h2><Wallet size={19} className="text-gold" aria-hidden /></div><p className="num mt-5 text-3xl font-semibold tracking-tight">{bs(income)}</p><p className="mt-1.5 text-xs text-muted">Saldo neto · {transactions.filter(t => t.kind === 'ingreso').length} pagos registrados</p><Link href="/caja" className="mt-auto flex items-center justify-between border-t border-white/8 pt-4 text-sm text-gold">Ver movimientos<ArrowUpRight size={17} aria-hidden /></Link></section> : <section className="glass p-5 sm:p-6"><span className="icon-tile mb-4"><Stethoscope size={22} aria-hidden /></span><h2 className="section-heading">Tu espacio clínico</h2><p className="mb-5 mt-2 text-sm leading-relaxed text-muted">Encuentra el historial y el plan de tratamiento de cada paciente en su ficha.</p><Link href="/pacientes" className="flex items-center gap-2 text-sm text-gold">Ver mis pacientes<ArrowRight size={16} aria-hidden /></Link></section>}
    </div>
    {can(role, 'whatsapp') && <Link href="/whatsapp" className="mt-6 flex items-center gap-3 rounded-xl border border-white/7 px-4 py-3.5 text-sm transition-colors hover:bg-white/3"><MessageCircle size={19} className="text-gold" aria-hidden /><span className="flex-1 text-muted">Las conversaciones con tus pacientes, en <span className="text-bone">WhatsApp de la clínica</span>.</span><ArrowRight size={17} className="text-muted" aria-hidden /></Link>}
    <AppointmentModal open={create} onClose={() => setCreate(false)} preset={{ date: today }} />
  </div>
}
