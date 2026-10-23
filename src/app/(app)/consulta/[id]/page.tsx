'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { CheckCircle2, Plus, Trash2, Package, Wallet, Home } from 'lucide-react'
import {
  useDB, byId, age, bs, toothMap, suppliesFor, startConsult, finishConsult, CONDITION_LABEL, METHOD_LABEL,
  type ToothCondition, type PlanItem, type PayMethod, type DB,
} from '@/lib/data'
import { kind } from '@/lib/teeth'
import { Card, StatusBadge, Modal, NoAccess } from '@/components/ui'
import { PatientPanel } from '@/components/patient-panel'
import { Odontogram } from '@/components/odontogram'

const QUAD = ['', 'superior derecho', 'superior izquierdo', 'inferior izquierdo', 'inferior derecho']
const quadrant = (n: number) => QUAD[((Math.floor(n / 10) - 1) % 4) + 1]
/** Sugerencia de tratamiento por diagnóstico. No simula resultados clínicos. */
const SUGGEST: Record<ToothCondition, ((n: number) => { procedureId: string; today: boolean }) | null> = {
  caries: () => ({ procedureId: 'resina2', today: true }),
  corona: () => ({ procedureId: 'corona_mp', today: false }),
  endodoncia: (n) => ({ procedureId: kind(n) === 'molar' ? 'endo_multi' : 'endo_uni', today: false }),
  ausente: null,
}

export default function Consulta() {
  const { id } = useParams<{ id: string }>()
  const db = useDB()
  const a = byId(db.appointments, id)
  if (!a) return <p className="glass p-6 text-muted">No se encontró la cita.</p>
  if (db.session!.role === 'odontologo' && a.dentistId !== db.session!.userId) return <NoAccess what="pacientes de otro odontólogo" />
  return <Session key={a.id} db={db} apptId={a.id} />
}

