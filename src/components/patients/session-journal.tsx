'use client'
/* eslint-disable @next/next/no-img-element -- Signed private clinical images must not pass through a shared image optimizer. */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip, Send, Mic, Square, Plus, FileText, Download, Eye, X, Check, LockKeyhole } from 'lucide-react'
import { todayLaPaz } from '@/lib/domain/time'
import { FILE_CATEGORY_LABEL, type JournalData, type JournalFile, type FileCategory } from '@/lib/domain/journal'
import type { PatientClinical } from '@/server/queries/clinical'
import { Modal } from '../ui'
import './session-journal.css'

const empty: JournalData = { sessions: [], messages: [], files: [], aiEnabled: false }
const date = (value: string) =>
  new Date(value.length === 10 ? `${value}T12:00:00-04:00` : value).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' })
const time = (value: string) =>
  new Date(value).toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' })

export function SessionJournal({ patientId, patientName, data }: { patientId: string; patientName?: string; data: PatientClinical }) {
  const base = `/api/patients/${patientId}/journal`
  const [journal, setJournal] = useState<JournalData>(empty),
    [selected, setSelected] = useState(''),
    [loading, setLoading] = useState(true)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [body, setBody] = useState(''),
    [visible, setVisible] = useState(true)
  const [sourceFileId, setSourceFileId] = useState<string>(),
    [draft, setDraft] = useState(false),
    [preview, setPreview] = useState(false)
  const [creating, setCreating] = useState(false),
    [title, setTitle] = useState(''),
    [sessionDate, setSessionDate] = useState(todayLaPaz())
  const [category, setCategory] = useState<FileCategory>('radiograph'),
    [recording, setRecording] = useState(false)
  const [aiFile, setAiFile] = useState<JournalFile>(),
    [consent, setConsent] = useState(false)
  const previewRef = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    mounted = useRef(true)
  const current = journal.sessions.find((s) => s.id === selected),
    open = current?.status === 'open'
  const messages = journal.messages.filter((m) => m.sessionId === selected),
    files = journal.files.filter((f) => f.sessionId === selected)
  async function reload(prefer?: string) {
    const response = await fetch(base, { cache: 'no-store' })
    const value = await response.json()
    if (!response.ok || !Array.isArray(value.sessions) || !Array.isArray(value.messages) || !Array.isArray(value.files))
      throw new Error(value.error ?? 'No pudimos cargar las sesiones.')
    setJournal(value)
    setSelected((old) => prefer ?? (value.sessions.some((s: { id: string }) => s.id === old) ? old : (value.sessions[0]?.id ?? '')))
  }
  useEffect(() => {
    let active = true
    mounted.current = true
    fetch(base, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok || !Array.isArray(j.sessions) || !Array.isArray(j.messages) || !Array.isArray(j.files))
          throw new Error(j.error ?? 'No pudimos cargar las sesiones.')
        if (active) {
          setJournal(j)
          setSelected(j.sessions[0]?.id ?? '')
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
      mounted.current = false
      clearTimeout(timer.current)
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [base])
  useEffect(() => {
    if (!preview) return
    const dialog = previewRef.current
    if (dialog && !dialog.open) dialog.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(false)
    }
    document.addEventListener('keydown', esc)
    return () => {
      dialog?.close()
      document.body.style.overflow = previous
      document.removeEventListener('keydown', esc)
    }
  }, [preview])
  async function post(payload: unknown) {
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar.')
    return result
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos completar la acción.')
    } finally {
      setBusy(false)
    }
  }
  async function saveMessage() {
    if (!body.trim() || !open) return
    await run(async () => {
      await post({ action: 'message', sessionId: selected, body, patientVisible: visible, sourceFileId })
      setBody('')
      setSourceFileId(undefined)
      setDraft(false)
      await reload()
    })
  }
  async function upload(file: File, target = selected) {
    if (!target) throw new Error('Crea o elige una sesión primero.')
    if (file.size > 3 * 1024 * 1024) throw new Error('Usa un archivo de hasta 3 MB. Divide el PDF si ocupa más.')
    const form = new FormData()
    form.set('file', file)
    form.set('sessionId', target)
    form.set('category', file.type.startsWith('audio/') ? 'audio' : category)
    form.set('patientVisible', file.type.startsWith('audio/') ? 'false' : String(visible))
    const response = await fetch(`${base}/files`, { method: 'POST', body: form })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'No se pudo subir el archivo.')
    await reload(target)
  }
  async function startRecording() {
    if (!open || busy) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador no permite grabar. Puedes adjuntar un audio o usar el dictado del teclado.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current = media
      const mime = ['audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined)
      recorder.current = rec
      const chunks: Blob[] = []
      let bytes = 0
      const target = selected
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data)
          bytes += e.data.size
          if (bytes > 3 * 1024 * 1024 && rec.state !== 'inactive') rec.stop()
        }
      }
      rec.onstop = () => {
        clearTimeout(timer.current)
        media.getTracks().forEach((t) => t.stop())
        recorder.current = null
        if (!mounted.current) return
        setRecording(false)
        const type = rec.mimeType.split(';')[0]
        const file = new File(chunks, `Nota-${Date.now()}.${type === 'audio/mp4' ? 'm4a' : 'webm'}`, { type })
        void run(() => upload(file, target))
      }
      rec.start(1000)
      setRecording(true)
      timer.current = setTimeout(() => {
        if (rec.state === 'recording') rec.stop()
      }, 60000)
    } catch {
      stream.current?.getTracks().forEach((t) => t.stop())
      setError('No pudimos acceder al micrófono. Revisa el permiso del navegador.')
    } finally {
      setBusy(false)
    }
  }
  const hasDraft = body.trim().length > 0
  function choose(id: string) {
    if (recording || busy) return
    if (hasDraft && !window.confirm('Hay una nota sin guardar. ¿Quieres descartarla para cambiar de sesión?')) return
    setBody('')
    setDraft(false)
    setSourceFileId(undefined)
    setSelected(id)
  }
  function attachment(file: JournalFile) {
    return (
      <div key={file.id} className="rounded-xl border border-white/10 bg-black/15 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 break-all font-medium">{file.name}</span>
          <span className="text-xs text-muted">
            {FILE_CATEGORY_LABEL[file.category]} · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB{!file.patientVisible ? ' · Interno' : ''}
          </span>
        </div>
        {file.url && file.mime.startsWith('image/') && (
          <img src={file.url} alt={file.name} className="mt-3 max-h-72 rounded-lg object-contain" loading="lazy" />
        )}
        {file.url && file.mime.startsWith('audio/') && (
          <audio className="mt-3 max-w-full" controls preload="none" src={file.url}>
            Audio de la sesión
          </audio>
        )}
        <div className="mt-2 flex flex-wrap gap-3">
          {file.url ? (
            <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-emerald-200">
              <FileText size={16} />
              Abrir original
            </a>
          ) : (
            <span className="text-xs text-warn">No se pudo abrir el adjunto. Actualiza las sesiones.</span>
          )}
          {(file.mime.startsWith('audio/') || (file.mime === 'application/pdf' && file.category !== 'radiograph')) && (
            <button
              type="button"
              disabled={busy || !open || !journal.aiEnabled}
              className="min-h-11 text-emerald-200"
              onClick={() => {
                setConsent(false)
                setAiFile(file)
              }}
            >
              {file.mime.startsWith('audio/') ? 'Transcribir audio' : 'Leer documento'}
            </button>
          )}
        </div>
        {file.category === 'radiograph' && (
          <p className="text-xs text-muted">El odontólogo interpreta esta radiografía y registra sus hallazgos en una nota.</p>
        )}
      </div>
    )
  }
  return (
    <section className="session-journal glass overflow-hidden" aria-label="Historial clínico por sesiones">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#153e32] p-4 sm:p-5">
        <div>
          <p className="text-xs text-emerald-200">Expediente del paciente</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Historial por sesiones</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" disabled={busy || recording} onClick={() => setCreating(true)}>
            <Plus size={17} />
            Nueva sesión
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setPreview(true)}>
            <Eye size={17} />
            Vista paciente
          </button>
          <a className="btn btn-secondary" href={`${base}/export`} target="_blank" rel="noreferrer">
            <Download size={17} />
            Exportar PDF
          </a>
        </div>
      </header>
      {error && (
        <p role="alert" className="m-4 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => void run(() => reload())}>
            Actualizar sesiones
          </button>
        </p>
      )}
      {loading ? (
        <p role="status" className="p-6 text-muted">
          Cargando sesiones…
        </p>
      ) : (
        <div className="grid min-w-0 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="Sesiones del paciente" className="border-b border-white/10 p-3 lg:border-b-0 lg:border-r">
            <div className="flex gap-2 overflow-x-auto lg:flex-col">
              {journal.sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy || recording}
                  aria-pressed={s.id === selected}
                  className={`min-h-16 min-w-40 rounded-xl p-3 text-left ${s.id === selected ? 'bg-emerald-900/60 ring-1 ring-emerald-500/40' : 'bg-white/5 hover:bg-white/10'}`}
                  onClick={() => choose(s.id)}
                >
                  <span className="block text-xs text-emerald-200">
                    {date(s.sessionDate)} · {s.status === 'open' ? 'Abierta' : 'Cerrada'}
                  </span>
                  <span className="mt-1 block break-words text-sm font-medium">{s.title}</span>
                </button>
              ))}
            </div>
            {!journal.sessions.length && <p className="p-3 text-sm text-muted">Aún no hay sesiones nuevas.</p>}
          </nav>
          <div className="min-w-0">
            {current ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-4">
                  <div>
                    <h3 className="font-semibold">{current.title}</h3>
                    <p className="text-xs text-muted">
                      {date(current.sessionDate)} · {current.status === 'open' ? 'Sesión abierta' : 'Registro cerrado'}
                    </p>
                  </div>
                  {open && (
                    <button
                      type="button"
                      disabled={busy || recording || hasDraft}
                      className="btn btn-ghost text-xs"
                      onClick={() => {
                        if (
                          window.confirm(
                            '¿Cerrar la sesión? Las notas y los archivos quedarán conservados; no podrás agregar nuevas entradas.',
                          )
                        )
                          void run(async () => {
                            await post({ action: 'close_session', sessionId: selected })
                            await reload()
                          })
                      }}
                    >
                      <Check size={16} />
                      Cerrar sesión
                    </button>
                  )}
                </div>
                <div className="journal-conversation min-h-64 space-y-4 p-4 sm:p-6" role="log" aria-label="Entradas de la sesión">
                  {!messages.length && !files.length && (
                    <p className="py-10 text-center text-sm text-muted">Escribe una nota o adjunta la radiografía de esta sesión.</p>
                  )}
                  {[
                    ...messages.map((m) => ({ type: 'message' as const, at: m.createdAt, value: m })),
                    ...files.map((f) => ({ type: 'file' as const, at: f.createdAt, value: f })),
                  ]
                    .sort((a, b) => a.at.localeCompare(b.at))
                    .map((item) =>
                      item.type === 'file' ? (
                        attachment(item.value)
                      ) : (
                        <article
                          key={item.value.id}
                          className="journal-bubble ml-auto max-w-[94%] p-4 sm:max-w-[85%]"
                          data-internal={!item.value.patientVisible}
                        >
                          <p className="whitespace-pre-wrap text-[15px] leading-6">{item.value.body}</p>
                          <footer className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs opacity-80">
                            <span>
                              {item.value.author} · {time(item.value.createdAt)}
                            </span>
                            {item.value.patientVisible ? (
                              <span>Incluido en vista paciente</span>
                            ) : (
                              <>
                                <span className="inline-flex gap-1">
                                  <LockKeyhole size={12} />
                                  Nota interna
                                </span>
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="min-h-11 underline"
                                  onClick={() =>
                                    void run(async () => {
                                      await post({ action: 'publish_message', messageId: item.value.id })
                                      await reload()
                                    })
                                  }
                                >
                                  Publicar para paciente
                                </button>
                              </>
                            )}
                          </footer>
                        </article>
                      ),
                    )}
                </div>
                {open ? (
                  <div className="border-t border-white/10 bg-[#17231f] p-4">
                    {draft && (
                      <p role="status" className="mb-2 rounded-lg bg-amber-400/10 p-2 text-xs text-amber-200">
                        Borrador generado por IA. Revisa nombres, piezas y datos antes de guardarlo. No está en el historial todavía.
                      </p>
                    )}
                    <label className="sr-only" htmlFor={`journal-note-${patientId}`}>
                      Nota de la sesión
                    </label>
                    <textarea
                      id={`journal-note-${patientId}`}
                      rows={3}
                      maxLength={12000}
                      className="field w-full resize-y"
                      placeholder="Escribe lo que hiciste en esta sesión…"
                      value={body}
                      disabled={busy || recording}
                      onChange={(e) => setBody(e.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <label className="flex min-h-11 items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={(e) => setVisible(e.target.checked)}
                          disabled={busy || recording}
                        />
                        Incluir nota y adjuntos en vista paciente
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!body.trim() || busy || recording}
                        onClick={() => void saveMessage()}
                      >
                        <Send size={17} />
                        {busy ? 'Guardando…' : draft ? 'Confirmar y guardar' : 'Guardar nota'}
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                      <label className="sr-only" htmlFor={`journal-category-${patientId}`}>
                        Tipo de adjunto
                      </label>
                      <select
                        id={`journal-category-${patientId}`}
                        className="field min-h-11 max-w-full text-xs"
                        value={category}
                        disabled={busy || recording}
                        onChange={(e) => setCategory(e.target.value as FileCategory)}
                      >
                        {Object.entries(FILE_CATEGORY_LABEL).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        ref={input}
                        type="file"
                        className="sr-only"
                        aria-label="Archivo de la sesión"
                        accept="application/pdf,image/jpeg,image/png,image/webp,audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file) void run(() => upload(file))
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        disabled={busy || recording}
                        onClick={() => input.current?.click()}
                      >
                        <Paperclip size={16} />
                        Adjuntar archivo
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        disabled={busy}
                        onClick={() => (recording ? recorder.current?.stop() : void startRecording())}
                      >
                        {recording ? <Square size={16} /> : <Mic size={16} />} {recording ? 'Detener grabación' : 'Grabar audio'}
                      </button>
                      <span className="text-[11px] text-muted">Hasta 3 MB por archivo · audio hasta 1 minuto</span>
                    </div>
                    {recording && (
                      <p role="status" className="mt-2 text-sm text-red-300">
                        Grabando… El audio quedará privado en esta sesión.
                      </p>
                    )}
                    {!journal.aiEnabled && (
                      <p className="mt-2 text-xs text-muted">
                        Transcripción y lectura de PDF pendientes de configurar OpenAI. Puedes guardar notas y adjuntos.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="border-t border-white/10 p-4 text-sm text-muted">
                    Sesión cerrada. Crea otra sesión para continuar el historial.
                  </p>
                )}
              </>
            ) : (
              <div className="p-8 text-center">
                <h3 className="text-lg text-white">Todo lo de cada visita, en un lugar</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                  Crea una sesión para reunir notas, radiografías, contratos e imágenes.
                </p>
                <button type="button" className="btn btn-primary mt-5" onClick={() => setCreating(true)}>
                  <Plus size={17} />
                  Crear primera sesión
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <details className="border-t border-white/10 p-4">
        <summary className="min-h-11 content-center text-sm text-muted">
          Historial anterior e importado (
          {data.history.length + data.notes.length + data.anamnesisVersions.length + journal.files.filter((f) => !f.sessionId).length})
        </summary>
        <div className="space-y-4 pt-3">
          {data.history.map((e) => (
            <article key={e.id} className="rounded-xl border border-white/10 p-4">
              <h3 className="font-semibold">
                {date(e.startedAt)} · {e.chiefComplaint ?? 'Atención anterior'}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {e.dentist} · {e.status === 'finished' ? 'Atención terminada' : 'Registro anterior'}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{e.notes}</p>
              {e.items.length > 0 && <p className="mt-2 text-sm">Realizado: {e.items.join(' · ')}</p>}
              {e.addenda.map((a) => (
                <p key={a.createdAt} className="mt-2 whitespace-pre-wrap text-sm">
                  Corrección ({date(a.createdAt)}): {a.notes}
                </p>
              ))}
            </article>
          ))}
          {data.notes.map((n) => (
            <article key={n.id} className="rounded-xl border border-white/10 p-3">
              <p className="text-xs text-muted">
                {date(n.notedOn)} · {n.source === 'import' ? 'Historia importada' : 'Nota anterior'} · {n.author}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{n.body}</p>
            </article>
          ))}
          {data.anamnesisVersions.map((a) => (
            <article key={a.id} className="rounded-xl border border-white/10 p-3">
              <p className="text-xs text-muted">
                {date(a.submittedAt)} · Anamnesis v{a.version}
              </p>
              <p className="mt-2 text-sm">{a.summary}</p>
            </article>
          ))}
          {journal.files.filter((f) => !f.sessionId).map(attachment)}
        </div>
      </details>
      {creating && (
        <Modal
          open={creating}
          onClose={() => {
            if (!busy) setCreating(false)
          }}
          title="Nueva sesión"
        >
          <form
            className="glass w-full max-w-md space-y-4 p-6"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                const r = await post({ action: 'create_session', title: title.trim(), sessionDate })
                await reload(r.session.id)
                setCreating(false)
                setTitle('')
                setBody('')
                setDraft(false)
              })
            }}
          >
            <h3 className="text-xl font-semibold">Nueva sesión</h3>
            {error && (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            )}
            <label className="block text-sm">
              Título
              <input
                required
                maxLength={160}
                className="field mt-2 w-full"
                autoFocus
                placeholder="Ej. Evaluación y radiografía"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Fecha
              <input
                required
                type="date"
                className="field mt-2 w-full"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setCreating(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={busy || !title.trim()}>
                Crear sesión
              </button>
            </div>
          </form>
        </Modal>
      )}
      {aiFile && (
        <Modal
          open={!!aiFile}
          onClose={() => {
            if (!busy) setAiFile(undefined)
          }}
          title="Procesar con IA"
        >
          <div className="glass w-full max-w-md space-y-4 p-6">
            <h3 className="text-xl font-semibold">Preparar borrador</h3>
            {error && (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            )}
            <p className="break-all text-sm text-muted">{aiFile.name}. Se enviará este archivo a OpenAI. El resultado necesita revisión.</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Confirmo que tengo autorización para procesar este archivo con IA.
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} className="btn btn-secondary" onClick={() => setAiFile(undefined)}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={!consent || busy || hasDraft}
                className="btn btn-primary"
                onClick={() =>
                  void run(async () => {
                    const r = await fetch(`${base}/${aiFile.mime.startsWith('audio/') ? 'transcribe' : 'extract'}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ fileId: aiFile.id, consent: true }),
                    })
                    const value = await r.json()
                    if (!r.ok) throw new Error(value.error)
                    setBody(value.text)
                    setSourceFileId(aiFile.id)
                    setDraft(true)
                    setAiFile(undefined)
                  })
                }
              >
                Procesar archivo
              </button>
            </div>
            {hasDraft && <p className="text-xs text-warn">Guarda primero la nota que estás escribiendo.</p>}
          </div>
        </Modal>
      )}
      {preview &&
        createPortal(
          <dialog
            ref={previewRef}
            onCancel={() => setPreview(false)}
            className="session-print-root"
            role="dialog"
            aria-modal="true"
            aria-label="Vista limpia del paciente"
          >
            <div className="journal-print-toolbar">
              <span>Vista paciente · solo contenido publicado</span>
              <div className="flex gap-2">
                <a className="btn btn-secondary" href={`${base}/export`} target="_blank" rel="noreferrer">
                  Descargar PDF
                </a>
                <button type="button" onClick={() => setPreview(false)}>
                  <X size={16} />
                  Cerrar vista
                </button>
              </div>
            </div>
            <div className="journal-paper">
              <small>ALQUIMIA DENTAL</small>
              <h1>Historia clínica</h1>
              <p>Paciente: {patientName ?? 'Paciente'}</p>
              {journal.sessions.map((s) => (
                <article key={s.id}>
                  <h2>
                    {date(s.sessionDate)} · {s.title}
                  </h2>
                  {journal.messages
                    .filter((m) => m.sessionId === s.id && m.patientVisible)
                    .map((m) => (
                      <div key={m.id} className="journal-print-entry">
                        <small>
                          {m.author} · {date(m.createdAt)}
                        </small>
                        <p>{m.body}</p>
                      </div>
                    ))}
                  {journal.files
                    .filter((f) => f.sessionId === s.id && f.patientVisible && !f.mime.startsWith('audio/'))
                    .map((f) => (
                      <div key={f.id} className="journal-print-entry">
                        <p>
                          {FILE_CATEGORY_LABEL[f.category]}: {f.name}
                        </p>
                        {f.url && f.mime.startsWith('image/') && (
                          <img src={f.url} alt={f.name} className="max-h-96 max-w-full object-contain" />
                        )}
                        {f.url && (
                          <a href={f.url} target="_blank" rel="noreferrer" className="underline">
                            Consultar documento original
                          </a>
                        )}
                      </div>
                    ))}
                </article>
              ))}
              {data.history
                .filter((e) => e.status === 'finished')
                .map((e) => (
                  <article key={e.id}>
                    <h2>
                      {date(e.startedAt)} · {e.chiefComplaint ?? 'Atención anterior'}
                    </h2>
                    <small>{e.dentist}</small>
                    <p>{e.notes}</p>
                  </article>
                ))}
              {journal.files
                .filter((f) => !f.sessionId && f.patientVisible && !f.mime.startsWith('audio/'))
                .map((f) => (
                  <article key={f.id}>
                    <h2>Documento previo</h2>
                    <p>{f.name}</p>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer" className="underline">
                        Consultar original
                      </a>
                    )}
                  </article>
                ))}
              {!journal.sessions.length && !data.history.length && !journal.files.length && <p>Aún no hay sesiones publicadas.</p>}
            </div>
          </dialog>,
          document.body,
        )}
    </section>
  )
}
