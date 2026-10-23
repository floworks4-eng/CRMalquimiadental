// Única capa de datos de la demo. Estado en memoria + localStorage.
// Para pasar a Supabase: reemplazar `load/save/commit` y las funciones de abajo por llamadas a la API;
// las pantallas solo usan `useDB()` y estas funciones.
import { useSyncExternalStore } from 'react'
import { buildSeed } from './seed'

/* ───────────── Tipos (modelo: users, patients, cabinets, appointments, …) ───────────── */
export type Role = 'admin' | 'odontologo' | 'recepcion'
export type Source = 'whatsapp' | 'web' | 'campaign'
export type PatientSource = Source | 'historico'
export type ApptStatus = 'agendada' | 'confirmada' | 'en_espera' | 'en_atencion' | 'atendida' | 'no_asistio' | 'cancelada'
export type PayMethod = 'qr' | 'transferencia' | 'efectivo'
export type ToothCondition = 'caries' | 'corona' | 'endodoncia' | 'ausente'

export interface User { id: string; name: string; role: Role; title: string }
export interface AnamnesisData {
  allergies: string[]
  allergyOther: string
  conditions: string[]
  medications: string
  reason: string
  emergencyContact: string
  consent: boolean
  signature: string
  submittedAt: string
}
export interface Patient {
  id: string
  name: string
  phone: string
  birthDate: string // YYYY-MM-DD
  zone: string
  source: PatientSource
  campaignId?: string
  createdAt: string // YYYY-MM-DD
  dentistId: string
  status: 'nuevo' | 'activo' | 'en_tratamiento' | 'inactivo'
  anamnesis?: AnamnesisData
}
export interface Cabinet { id: string; name: string }
export interface Appointment {
  id: string
  patientId: string
  dentistId: string
  cabinetId: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  duration: number // minutos
  procedureId: string
  status: ApptStatus
  source: Source
  campaignId?: string
  checkedInAt?: string
  createdAt: string
}
export interface ClinicalRecord {
  id: string
  patientId: string
  appointmentId?: string
  date: string
  dentistId: string
  summary: string
  procedures: string[]
  total: number
}
export interface OdontogramEvent { id: string; patientId: string; tooth: number; condition: ToothCondition; date: string; dentistId: string }
export interface Procedure { id: string; name: string; price: number; minutes: number }
export interface ProcedureSupply { procedureId: string; itemId: string; qty: number }
export interface InventoryItem { id: string; name: string; unit: string; stock: number; min: number; lastChange?: { qty: number; note: string; at: string } }
export interface Transaction {
  id: string
  date: string
  time: string
  concept: string
  amount: number
  method: PayMethod
  kind: 'ingreso' | 'egreso'
  patientId?: string
  appointmentId?: string
}
export interface Campaign { id: string; name: string; channel: string; spend: number; reach: number; conversations: number; appts: number; attended: number; revenue: number }
export interface Notification { id: string; userId: string; text: string; href: string; at: string; read: boolean }

export interface DB {
  version: number
  seedDate: string
  session: { role: Role; userId: string } | null
  demo: { step: number } | null
  users: User[]
  patients: Patient[]
  cabinets: Cabinet[]
  appointments: Appointment[]
  clinicalRecords: ClinicalRecord[]
  odontogramEvents: OdontogramEvent[]
  procedures: Procedure[]
  procedureSupplies: ProcedureSupply[]
  inventory: InventoryItem[]
  transactions: Transaction[]
  campaigns: Campaign[]
  notifications: Notification[]
}

/* ───────────── Clínica ───────────── */
export const CLINIC = {
  name: 'Alquimia Dental',
  zone: 'San Miguel, Calacoto · La Paz',
  whatsapp: '+591 7XXX XXXX (demo)',
  hours: 'Lun–Vie 08:30–19:30 · Sáb 09:00–13:00 [ejemplo]',
  open: '08:00',
  close: '20:00',
}
export const DEMO_APPT = 'a-demo'
export const DEMO_PATIENT = 'p-demo'

