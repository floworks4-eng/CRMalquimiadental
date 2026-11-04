'use client'
import { useState } from 'react'
import { KeyRound, Plus, Trash2, UserPlus } from 'lucide-react'
import { Field, Modal } from '../ui'
import { useSave, WEEKDAYS } from './use-save'
import { saveSchedule, updateMember } from '@/server/actions/settings'
import { createMember, setMemberPassword } from '@/server/actions/members'
import { ROLE_LABEL, type Role } from '@/server/auth/permissions'
import type { SettingsData } from '@/server/queries/settings'

type Member = SettingsData['members'][number]
const ROLES = Object.keys(ROLE_LABEL) as Role[]

export function TeamTab({ data }: { data: SettingsData }) {
  const [editing, setEditing] = useState<Member | null>(null)
  const [schedule, setSchedule] = useState<Member | null>(null)
  const [password, setPassword] = useState<Member | null>(null)
  const access = useSave()
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
      <section className="glass p-5">
        <h2 className="title-gold mb-3 text-lg">Equipo <span className="num text-sm text-muted">({data.members.filter((m) => m.active).length} activos)</span></h2>
        <ul className="space-y-1.5">
          {data.members.map((m) => (
            <li key={m.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm ${m.active ? '' : 'opacity-50'}`}>
              <span className="min-w-0 flex-1">
                <span className="text-bone">{m.fullName}</span>
                {m.email && <span className="ml-2 text-xs text-muted">{m.email}</span>}
                <span className="block text-xs text-muted">
                  {ROLE_LABEL[m.role]}{m.title && ` · ${m.title}`}{!m.active && ' · desactivado'}
                  {m.role !== 'reception' && ` · ${m.schedule.length ? `${m.schedule.length} turnos` : 'todo el horario de la clínica'}`}
                </span>
              </span>
              {m.role !== 'reception' && <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setSchedule(m)}>Turnos</button>}
              <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setPassword(m)}><KeyRound size={13} aria-hidden />Contraseña</button>
              <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(m)}>Editar</button>
              <button type="button" className="btn btn-secondary px-2 py-1 text-xs" disabled={access.pending} onClick={() => access.run(() => updateMember({ memberId: m.id, role: m.role, title: m.title ?? '', active: !m.active }))}>{m.active ? 'Quitar acceso' : 'Reactivar'}</button>
            </li>
          ))}
        </ul>
        <div className="mt-3">{access.status}</div>
        <p className="mt-3 text-xs text-muted">Nadie se borra: se desactiva y deja de entrar, pero su historial queda. Siempre queda al menos un administrador.</p>
      </section>
      <CreateMember />

      {editing && <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar: ${editing.fullName}`}>
        <MemberForm key={editing.id} m={editing} onDone={() => setEditing(null)} />
      </Modal>}
      {password && <Modal open={!!password} onClose={() => setPassword(null)} title={`Contraseña de ${password.fullName}`}>
        <PasswordForm key={password.id} m={password} onDone={() => setPassword(null)} />
      </Modal>}
      {schedule && <Modal open={!!schedule} onClose={() => setSchedule(null)} title={`Turnos: ${schedule.fullName}`} wide>
        <ScheduleForm key={schedule.id} m={schedule} hours={data.hours} onDone={() => setSchedule(null)} />
      </Modal>}
    </div>
  )
}

function MemberForm({ m, onDone }: { m: Member; onDone: () => void }) {
  const [f, setF] = useState({ role: m.role, title: m.title ?? '', active: m.active })
  const { pending, run, status } = useSave()
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => updateMember({ memberId: m.id, ...f }), onDone) }}>
      <Field label="Rol">
        {(id) => (
          <select id={id} className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        )}
      </Field>
      <Field label="Cargo (opcional)" hint="Ej. Endodoncista, Ortodoncista.">{(id) => <input id={id} className="field" maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-[#c9a961]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Activo (puede entrar al sistema)</label>
      {status}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button className="btn btn-primary" disabled={pending}>Guardar</button>
      </div>
    </form>
  )
}

