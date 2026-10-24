'use client'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { Download, Upload } from 'lucide-react'
import { importPatients, type ImportResult, type ImportRow } from '@/server/actions/patients'
import { mapHeader, parseCsv, toIsoDate, toSex, type PatientColumn } from '@/lib/domain/csv'
import { normalizeBoPhone } from '@/lib/domain/phone'

const TEMPLATE = 'Nombre;Celular;Fecha de nacimiento;Sexo;Zona;Dirección;Correo;Alergias;Antecedentes;Medicamentos;Historial;Fecha historial\n'
  + 'Juan Pérez Mamani;71234567;31/12/1990;M;Sopocachi;Av. 20 de Octubre 123;;Penicilina;Hipertensión;Losartán;"Endodoncia 46 (2023). Resina 36 (2024). Control anual.";15/03/2024\n'

type Preview = { row: number; data: ImportRow; problem: string | null }

/** Importación de la planilla de pacientes: se revisa en pantalla antes de guardar nada. */
export function ImportPatients() {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][] | null>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const { preview, missing } = useMemo(() => {
    if (!rows?.length) return { preview: [] as Preview[], missing: [] as string[] }
    const cols = mapHeader(rows[0])
    const missing = cols.fullName === undefined ? ['Nombre'] : []
    const get = (r: string[], k: PatientColumn) => (cols[k] !== undefined ? (r[cols[k]!] ?? '').trim() : '')
    const seen = new Set<string>()
    const preview = rows.slice(1).map((r, i): Preview => {
      const data: ImportRow = {
        fullName: get(r, 'fullName'), phone: get(r, 'phone'), birthDate: toIsoDate(get(r, 'birthDate')), sex: toSex(get(r, 'sex')),
        zone: get(r, 'zone'), address: get(r, 'address'), email: get(r, 'email'),
        allergies: get(r, 'allergies'), conditions: get(r, 'conditions'), medications: get(r, 'medications'),
        history: get(r, 'history'), historyDate: toIsoDate(get(r, 'historyDate')),
      }
      const phone = data.phone ? normalizeBoPhone(data.phone) : null
      const key = phone ?? `${data.fullName.toLowerCase()}|${data.birthDate}`
      const problem = data.fullName.split(/\s+/).length < 2 ? 'Falta nombre y apellido'
        : data.phone && !phone ? 'Celular no válido (8 dígitos, empieza con 6 o 7)'
        : seen.has(key) ? 'Repetido en el archivo'
        : get(r, 'birthDate') && !data.birthDate ? 'Fecha de nacimiento no reconocida'
        : get(r, 'historyDate') && !data.historyDate ? 'Fecha del historial no reconocida'
        : null
      seen.add(key)
      return { row: i + 2, data, problem }
    })
    return { preview, missing }
  }, [rows])
  const ok = preview.filter((p) => !p.problem)

  const onFile = async (f: File | undefined) => {
    setError('')
    setResult(null)
    if (!f) return
    if (f.size > 2_000_000) return setError('El archivo pesa más de 2 MB. Divídelo en partes.')
    setFileName(f.name)
    setRows(parseCsv(await f.text()))
  }
  const send = () => start(async () => {
    setError('')
    const r = await importPatients({ rows: ok.map((p) => p.data) })
    if (r.ok) {
      setResult(r.data)
      setRows(null)
    } else setError(r.error.message)
  })

  return (
    <section className="glass max-w-4xl p-5">
      <h2 className="title-gold text-lg">Importar pacientes desde Excel</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Descarga la plantilla, o usa tu planilla. Solo <strong className="text-bone">Nombre</strong> es obligatorio. Opcionales: celular, fecha de nacimiento, sexo, zona, dirección, correo y la historia clínica: <strong className="text-bone">Alergias, Antecedentes, Medicamentos, Historial</strong> y <strong className="text-bone">Fecha historial</strong>.</li>
        <li>En Excel: <em>Archivo → Guardar como → CSV</em>.</li>
        <li>Súbelo aquí, revisa la vista previa e importa. Nada se guarda hasta que confirmes.</li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <a className="btn btn-ghost" download="plantilla-pacientes.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + TEMPLATE)}`}><Download size={16} aria-hidden />Plantilla</a>
        <label className="btn btn-secondary cursor-pointer">
          <Upload size={16} aria-hidden />{fileName || 'Elegir archivo CSV'}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      {missing.length > 0 && <p role="alert" className="mt-3 text-sm text-bad">No encontramos la columna {missing.join(' ni ')} en el encabezado.</p>}

      {result && (
        <div role="status" className="mt-4 rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm">
          <p className="text-ok">Se importaron {result.inserted} pacientes ({result.withHistory} con historia clínica).{result.skipped.length > 0 && ` Se omitieron ${result.skipped.length}.`}</p>
          {result.skipped.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-muted">{result.skipped.map((s) => <li key={s.row}>Fila {s.row}: {s.reason}</li>)}</ul>
          )}
          <Link href="/pacientes" className="mt-2 inline-block text-gold-soft underline">Ver pacientes</Link>
        </div>
      )}

      {rows && !missing.length && (
        <div className="mt-4">
          <p className="text-sm"><span className="text-ok">{ok.length} listos</span>{preview.length - ok.length > 0 && <span className="text-warn"> · {preview.length - ok.length} con problemas (no se importan)</span>}</p>
          <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-white/8">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#1e1f21]"><tr className="text-left text-muted"><th className="p-2 font-normal">Fila</th><th className="p-2 font-normal">Nombre</th><th className="p-2 font-normal">Celular</th><th className="p-2 font-normal">Nacimiento</th><th className="p-2 font-normal">Historia clínica</th><th className="p-2 font-normal">Estado</th></tr></thead>
              <tbody>
                {preview.slice(0, 300).map((p) => (
                  <tr key={p.row} className="border-t border-white/6">
                    <td className="num p-2 text-muted">{p.row}</td><td className="p-2 text-bone">{p.data.fullName}</td><td className="num p-2">{p.data.phone}</td>
                    <td className="num p-2">{p.data.birthDate}</td><td className="max-w-64 truncate p-2 text-muted" title={[p.data.allergies && `Alergias: ${p.data.allergies}`, p.data.conditions && `Antecedentes: ${p.data.conditions}`, p.data.medications && `Medicamentos: ${p.data.medications}`, p.data.history].filter(Boolean).join(' · ')}>
                      {[p.data.allergies && `Alergias: ${p.data.allergies}`, p.data.conditions, p.data.history].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className={`p-2 ${p.problem ? 'text-warn' : 'text-ok'}`}>{p.problem ?? 'OK'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 300 && <p className="mt-1 text-xs text-muted">Se muestran las primeras 300 filas.</p>}
          <button className="btn btn-primary mt-3" disabled={pending || !ok.length} onClick={send}>{pending ? 'Importando…' : `Importar ${ok.length} pacientes`}</button>
        </div>
      )}
    </section>
  )
}
