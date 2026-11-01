'use client'
import Link from 'next/link'
import { useState } from 'react'
import { FileImage, FileSpreadsheet, ScanText, CheckCircle2, AlertTriangle, Upload } from 'lucide-react'
import { importPatients, fecha } from '@/lib/data'
import { PageHeader, Card } from '@/components/ui'

type Mode = 'foto' | 'excel'
type F = { key: string; label: string; value: string; conf: number; ok: boolean }

const PAPER: F[] = [
  { key: 'name', label: 'Nombre', value: 'Rosmery Ticona Apaza', conf: 97 },
  { key: 'birthDate', label: 'Fecha de nacimiento', value: '1987-03-12', conf: 91 },
  { key: 'phone', label: 'Celular', value: '+591 7000 5512', conf: 74 },
  { key: 'zone', label: 'Zona', value: 'Miraflores', conf: 88 },
  { key: 'allergy', label: 'Alergias', value: 'Penicilina', conf: 62 },
  { key: 'condition', label: 'Antecedentes', value: 'Hipertensión', conf: 86 },
  { key: 'last', label: 'Último tratamiento', value: 'Endodoncia pieza 36 (2023)', conf: 55 },
].map((f) => ({ ...f, ok: f.conf >= 80 }))

const SHEET = [
  { name: 'Hugo Mamani Copa', phone: '+591 7000 6101', last: '2024-11-03', conf: 96 },
  { name: 'Teresa Quisbert Lima', phone: '+591 7000 6102', last: '2025-02-17', conf: 94 },
  { name: 'Gonzalo Vargas Ríos', phone: '+591 7000 61O3', last: '2023-08-22', conf: 68 },
  { name: 'Patricia Flores Nina', phone: '+591 7000 6104', last: '2025-06-09', conf: 92 },
  { name: 'Iván Choque Huanca', phone: '+591 7000 6105', last: '2022-12-01', conf: 71 },
].map((r) => ({ ...r, ok: r.conf >= 80 }))