/* ───────────── Formato boliviano / hora de La Paz ───────────── */
const TZ = 'America/La_Paz'
export const bs = (n: number) => 'Bs. ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
export const fecha = (iso: string) => iso.split('-').reverse().join('/')
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
export const nowHM = () =>
  new Intl.DateTimeFormat('es-BO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
export const fechaLarga = (iso: string) => {
  const d = new Date(iso + 'T12:00:00')
  const day = new Intl.DateTimeFormat('es-BO', { weekday: 'long' }).format(d)
  return day.charAt(0).toUpperCase() + day.slice(1) + ' ' + fecha(iso)
}
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5)
export const toHM = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
export const age = (birth: string) => Math.floor((Date.parse(todayISO()) - Date.parse(birth)) / 31557600000)
export const initials = (name: string) =>
  name.replace(/^(Dr|Dra|Lic)\.\s*/, '').split(' ').slice(0, 2).map((w) => w[0]).join('')

export const SOURCE_LABEL: Record<PatientSource, string> = { whatsapp: 'WhatsApp', web: 'Web', campaign: 'Campaña', historico: 'Histórico' }
export const METHOD_LABEL: Record<PayMethod, string> = { qr: 'QR', transferencia: 'Transferencia', efectivo: 'Efectivo' }
export const STATUS_LABEL: Record<ApptStatus, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  en_espera: 'En sala de espera',
  en_atencion: 'En atención',
  atendida: 'Atendida',
  no_asistio: 'No asistió',
  cancelada: 'Cancelada',
}
export const PATIENT_STATUS: Record<Patient['status'], string> = { nuevo: 'Nuevo', activo: 'Activo', en_tratamiento: 'En tratamiento', inactivo: 'Inactivo' }
export const CONDITION_LABEL: Record<ToothCondition, string> = { caries: 'Caries', corona: 'Corona', endodoncia: 'Endodoncia', ausente: 'Ausente' }

/* ───────────── Control por roles (RBAC) ───────────── */
export type Module =
  | 'inicio' | 'agenda' | 'checkin' | 'pacientes' | 'clinico' | 'consulta' | 'inventario'
  | 'caja' | 'whatsapp' | 'analitica' | 'ingesta' | 'equipo' | 'ruta'
export const MODULE_LABEL: Record<Module, string> = {
  inicio: 'Inicio', agenda: 'Agenda', checkin: 'Check-in QR', pacientes: 'Pacientes (CRM)', clinico: 'Datos clínicos (anamnesis, odontograma)',
  consulta: 'Consulta activa', inventario: 'Inventario', caja: 'Finanzas y caja', whatsapp: 'Asistente WhatsApp',
  analitica: 'Analítica', ingesta: 'Ingesta de historiales', equipo: 'Equipo y roles', ruta: 'Ruta de implementación',
}
// '' = sin acceso
export const PERMS: Record<Module, Record<Role, string>> = {
  inicio: { admin: 'Total', odontologo: 'Solo lo suyo', recepcion: 'Operativo' },
  agenda: { admin: 'Total', odontologo: 'Solo su agenda', recepcion: 'Total' },
  checkin: { admin: 'Total', odontologo: '', recepcion: 'Total' },
  pacientes: { admin: 'Total', odontologo: 'Solo sus pacientes', recepcion: 'Sin datos clínicos' },
  clinico: { admin: 'Total', odontologo: 'Solo sus pacientes', recepcion: '' },
  consulta: { admin: 'Total', odontologo: 'Solo sus pacientes', recepcion: '' },
  inventario: { admin: 'Total', odontologo: 'Lectura', recepcion: '' },
  caja: { admin: 'Total', odontologo: '', recepcion: 'Registrar cobros' },
  whatsapp: { admin: 'Total', odontologo: '', recepcion: 'Total' },
  analitica: { admin: 'Total', odontologo: '', recepcion: '' },
  ingesta: { admin: 'Total', odontologo: 'Revisar y aprobar', recepcion: '' },
  equipo: { admin: 'Total', odontologo: '', recepcion: '' },
  ruta: { admin: 'Total', odontologo: '', recepcion: '' },
}
export const can = (role: Role | undefined, m: Module) => !!role && !!PERMS[m][role]

