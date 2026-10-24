'use client'
import { useState } from 'react'
import { Copy, Plus, Trash2, UserPlus } from 'lucide-react'
import { Field, Modal } from '../ui'
import { useSave, WEEKDAYS } from './use-save'
import { saveSchedule, updateMember } from '@/server/actions/settings'
import { inviteMember } from '@/server/actions/members'
import { ROLE_LABEL, type Role } from '@/server/auth/permissions'
import { formatDateTime } from '@/lib/domain/time'
import type { SettingsData } from '@/server/queries/settings'

type Member = SettingsData['members'][number]
const ROLES = Object.keys(ROLE_LABEL) as Role[]

export function TeamTab({ data }: { data: SettingsData }) {
  const [editing, setEditing] = useState<Member | null>(null)
  const [schedule, setSchedule] = useState<Member | null>(null)
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
      <section className="glass p-5">
        <h2 className="title-gold mb-3 text-lg">Equipo <span className="num text-sm text-muted">({data.members.filter((m) => m.active).length} activos)</span></h2>
        <ul className="space-y-1.5">
          {data.members.map((m) => (
            <li key={m.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm ${m.active ? '' : 'opacity-50'}`}>
              <span className="min-w-0 flex-1">
                <span className="text-bone">{m.fullName}</span>
                <span className="block text-xs text-muted">
                  {ROLE_LABEL[m.role]}{m.title && ` · ${m.title}`}{!m.active && ' · desactivado'}
                  {m.role !== 'reception' && ` · ${m.schedule.length ? `${m.schedule.length} turnos` : 'todo el horario de la clínica'}`}
                </span>
              </span>
              {m.role !== 'reception' && <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setSchedule(m)}>Turnos</button>}
              <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(m)}>Editar</button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Nadie se borra: se desactiva y deja de entrar, pero su historial queda. Siempre queda al menos un administrador.</p>
      </section>
      <Invite invites={data.invites} />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar: ${editing?.fullName ?? ''}`}>
        {editing && <MemberForm key={editing.id} m={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!schedule} onClose={() => setSchedule(null)} title={`Turnos: ${schedule?.fullName ?? ''}`} wide>
        {schedule && <ScheduleForm key={schedule.id} m={schedule} hours={data.hours} onDone={() => setSchedule(null)} />}
      </Modal>
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

function Invite({ invites }: { invites: SettingsData['invites'] }) {
  const [f, setF] = useState({ email: '', role: 'dentist' as Role })
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const { pending, fields, run, status } = useSave()
  return (
    <section className="glass h-fit p-5">
      <h2 className="title-gold mb-1 text-lg">Invitar a alguien</h2>
      <p className="mb-3 text-xs text-muted">Se genera un enlace de un solo uso (vale 72 horas). Mándalo por WhatsApp o correo; la persona elige su contraseña.</p>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault()
        setLink(null)
        run(async () => {
          const r = await inviteMember(f)
          if (r.ok) setLink({ url: r.data.inviteUrl, expiresAt: r.data.expiresAt })
          return r
        }, () => setF({ ...f, email: '' }))
      }}>
        <Field label="Correo" error={fields.email}>{(id) => <input id={id} type="email" className="field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="Rol">
          {(id) => (
            <select id={id} className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          )}
        </Field>
        <button className="btn btn-primary w-full" disabled={pending}><UserPlus size={16} aria-hidden />Crear invitación</button>
      </form>
      <div className="mt-2">{!link && status}</div>
      {link && (
        <div className="mt-3 rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm" role="status">
          <p className="text-ok">Invitación creada. Copia el enlace y envíaselo:</p>
          <p className="num mt-1 break-all text-xs text-bone">{link.url}</p>
          <button className="btn btn-secondary mt-2 px-3 py-1 text-xs" onClick={() => navigator.clipboard.writeText(link.url).then(() => setCopied(true))}>
            <Copy size={13} aria-hidden />{copied ? 'Copiado' : 'Copiar enlace'}
          </button>
        </div>
      )}
      {invites.length > 0 && (
        <div className="mt-4 border-t border-white/8 pt-3">
          <p className="eyebrow mb-1">Invitaciones pendientes</p>
          <ul className="space-y-1 text-xs text-muted">
            {invites.map((i) => <li key={i.id}><span className="text-bone">{i.email}</span> · {ROLE_LABEL[i.role]} · vence {formatDateTime(i.expiresAt)}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}