export default function Ingesta() {
  const [mode, setMode] = useState<Mode>()
  const [phase, setPhase] = useState<'idle' | 'reading' | 'review' | 'saved'>('idle')
  const [fields, setFields] = useState(PAPER)
  const [rows, setRows] = useState(SHEET)
  const pending = mode === 'foto' ? fields.filter((f) => !f.ok).length : rows.filter((r) => !r.ok).length

  const start = (m: Mode) => {
    setMode(m)
    setFields(PAPER)
    setRows(SHEET)
    setPhase('reading')
    setTimeout(() => setPhase('review'), 2200)
  }
  const approve = () => {
    const get = (k: string) => fields.find((f) => f.key === k)!.value
    importPatients(
      mode === 'foto'
        ? [{
            name: get('name'), phone: get('phone'), birthDate: get('birthDate'), zone: get('zone'), source: 'historico', dentistId: 'u-doc',
            anamnesis: { allergies: [get('allergy')], allergyOther: '', conditions: [get('condition')], medications: '', reason: get('last'), emergencyContact: '', consent: false, signature: '', submittedAt: '' },
          }]
        : rows.map((r) => ({ name: r.name, phone: r.phone.replace(/O/g, '0'), birthDate: '', zone: '—', source: 'historico' as const, dentistId: 'u-doc' })),
    )
    setPhase('saved')
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Migración de historiales · demostración" title="Importar pacientes" />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <button className="glass flex items-center gap-3 p-4 text-left hover:ring-1 hover:ring-gold/50" onClick={() => start('foto')}>
          <FileImage className="text-gold" aria-hidden /><span><span className="block text-bone">Foto de ficha en papel</span><span className="text-sm text-muted">ficha_rosmery.jpg</span></span>
        </button>
        <button className="glass flex items-center gap-3 p-4 text-left hover:ring-1 hover:ring-gold/50" onClick={() => start('excel')}>
          <FileSpreadsheet className="text-gold" aria-hidden /><span><span className="block text-bone">Planilla de Excel</span><span className="text-sm text-muted">pacientes_2019.xlsx</span></span>
        </button>
        <label className="glass flex cursor-pointer items-center gap-3 p-4 hover:ring-1 hover:ring-gold/50 focus-within:ring-2 focus-within:ring-azure">
          <Upload className="text-gold" aria-hidden />
          <span><span className="block text-bone">Subir archivo</span><span className="text-sm text-muted">Simulado: no se lee el contenido</span></span>
          <input type="file" className="sr-only" accept="image/*,.xlsx,.xls,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) start(/\.(xlsx|xls|csv)$/i.test(f.name) ? 'excel' : 'foto'); e.target.value = '' }} />
        </label>
      </div>

      {phase === 'idle' && <p className="glass p-6 text-sm text-muted">Elige un archivo de ejemplo. La «lectura inteligente» arma un borrador; nada se guarda sin revisión humana.</p>}

      {phase !== 'idle' && mode && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_1.1fr]">
          <Card title="Documento">
            <div className="relative overflow-hidden rounded-xl">
              {mode === 'foto' ? (
                <div className="rotate-[-1.2deg] bg-[#efe6d2] p-6 font-display text-[#2b2620] shadow-inner">
                  <p className="text-center text-sm font-semibold tracking-widest">FICHA ODONTOLÓGICA</p>
                  {['Nombre: Rosmery Ticona A.', 'F. nac.: 12/3/87', 'Cel.: 7000 55l2', 'Zona: Miraflores', 'Alergias: penicil…', 'Antec.: hipertensión', 'Trat.: endo 36 — 2023'].map((l) => (
                    <p key={l} className="mt-3 border-b border-[#2b2620]/20 pb-1 italic">{l}</p>
                  ))}
                </div>
              ) : (
                <table className="num w-full bg-[#f4f4f1] text-left text-[0.72rem] text-[#222]">
                  <thead><tr className="bg-[#1f6e43] text-white">{['A · Nombre', 'B · Celular', 'C · Última visita'].map((h) => <th key={h} className="px-2 py-1 font-normal">{h}</th>)}</tr></thead>
                  <tbody>{SHEET.map((r) => <tr key={r.name} className="border-b border-black/10"><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1">{r.phone}</td><td className="px-2 py-1">{fecha(r.last)}</td></tr>)}</tbody>
                </table>
              )}
              {phase === 'reading' && (
                <div aria-hidden className="absolute inset-x-0 h-[3px] bg-azure shadow-[0_0_20px_6px_rgb(47_123_255/0.6)]" style={{ animation: 'scan 1.1s ease-in-out infinite alternate' }} />
              )}
            </div>
          </Card>

          <Card title={phase === 'reading' ? 'Leyendo…' : phase === 'saved' ? 'Guardado' : 'Borrador para revisar'}>
            {phase === 'reading' && (
              <p className="flex items-center gap-2 text-sm text-muted" role="status"><ScanText className="animate-pulse text-azure" aria-hidden />Preparando ejemplo de importación…</p>
            )}
            {phase === 'saved' && (
              <div role="status" className="text-center">
                <CheckCircle2 size={52} className="mx-auto text-ok" aria-hidden />
                <p className="mt-3 text-bone">{mode === 'foto' ? '1 paciente guardado' : `${rows.length} pacientes guardados`} tras revisión humana.</p>
                <Link href="/pacientes" className="btn btn-secondary mt-4">Ver en Pacientes</Link>
              </div>
            )}
            {phase === 'review' && (
              <>
                {mode === 'foto' ? (
                  <ul className="space-y-3">
                    {fields.map((f, i) => (
                      <li key={f.key} className={`rounded-xl border p-3 ${f.conf < 80 ? 'border-warn/50 bg-warn/5' : 'border-white/8'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor={`f-${f.key}`} className="text-xs text-muted">{f.label}</label>
                          <span className={`num text-xs ${f.conf < 80 ? 'text-warn' : 'text-muted'}`}>{f.conf < 80 && <AlertTriangle size={12} className="mr-1 inline" aria-hidden />}confianza {f.conf} %</span>
                        </div>
                        <input id={`f-${f.key}`} type={f.key === 'birthDate' ? 'date' : 'text'} className="field mt-1" value={f.value}
                          onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                        {f.conf < 80 && (
                          <label className="mt-2 flex items-center gap-2 text-xs text-warn">
                            <input type="checkbox" className="accent-[#c9a961]" checked={f.ok} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))} />
                            Confianza baja · lo revisé contra el original
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-2">
                    {rows.map((r, i) => (
                      <li key={r.name} className={`rounded-xl border p-3 text-sm ${r.conf < 80 ? 'border-warn/50 bg-warn/5' : 'border-white/8'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-bone">{r.name}</span>
                          <span className={`num text-xs ${r.conf < 80 ? 'text-warn' : 'text-muted'}`}>confianza {r.conf} %</span>
                        </div>
                        <label className="mt-1 block text-xs text-muted" htmlFor={`r-${i}`}>Celular</label>
                        <input id={`r-${i}`} className="field num mt-0.5" value={r.phone} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                        {r.conf < 80 && (
                          <label className="mt-2 flex items-center gap-2 text-xs text-warn">
                            <input type="checkbox" className="accent-[#c9a961]" checked={r.ok} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))} />
                            Revisado (posible «O» en lugar de «0»)
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted" aria-live="polite">{pending ? `${pending} campo(s) de baja confianza por revisar` : 'Todo revisado'}</p>
                  <button className="btn btn-primary" disabled={pending > 0} onClick={approve}><CheckCircle2 size={16} aria-hidden />Aprobar y guardar</button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
