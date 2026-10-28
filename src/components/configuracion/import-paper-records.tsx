'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Camera, Upload, FileText, X } from 'lucide-react'
import { Field } from '../ui'
import { createPaperPatient, searchPatientPicker } from '@/server/actions/patients'

type Patient = { id: string; fullName: string }

export function ImportPaperRecords() {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Patient[]>([])
  const [patient, setPatient] = useState<Patient | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Patient | null>(null)
  const [progress, setProgress] = useState('')
  useEffect(() => {
    let cancelled = false
    const timeout = setTimeout(async () => {
      if (query.trim().length < 2) { setMatches([]); return }
      try {
        const rows = await searchPatientPicker(query)
        if (!cancelled) setMatches(rows)
      } catch { if (!cancelled) setError('No pudimos buscar pacientes. Intenta de nuevo.') }
    }, 250)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [query])

  const choose = (selected: FileList | null) => {
    if (!selected) return
    const next = [...files, ...Array.from(selected)]
    if (next.length > 20) { setError('Selecciona hasta 20 páginas por carga.'); return }
    if (next.some((f) => !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type) || !f.size || f.size > 20 * 1024 * 1024)) {
      setError('Usa fotos JPG, PNG, WEBP o PDF de hasta 20 MB cada uno.'); return
    }
    setFiles(next); setError(''); setSaved(null)
  }
  const save = async () => {
    setPending(true); setError(''); setSaved(null)
    let target = patient
    const remaining = [...files]
    try {
      if (!target && mode === 'new') {
        const result = await createPaperPatient({ fullName: name, phone })
        if (!result.ok) { setError(result.error.message); return }
        target = { id: result.data.id, fullName: name }
        setPatient(target)
      }
      if (!target) { setError('Elige un paciente o escribe los datos del nuevo paciente.'); return }
      for (const file of files) {
        setProgress(`Guardando ${file.name}…`)
        const form = new FormData(); form.set('file', file)
        const response = await fetch(`/api/patients/${target.id}/files`, { method: 'POST', body: form })
        if (!response.ok) {
          const result = await response.json().catch(() => null)
          throw new Error(result?.error ?? 'No pudimos subir la ficha. Puedes reintentar los archivos pendientes.')
        }
        remaining.shift(); setFiles([...remaining])
      }
      setSaved(target)
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos guardar las fichas.') }
    finally { setPending(false); setProgress('') }
  }
  return (
    <section className="glass max-w-4xl p-5" aria-labelledby="paper-import-title">
      <h2 id="paper-import-title" className="title-gold text-xl">Digitalizar fichas en papel</h2>
      <p className="mt-2 text-sm text-white">Elige el paciente, toma fotos de sus hojas o adjunta los archivos y guárdalos en su historial médico.</p>
      <div className="my-4 flex flex-wrap gap-2" role="group" aria-label="Destino de la ficha">
        <button type="button" disabled={pending} className={`btn ${mode === 'existing' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={mode === 'existing'} onClick={() => { setMode('existing'); setPatient(null); setSaved(null) }}>Paciente existente</button>
        <button type="button" disabled={pending} className={`btn ${mode === 'new' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={mode === 'new'} onClick={() => { setMode('new'); setPatient(null); setSaved(null) }}>Nuevo paciente desde papel</button>
      </div>
      <fieldset disabled={pending} className="space-y-3">
        {mode === 'existing' && <>
          <Field label="Buscar paciente" hint="Escribe al menos dos letras del nombre o su celular.">{(id) => <input id={id} className="field" value={query} onChange={(e) => { setQuery(e.target.value); setPatient(null) }} />}</Field>
          {!patient && matches.length > 0 && <ul className="rounded-xl border border-white/15 p-2">{matches.map((p) => <li key={p.id}><button type="button" className="btn btn-ghost w-full justify-start" onClick={() => { setPatient(p); setQuery(p.fullName) }}>{p.fullName}</button></li>)}</ul>}
        </>}
        {mode === 'new' && !patient && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre y apellido del paciente">{(id) => <input id={id} className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
          <Field label="Celular (opcional)" hint="Puede quedar vacío si no aparece en la ficha.">{(id) => <input id={id} className="field" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />}</Field>
        </div>}
        {patient && <p className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-sm text-white">Ficha para: <strong>{patient.fullName}</strong></p>}
        <div className="flex flex-wrap gap-2 pt-2">
          <label className="btn btn-secondary cursor-pointer"><Camera size={16} />Tomar foto<input aria-label="Tomar foto de ficha" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => { choose(e.target.files); e.target.value = '' }} /></label>
          <label className="btn btn-secondary cursor-pointer"><Upload size={16} />Seleccionar fotos o PDF<input aria-label="Seleccionar fotos o PDF" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(e) => { choose(e.target.files); e.target.value = '' }} /></label>
        </div>
        <p className="text-xs text-muted">Hasta 20 páginas, 20 MB por archivo. Se conserva la foto original; los datos médicos se transcriben y revisan en la ficha del paciente.</p>
        {files.length > 0 && <ul className="space-y-2">{files.map((f, i) => <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-white/10 p-2 text-sm"><FilePreview file={f} /><span className="min-w-0 flex-1 truncate">{f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" aria-label={`Quitar ${f.name}`} className="btn btn-ghost p-1" onClick={() => setFiles(files.filter((_, index) => index !== i))}><X size={16} /></button></li>)}</ul>}
        <button type="button" className="btn btn-primary" disabled={!files.length || (!patient && (mode === 'existing' || name.trim().split(/\s+/).length < 2))} onClick={save}>{pending ? progress || 'Preparando…' : `Guardar ${files.length || ''} ficha${files.length === 1 ? '' : 's'} en el historial`}</button>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      {saved && <p role="status" className="mt-3 text-sm text-ok">Fichas guardadas para {saved.fullName}. <Link href={`/pacientes/${saved.id}`} className="underline">Abrir historial del paciente</Link></p>}
    </section>
  )
}

function FilePreview({ file }: { file: File }) {
  const preview = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!file.type.startsWith('image/')) return
    const objectUrl = URL.createObjectURL(file)
    if (preview.current) preview.current.style.backgroundImage = `url("${objectUrl}")`
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return file.type.startsWith('image/') ? <span ref={preview} role="img" aria-label={`Vista previa de ${file.name}`} className="h-20 w-16 shrink-0 rounded-md bg-white/5 bg-contain bg-center bg-no-repeat" /> : <FileText size={24} aria-hidden />
}