function ScheduleForm({ m, hours, onDone }: { m: Member; hours: SettingsData['hours']; onDone: () => void }) {
  const [rows, setRows] = useState(m.schedule)
  const { pending, run, status } = useSave()
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Sin turnos, {m.fullName} atiende en todo el horario de la clínica. Con turnos, la agenda solo ofrece esos horarios.</p>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <select aria-label="Día" className="field w-auto" value={r.weekday} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))}>
              {[1, 2, 3, 4, 5, 6, 0].map((w) => <option key={w} value={w}>{WEEKDAYS[w]}</option>)}
            </select>
            <input type="time" step={900} aria-label="Entrada" className="field w-auto" value={r.starts} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, starts: e.target.value } : x)))} />
            <span className="text-muted">a</span>
            <input type="time" step={900} aria-label="Salida" className="field w-auto" value={r.ends} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, ends: e.target.value } : x)))} />
            <button type="button" className="btn btn-ghost p-1.5" aria-label="Quitar turno" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost text-xs" onClick={() => setRows([...rows, { weekday: 1, starts: '08:30', ends: '13:00' }])}><Plus size={14} aria-hidden />Agregar turno</button>
        <button type="button" className="btn btn-ghost text-xs" onClick={() => setRows(hours.filter((h) => !h.closed).map((h) => ({ weekday: h.weekday, starts: h.opens, ends: h.closes })))}>Copiar horario de la clínica</button>
      </div>
      {status}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => saveSchedule({ dentistId: m.userId, days: rows }), onDone)}>Guardar turnos</button>
      </div>
    </div>
  )
}

/** Solo el administrador crea cuentas. Le entrega a la persona su correo y la contraseña inicial. */
function CreateMember() {
  const empty = { fullName: '', email: '', role: 'dentist' as Role, title: '', password: '' }
  const [f, setF] = useState(empty)
  const [created, setCreated] = useState<{ name: string; email: string } | null>(null)
  const { pending, fields, run, status } = useSave()
  const input = (k: 'fullName' | 'email' | 'title' | 'password', label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field label={label} error={fields[k]} hint={hint}>{(id) => <input id={id} className="field" autoComplete="off" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />}</Field>
  )
  return (
    <section className="glass h-fit p-5">
      <h2 className="title-gold mb-1 text-lg">Crear cuenta</h2>
      <p className="mb-3 text-xs text-muted">Solo el administrador crea cuentas. Entrégale a la persona su correo y la contraseña inicial; después la cambia en «Mi cuenta».</p>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault()
        setCreated(null)
        run(() => createMember(f), () => { setCreated({ name: f.fullName, email: f.email }); setF(empty) })
      }}>
        {input('fullName', 'Nombre completo')}
        {input('email', 'Correo', { type: 'email' })}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Rol">
            {(id) => (
              <select id={id} className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            )}
          </Field>
          {input('title', 'Cargo (opcional)', { placeholder: 'Ej. Endodoncista' })}
        </div>
        {input('password', 'Contraseña inicial', { type: 'password', autoComplete: 'new-password' }, 'Mínimo 12 caracteres. La persona puede ingresar directamente, sin esperar un correo.')}
        <button className="btn btn-primary w-full" disabled={pending}><UserPlus size={16} aria-hidden />{pending ? 'Creando…' : 'Crear cuenta'}</button>
      </form>
      <div className="mt-2">{!created && status}</div>
      {created && <p role="status" className="mt-3 rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm text-ok">Cuenta creada para {created.name}. Ya puede entrar con {created.email} y la contraseña que le diste.</p>}
      <p className="mt-4 border-t border-white/8 pt-3 text-xs text-muted">
        El Doc puede añadir odontólogas, recepción y caja desde aquí. Administrador: todo. Odontólogo: su agenda, sus pacientes y su historia clínica. Recepción: agenda, pacientes (sin datos clínicos) y caja.
      </p>
    </section>
  )
}

function PasswordForm({ m, onDone }: { m: Member; onDone: () => void }) {
  const [value, setValue] = useState('')
  const [done, setDone] = useState(false)
  const { pending, fields, run, status } = useSave()
  if (done) return <div className="space-y-3" role="status"><p className="text-sm text-ok">Contraseña cambiada. Entrégasela a {m.fullName}.</p><button className="btn btn-primary" onClick={onDone}>Listo</button></div>
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => setMemberPassword({ memberId: m.id, password: value }), () => setDone(true)) }}>
      <p className="text-sm text-muted">Para cuando {m.fullName} olvidó su contraseña. La anterior deja de funcionar.</p>
      <Field label="Contraseña nueva" error={fields.password} hint="Mínimo 12 caracteres.">{(id) => <input id={id} className="field" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />}</Field>
      {status}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        <button className="btn btn-primary" disabled={pending}>Guardar</button>
      </div>
    </form>
  )
}