function Session({ db, apptId }: { db: DB; apptId: string }) {
  const a = byId(db.appointments, apptId)!
  const p = byId(db.patients, a.patientId)!
  const history = toothMap(db, p.id)
  const [marks, setMarks] = useState<Record<number, ToothCondition>>({})
  const [selected, setSelected] = useState<number>()
  const [plan, setPlan] = useState<PlanItem[]>([{ key: 'base', procedureId: a.procedureId, today: true }])
  const [addId, setAddId] = useState('consulta')
  const [confirm, setConfirm] = useState(false)
  const [method, setMethod] = useState<PayMethod>('qr')
  const [result, setResult] = useState<ReturnType<typeof finishConsult> | null>(null)
  const all = { ...history, ...marks }
  const locked = a.status === 'atendida' && !result
  const todayItems = plan.filter((i) => i.today)
  const price = (i: PlanItem) => byId(db.procedures, i.procedureId)!.price
  const totalToday = todayItems.reduce((s, i) => s + price(i), 0)
  const totalPlan = plan.filter((i) => !i.today).reduce((s, i) => s + price(i), 0)
  const supplies = suppliesFor(db, todayItems.map((i) => i.procedureId))

  const mark = (n: number, c: ToothCondition | null) => {
    setMarks((m) => {
      const next = { ...m }
      if (c) next[n] = c
      else delete next[n]
      return next
    })
    setPlan((list) => {
      const rest = list.filter((i) => i.key !== `auto-${n}`)
      const s = c && SUGGEST[c]?.(n)
      return s ? [...rest, { key: `auto-${n}`, tooth: n, ...s }] : rest
    })
  }

  if (result) {
    return (
      <div className="fade-in mx-auto max-w-2xl">
        <section className="halo glass relative p-8 text-center" role="status">
          <CheckCircle2 size={64} className="mx-auto text-ok drop-shadow-[0_0_16px_rgb(111_214_154/0.5)]" aria-hidden />
          <h1 className="title-gold mt-4 text-3xl">Atención finalizada</h1>
          <p className="mt-2 text-muted">{p.name} · cita marcada como <strong className="text-ok">Atendida</strong></p>
          <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
            <div className="glass p-4">
              <p className="eyebrow">Cobro en caja</p>
              <p className="num mt-1 text-2xl">{bs(result.total)}</p>
              <p className="text-xs text-muted">{METHOD_LABEL[method]}</p>
            </div>
            <div className="glass p-4">
              <p className="eyebrow">Insumos descontados</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {result.used.map((u) => <li key={u.item.id}><span className="num text-bone">−{u.qty}</span> {u.item.name}</li>)}
              </ul>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/inventario" className="btn btn-secondary"><Package size={16} aria-hidden />Ver inventario</Link>
            {db.session!.role === 'admin' && <Link href="/caja" className="btn btn-secondary"><Wallet size={16} aria-hidden />Ver caja</Link>}
            <Link href="/inicio" className="btn btn-ghost"><Home size={16} aria-hidden />Inicio</Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Consulta activa · {byId(db.cabinets, a.cabinetId)?.name} · {byId(db.users, a.dentistId)?.name}</p>
          <h1 className="title-gold text-3xl md:text-4xl">{p.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={a.status} />
          {['agendada', 'confirmada', 'en_espera'].includes(a.status) && (
            <button className="btn btn-primary" onClick={() => startConsult(a.id)}>INICIAR ATENCIÓN MÉDICA</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_1fr]">
        <PatientPanel db={db} p={p} source={a.source} campaign={byId(db.campaigns, a.campaignId)?.name} />

        <div className="space-y-5">
          <Card title="Odontograma" action={selected && <span className="num text-sm text-muted">Pieza {selected}</span>}>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_220px]">
              <Odontogram marks={all} selected={selected} onSelect={setSelected} initialDentition={p.birthDate && age(p.birthDate) < 12 ? 'temporal' : 'permanente'} />
              <div className="glass p-4" aria-live="polite">
                {selected ? (
                  <>
                    <p className="eyebrow">Pieza seleccionada</p>
                    <p className="title-gold mt-1 text-3xl">{selected}</p>
                    <p className="text-sm text-muted first-letter:uppercase">{kind(selected)} {quadrant(selected)}</p>
                    <p className="mt-2 text-sm">Estado: <strong className="text-bone">{all[selected] ? CONDITION_LABEL[all[selected]] : 'Sana'}</strong>{history[selected] && !marks[selected] && <span className="text-xs text-muted"> (histórico)</span>}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label={`Diagnóstico de la pieza ${selected}`}>
                      {(Object.keys(CONDITION_LABEL) as ToothCondition[]).map((c) => (
                        <button key={c} disabled={locked} aria-pressed={all[selected] === c} onClick={() => mark(selected, all[selected] === c ? null : c)}
                          className={`btn px-2 py-2 text-xs ${all[selected] === c ? 'btn-primary' : 'btn-secondary'}`}>
                          {CONDITION_LABEL[c]}
                        </button>
                      ))}
                      <button disabled={locked || !marks[selected]} onClick={() => mark(selected, null)} className="btn btn-ghost col-span-2 py-1.5 text-xs">Quitar marca de hoy</button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted">Elige una pieza en el odontograma para marcar caries, corona, endodoncia o ausencia.</p>
                )}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card title="Plan de tratamiento">
              <ul className="space-y-2">
                {plan.map((i) => {
                  const proc = byId(db.procedures, i.procedureId)!
                  return (
                    <li key={i.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-bone">{proc.name}</span>
                        <span className="text-xs text-muted">{i.tooth ? `Pieza ${i.tooth}` : 'General'} · {i.key === 'base' ? 'motivo de la cita' : i.key.startsWith('auto') ? 'sugerido por diagnóstico' : 'agregado'}</span>
                      </span>
                      <span className="num text-sm">{bs(proc.price)}</span>
                      <button disabled={locked} aria-pressed={i.today} onClick={() => setPlan((l) => l.map((x) => (x.key === i.key ? { ...x, today: !x.today } : x)))}
                        className={`rounded-full border px-2.5 py-1 text-[0.7rem] ${i.today ? 'border-azure/60 bg-azure/15 text-[#9cc0ff]' : 'border-white/15 text-muted'}`}>
                        {i.today ? 'Hoy' : 'Próxima sesión'}
                      </button>
                      <button disabled={locked} className="btn btn-ghost p-1.5" aria-label={`Quitar ${proc.name}`} onClick={() => setPlan((l) => l.filter((x) => x.key !== i.key))}>
                        <Trash2 size={15} />
                      </button>
                    </li>
                  )
                })}
                {!plan.length && <li className="text-sm text-muted">Sin procedimientos.</li>}
              </ul>
              <div className="mt-3 flex gap-2">
                <label className="sr-only" htmlFor="add-proc">Agregar procedimiento</label>
                <select id="add-proc" className="field" value={addId} onChange={(e) => setAddId(e.target.value)} disabled={locked}>
                  {db.procedures.map((x) => <option key={x.id} value={x.id}>{x.name} · {bs(x.price)}</option>)}
                </select>
                <button disabled={locked} className="btn btn-secondary shrink-0" onClick={() => setPlan((l) => [...l, { key: 'm' + Date.now(), procedureId: addId, tooth: selected, today: true }])}>
                  <Plus size={16} aria-hidden />{selected ? `Pieza ${selected}` : 'Agregar'}
                </button>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-4">
                <div><dt className="eyebrow">Hoy</dt><dd className="num text-2xl text-bone">{bs(totalToday)}</dd></div>
                <div><dt className="eyebrow">Próximas sesiones</dt><dd className="num text-2xl text-muted">{bs(totalPlan)}</dd></div>
              </dl>
              <p className="mt-1 text-xs text-muted">Precios [ejemplo] hasta recibir la lista oficial de la clínica.</p>
            </Card>

            <Card title="Insumos de hoy">
              <ul className="space-y-1.5 text-sm">
                {supplies.map(({ item, qty }) => {
                  const after = item.stock - qty
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted">{item.name}</span>
                      <span className="num shrink-0">
                        <span className="text-bone">−{qty}</span>
                        <span className={`ml-2 text-xs ${after <= item.min ? 'text-warn' : 'text-muted'}`}>{after <= item.min && '⚠ '}quedan {after}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 text-xs text-muted">Calculado con la «receta» de cada procedimiento. Se descuenta al finalizar.</p>
            </Card>
          </div>

          {!locked && (
            <div className="flex justify-end">
              <button className="btn btn-primary btn-xl w-full sm:w-auto" disabled={a.status !== 'en_atencion' || !todayItems.length} onClick={() => setConfirm(true)}>
                <CheckCircle2 size={20} aria-hidden /> FINALIZAR ATENCIÓN
              </button>
            </div>
          )}
          {a.status !== 'en_atencion' && !locked && <p className="text-right text-xs text-muted">Inicia la atención para poder finalizarla.</p>}
          {locked && <p className="glass p-4 text-sm text-muted">Esta atención ya fue finalizada. El odontograma y el plan quedaron en la historia del paciente.</p>}
        </div>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Finalizar atención">
        <ul className="space-y-1 text-sm">
          {todayItems.map((i) => (
            <li key={i.key} className="flex justify-between gap-2"><span>{byId(db.procedures, i.procedureId)!.name}{i.tooth ? ` (pieza ${i.tooth})` : ''}</span><span className="num">{bs(price(i))}</span></li>
          ))}
          <li className="flex justify-between border-t border-white/10 pt-2 font-semibold"><span>Total a cobrar</span><span className="num text-gold">{bs(totalToday)}</span></li>
        </ul>
        <fieldset className="mt-5">
          <legend className="label">Método de pago</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['qr', 'transferencia', 'efectivo'] as const).map((m) => (
              <label key={m} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-2 text-sm ${method === m ? 'border-gold/60 bg-gold/10 text-bone' : 'border-white/10 text-muted'}`}>
                <input type="radio" name="method" className="accent-[#c9a961]" checked={method === m} onChange={() => setMethod(m)} />{METHOD_LABEL[m]}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-4 text-xs text-muted">Al confirmar: se descuentan {supplies.reduce((s, x) => s + x.qty, 0)} insumos del inventario, entra el cobro a caja y la cita pasa a «Atendida».</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Volver</button>
          <button className="btn btn-primary" onClick={() => { setResult(finishConsult(a.id, plan, marks, method)); setConfirm(false) }}>Confirmar y finalizar</button>
        </div>
      </Modal>
    </div>
  )
}