/* ───────────── Store ───────────── */
const KEY = 'alquimia-demo-v1'
const VERSION = 3
let db: DB | null = null
const listeners = new Set<() => void>()
let serverSnapshot: DB | null = null

function load(): DB {
  const fresh = buildSeed(todayISO())
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as DB | null
    // Si la demo quedó guardada de otro día, se regenera para que "hoy" siempre tenga citas.
    if (saved && saved.version === VERSION && saved.seedDate === fresh.seedDate) return saved
  } catch {}
  return fresh
}
function current(): DB {
  if (!db) db = typeof window === 'undefined' ? buildSeed(todayISO()) : load()
  return db
}
function commit(next: DB) {
  db = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      db = null
      l()
    }
  }
  window.addEventListener('storage', onStorage) // sincroniza pestañas (p. ej. /check-in en otra pestaña)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}
/** true solo en el cliente, tras hidratar (el estado real vive en localStorage). */
export const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false)
export function useDB(): DB {
  return useSyncExternalStore(subscribe, current, () => (serverSnapshot ??= buildSeed(todayISO())))
}
const update = (fn: (d: DB) => DB) => commit(fn(current()))
let seq = 0
const uid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`

/* ───────────── Consultas ───────────── */
export const byId = <T extends { id: string }>(list: T[], id?: string) => list.find((x) => x.id === id)
export const sessionUser = (d: DB) => byId(d.users, d.session?.userId)

/** Citas visibles para la sesión (el odontólogo solo ve las suyas). */
export function visibleAppointments(d: DB, date?: string) {
  return d.appointments
    .filter((a) => (!date || a.date === date) && (d.session?.role !== 'odontologo' || a.dentistId === d.session.userId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
}
export function visiblePatients(d: DB) {
  return d.session?.role === 'odontologo' ? d.patients.filter((p) => p.dentistId === d.session!.userId) : d.patients
}
export function suppliesFor(d: DB, procedureIds: string[]) {
  const total = new Map<string, number>()
  for (const pid of procedureIds)
    for (const s of d.procedureSupplies.filter((x) => x.procedureId === pid)) total.set(s.itemId, (total.get(s.itemId) || 0) + s.qty)
  return [...total].map(([itemId, qty]) => ({ item: byId(d.inventory, itemId)!, qty }))
}
/** Devuelve el mensaje de error si la cita choca con otra del mismo gabinete o profesional. */
export function findConflict(d: DB, a: Pick<Appointment, 'id' | 'date' | 'start' | 'duration' | 'cabinetId' | 'dentistId'>) {
  const s = toMin(a.start)
  const e = s + a.duration
  if (s < toMin(CLINIC.open) || e > toMin(CLINIC.close)) return `Fuera del horario de atención (${CLINIC.open}–${CLINIC.close}).`
  const other = d.appointments.find(
    (x) =>
      x.id !== a.id && x.date === a.date && !['cancelada', 'no_asistio'].includes(x.status) &&
      (x.cabinetId === a.cabinetId || x.dentistId === a.dentistId) &&
      toMin(x.start) < e && s < toMin(x.start) + x.duration,
  )
  if (!other) return null
  const who = byId(d.patients, other.patientId)?.name
  return other.cabinetId === a.cabinetId
    ? `El ${byId(d.cabinets, a.cabinetId)?.name} está ocupado a las ${other.start} (${who}).`
    : `${byId(d.users, a.dentistId)?.name} ya atiende a las ${other.start} (${who}).`
}

/* ───────────── Acciones ───────────── */
export function setSession(role: Role) {
  const d = current()
  const userId = d.users.find((u) => u.role === role)!.id
  update((x) => ({ ...x, session: { role, userId } }))
}
export function setDemo(step: number | null) {
  update((x) => ({ ...x, demo: step === null ? null : { step } }))
}
export function resetDemo() {
  const session = current().session
  commit({ ...buildSeed(todayISO()), session })
}
export function setCabinetCount(n: number) {
  update((x) => ({ ...x, cabinets: Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, name: `Gabinete ${i + 1}` })) }))
}

export interface NewAppointment {
  id?: string
  patientId?: string
  newPatient?: { name: string; phone: string; id?: string }
  dentistId: string
  cabinetId: string
  date: string
  start: string
  duration: number
  procedureId: string
  source: Source
  campaignId?: string
  status?: ApptStatus
}
/** Crea la cita (y el paciente si es nuevo). Devuelve { error } si hay choque de horario. */
export function createAppointment(input: NewAppointment): { id?: string; error?: string } {
  const d = current()
  const id = input.id || uid('a')
  if (d.appointments.some((a) => a.id === id)) return { id }
  const conflict = findConflict(d, { ...input, id })
  if (conflict) return { error: conflict }
  let patients = d.patients
  let patientId = input.patientId
  if (!patientId && input.newPatient) {
    patientId = input.newPatient.id || uid('p')
    patients = [
      ...patients.filter((p) => p.id !== patientId),
      {
        id: patientId, name: input.newPatient.name, phone: input.newPatient.phone, birthDate: '', zone: '—',
        source: input.source, campaignId: input.campaignId, createdAt: input.date, dentistId: input.dentistId, status: 'nuevo',
      },
    ]
  }
  const appt: Appointment = {
    id, patientId: patientId!, dentistId: input.dentistId, cabinetId: input.cabinetId, date: input.date, start: input.start,
    duration: input.duration, procedureId: input.procedureId, status: input.status || 'confirmada', source: input.source,
    campaignId: input.campaignId, createdAt: todayISO() + ' ' + nowHM(),
  }
  const name = patients.find((p) => p.id === patientId)?.name
  const note = notify(d, appt.dentistId, `Nueva cita (${SOURCE_LABEL[appt.source]}): ${name} · ${fecha(appt.date)} ${appt.start}`, '/agenda')
  commit({ ...d, patients, appointments: [...d.appointments, appt], notifications: [...note, ...d.notifications] })
  return { id }
}
export function updateAppointment(id: string, patch: Partial<Appointment>): { error?: string } {
  const d = current()
  const a = byId(d.appointments, id)
  if (!a) return { error: 'Cita no encontrada.' }
  const next = { ...a, ...patch }
  if (patch.start || patch.cabinetId || patch.date || patch.duration || patch.dentistId) {
    const conflict = findConflict(d, next)
    if (conflict) return { error: conflict }
  }
  commit({ ...d, appointments: d.appointments.map((x) => (x.id === id ? next : x)) })
  return {}
}
function notify(d: DB, userId: string, text: string, href: string): Notification[] {
  const at = nowHM()
  const admin = d.users.find((u) => u.role === 'admin')!.id
  return [...new Set([userId, admin])].map((u) => ({ id: uid('n'), userId: u, text, href, at, read: false }))
}
export function markNotificationsRead(userId: string) {
  update((x) => ({ ...x, notifications: x.notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)) }))
}

/** Check-in por QR: guarda la anamnesis, pasa a «En sala de espera» y avisa al odontólogo. */
export function checkIn(apptId: string, personal: { name: string; phone: string; birthDate: string }, anamnesis: AnamnesisData) {
  const d = current()
  const a = byId(d.appointments, apptId)
  if (!a) return
  const p = byId(d.patients, a.patientId)!
  const allergy = [...anamnesis.allergies, anamnesis.allergyOther].filter((x) => x && x !== 'Ninguna').join(', ')
  const note = notify(
    d, a.dentistId,
    `${personal.name} está en sala de espera · ${byId(d.cabinets, a.cabinetId)?.name}${allergy ? ` · ⚠ Alergia: ${allergy}` : ''}`,
    `/consulta/${a.id}`,
  )
  commit({
    ...d,
    patients: d.patients.map((x) => (x.id === p.id ? { ...x, ...personal, anamnesis } : x)),
    appointments: d.appointments.map((x) => (x.id === apptId ? { ...x, status: 'en_espera', checkedInAt: nowHM() } : x)),
    notifications: [...note, ...d.notifications],
  })
}
export function startConsult(apptId: string) {
  updateAppointment(apptId, { status: 'en_atencion' })
}

export interface PlanItem { key: string; procedureId: string; tooth?: number; today: boolean }
/** Finalizar atención: descuenta insumos, registra el cobro en caja, guarda historia y odontograma, cita → atendida. */
export function finishConsult(apptId: string, plan: PlanItem[], marks: Record<number, ToothCondition>, method: PayMethod) {
  const d = current()
  const a = byId(d.appointments, apptId)!
  const p = byId(d.patients, a.patientId)!
  const doneIds = plan.filter((i) => i.today).map((i) => i.procedureId)
  const used = suppliesFor(d, doneIds)
  const total = plan.filter((i) => i.today).reduce((s, i) => s + byId(d.procedures, i.procedureId)!.price, 0)
  const names = plan.filter((i) => i.today).map((i) => byId(d.procedures, i.procedureId)!.name + (i.tooth ? ` (pieza ${i.tooth})` : ''))
  const pending = plan.filter((i) => !i.today).map((i) => byId(d.procedures, i.procedureId)!.name + (i.tooth ? ` (pieza ${i.tooth})` : ''))
  const at = nowHM()
  const date = todayISO()
  const short = p.name.split(' ').slice(0, 2).join(' ')
  const lowNotes = used
    .filter(({ item, qty }) => item.stock > item.min && item.stock - qty <= item.min)
    .flatMap(({ item, qty }) => notify(d, d.users.find((u) => u.role === 'admin')!.id, `Stock bajo: ${item.name} (${item.stock - qty} ${item.unit}, mínimo ${item.min})`, '/inventario'))
  commit({
    ...d,
    appointments: d.appointments.map((x) => (x.id === apptId ? { ...x, status: 'atendida' } : x)),
    patients: d.patients.map((x) => (x.id === p.id ? { ...x, status: pending.length ? 'en_tratamiento' : 'activo' } : x)),
    inventory: d.inventory.map((it) => {
      const u = used.find((x) => x.item.id === it.id)
      return u ? { ...it, stock: Math.max(0, it.stock - u.qty), lastChange: { qty: -u.qty, note: `Consulta · ${short}`, at } } : it
    }),
    transactions: total
      ? [{ id: uid('t'), date, time: at, concept: `${names.join(' + ')} · ${short}`, amount: total, method, kind: 'ingreso', patientId: p.id, appointmentId: a.id }, ...d.transactions]
      : d.transactions,
    clinicalRecords: [
      {
        id: uid('r'), patientId: p.id, appointmentId: a.id, date, dentistId: a.dentistId, total,
        summary: pending.length ? `Plan pendiente: ${pending.join(', ')}` : 'Sin tratamiento pendiente',
        procedures: names,
      },
      ...d.clinicalRecords,
    ],
    notifications: [...lowNotes, ...d.notifications],
    odontogramEvents: [
      ...d.odontogramEvents,
      ...Object.entries(marks).map(([tooth, condition]) => ({ id: uid('o'), patientId: p.id, tooth: +tooth, condition, date, dentistId: a.dentistId })),
    ],
  })
  return { total, used }
}
export function addTransaction(t: Omit<Transaction, 'id' | 'date' | 'time'>) {
  update((x) => ({ ...x, transactions: [{ ...t, id: uid('t'), date: todayISO(), time: nowHM() }, ...x.transactions] }))
}
export function adjustStock(itemId: string, delta: number, note: string) {
  update((x) => ({
    ...x,
    inventory: x.inventory.map((it) => (it.id === itemId ? { ...it, stock: Math.max(0, it.stock + delta), lastChange: { qty: delta, note, at: nowHM() } } : it)),
  }))
}
export function importPatients(list: Omit<Patient, 'id' | 'createdAt' | 'status'>[]) {
  update((x) => ({
    ...x,
    patients: [...x.patients, ...list.map((p) => ({ ...p, id: uid('p'), createdAt: todayISO(), status: 'activo' as const }))],
  }))
}

/** Odontograma actual de un paciente: último diagnóstico por pieza. */
export function toothMap(d: DB, patientId: string) {
  const map: Record<number, ToothCondition> = {}
  for (const e of d.odontogramEvents.filter((x) => x.patientId === patientId)) map[e.tooth] = e.condition
  return map
}
