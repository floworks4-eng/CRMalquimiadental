'use client'
/* eslint-disable @next/next/no-img-element -- Signed private clinical images must not pass through a shared image optimizer. */
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Paperclip,
  Send,
  Mic,
  Square,
  Plus,
  FileText,
  Download,
  Eye,
  X,
  Check,
  LockKeyhole,
  Camera,
  Image as ImageIcon,
  RotateCcw,
} from 'lucide-react'
import { todayLaPaz } from '@/lib/domain/time'
import { FILE_CATEGORY_LABEL, type JournalData, type JournalFile, type FileCategory } from '@/lib/domain/journal'
import type { PatientClinical } from '@/server/queries/clinical'
import { Modal } from '../ui'
import {
  clipboardFiles,
  DOCUMENT_ACCEPT,
  hasDraggedFiles,
  PHOTO_ACCEPT,
  stageAttachment,
  uploadAttachment,
  useJournalRecorder,
  type PendingAttachment,
} from './session-journal-attachments'
import './session-journal.css'

const empty: JournalData = { sessions: [], messages: [], files: [], aiEnabled: false }
const JOURNAL_CHANGED = 'alquimia:journal-changed'
const date = (value: string) =>
  new Date(value.length === 10 ? `${value}T12:00:00-04:00` : value).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' })
const time = (value: string) =>
  new Date(value).toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' })

type JournalProps = { patientId: string; patientName?: string; data: PatientClinical }
type LocalAttachment = PendingAttachment & { previewUrl?: string }

export function SessionJournal(props: JournalProps) {
  return <PatientJournal key={props.patientId} {...props} />
}

function PatientJournal({ patientId, patientName, data }: JournalProps) {
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
  const [pending, setPending] = useState<LocalAttachment[]>([])
  const [picking, setPicking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState<number>()
  const [recordingError, setRecordingError] = useState('')
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [aiFile, setAiFile] = useState<JournalFile>(),
    [consent, setConsent] = useState(false)
  const previewRef = useRef<HTMLDialogElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const documentInput = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const attachmentId = useRef(0)
  const objectUrls = useRef(new Map<number, string>())
  const working = useRef(false)
  const lifecycle = useRef<AbortController | null>(null)
  const reads = useRef(Promise.resolve())
  const currentJournal = useRef(empty)
  const careRevision = useRef(0)
  const loadedCareRevision = useRef(0)
  const recorder = useJournalRecorder(setRecordingError)
  const recording = recorder.phase !== 'idle'
  const current = journal.sessions.find((s) => s.id === selected),
    open = current?.status === 'open'
  const messages = journal.messages.filter((m) => m.sessionId === selected),
    files = journal.files.filter((f) => f.sessionId === selected)
  const sessionPending = pending.filter((f) => f.sessionId === selected)
  const ready = sessionPending.filter((f) => !f.validationError)
  const canStage = open && !preview && !creating && !aiFile && !picking
  const reload = useCallback(
    (prefer?: string) => {
      const signal = lifecycle.current?.signal
      // Keep older reads from overwriting a later start or finish of care.
      const next = reads.current
        .catch(() => {})
        .then(async () => {
          if (!signal || signal.aborted) return
          const revision = careRevision.current
          const response = await fetch(base, { cache: 'no-store', signal })
          const value = await response.json()
          if (!response.ok || !Array.isArray(value.sessions) || !Array.isArray(value.messages) || !Array.isArray(value.files))
            throw new Error(value.error ?? 'No pudimos cargar las sesiones.')
          if (signal.aborted) return
          currentJournal.current = value
          setJournal(value)
          setSelected((old) => prefer ?? (old || value.sessions[0]?.id || ''))
          if (revision === careRevision.current) {
            loadedCareRevision.current = revision
            setRefreshRequired(false)
          }
        })
      reads.current = next
      return next
    },
    [base],
  )
  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    const reportLoadError = (e: unknown) => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No pudimos actualizar las sesiones.')
    }
    function onJournalChanged(event: Event) {
      const target = (event as CustomEvent<{ patientId?: string }>).detail?.patientId
      if (target && target !== patientId) return
      careRevision.current++
      setRefreshRequired(true)
      setError('')
      setPicking(false)
      setAiFile(undefined)
      void reload().catch(reportLoadError)
    }
    window.addEventListener(JOURNAL_CHANGED, onJournalChanged)
    void reload()
      .catch(reportLoadError)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      window.removeEventListener(JOURNAL_CHANGED, onJournalChanged)
      controller.abort()
    }
  }, [patientId, reload])
  const onSessionClosed = useEffectEvent(() => {
    if (recorder.phase === 'requesting') recorder.cancel()
    else if (recorder.phase === 'recording') recorder.stop()
  })
  useEffect(() => {
    if (current?.status === 'closed') onSessionClosed()
  }, [current?.status])
  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])
  useEffect(() => {
    function clearDrag() {
      dragDepth.current = 0
      setDragging(false)
    }
    function guardFileDrop(e: globalThis.DragEvent) {
      if (e.dataTransfer && hasDraggedFiles(e.dataTransfer)) e.preventDefault()
      if (e.type === 'drop') clearDrag()
    }
    window.addEventListener('dragover', guardFileDrop, true)
    window.addEventListener('drop', guardFileDrop, true)
    window.addEventListener('dragend', clearDrag)
    window.addEventListener('blur', clearDrag)
    return () => {
      window.removeEventListener('dragover', guardFileDrop, true)
      window.removeEventListener('drop', guardFileDrop, true)
      window.removeEventListener('dragend', clearDrag)
      window.removeEventListener('blur', clearDrag)
    }
  }, [])
  const hasDraft = body.trim().length > 0
  const hasUnsentContent = hasDraft || pending.length > 0 || recording
  useEffect(() => {
    if (!hasUnsentContent) return
    function confirmLeave(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = true
    }
    window.addEventListener('beforeunload', confirmLeave)
    return () => window.removeEventListener('beforeunload', confirmLeave)
  }, [hasUnsentContent])
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [selected, messages.length, files.length])
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
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos completar la acción.')
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  function addFiles(newFiles: File[]) {
    const additions = newFiles.map((file) => {
      const item = stageAttachment(++attachmentId.current, file, selected, visible)
      if ((!item.validationError && file.type.startsWith('image/')) || item.category === 'audio') {
        const previewUrl = URL.createObjectURL(file)
        objectUrls.current.set(item.id, previewUrl)
        return { ...item, previewUrl }
      }
      return item
    })
    setPending((old) => [...old, ...additions])
  }

  function pickFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.currentTarget.files ?? [])
    e.currentTarget.value = ''
    if (!open || !picked.length) return
    addFiles(picked)
    setPicking(false)
  }

  function removeFile(id: number) {
    const url = objectUrls.current.get(id)
    if (url) URL.revokeObjectURL(url)
    objectUrls.current.delete(id)
    setPending((old) => old.filter((item) => item.id !== id))
  }

  function editFile(id: number, options: Partial<Pick<PendingAttachment, 'category' | 'patientVisible'>>) {
    setPending((old) => old.map((item) => (item.id === id ? { ...item, ...options } : item)))
  }

  function sessionCanSend(sessionId: string) {
    return (
      lifecycle.current?.signal.aborted === false &&
      careRevision.current === loadedCareRevision.current &&
      currentJournal.current.sessions.some((session) => session.id === sessionId && session.status === 'open')
    )
  }

  async function send(attachments: LocalAttachment[], includeNote: boolean) {
    if (!sessionCanSend(selected) || recording || (!includeNote && !attachments.length)) return
    await run(async () => {
      let saved = false
      let noteError = ''
      if (includeNote) {
        try {
          await post({ action: 'message', sessionId: selected, body, patientVisible: visible, sourceFileId })
          saved = true
          setBody('')
          setSourceFileId(undefined)
          setDraft(false)
        } catch (e) {
          noteError = e instanceof Error ? e.message : 'No se pudo guardar la nota.'
        }
      }
      for (const item of attachments) {
        if (careRevision.current !== loadedCareRevision.current) await reads.current.catch(() => {})
        if (!sessionCanSend(item.sessionId)) break
        setUploading(item.id)
        try {
          await uploadAttachment(base, item)
          removeFile(item.id)
          saved = true
        } catch (e) {
          const uploadError = e instanceof Error ? e.message : 'No se pudo subir el archivo.'
          setPending((old) => old.map((entry) => (entry.id === item.id ? { ...entry, uploadError } : entry)))
        }
      }
      setUploading(undefined)
      if (saved) {
        try {
          await reload()
        } catch {
          throw new Error([noteError, 'Lo enviado se guardó, pero no pudimos actualizar el historial.'].filter(Boolean).join(' '))
        }
      }
      if (noteError) throw new Error(noteError)
    })
  }

  function onDragEnter(e: DragEvent<HTMLDivElement>) {
    if (!canStage || !hasDraggedFiles(e.dataTransfer)) return
    e.preventDefault()
    dragDepth.current++
    setDragging(true)
  }

  function onDragLeave() {
    if (dragDepth.current > 0) dragDepth.current--
    if (!dragDepth.current) setDragging(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(e.dataTransfer)) return
    e.preventDefault()
    if (!canStage) return
    const dropped = Array.from(e.dataTransfer.files ?? [])
    if (dropped.length) addFiles(dropped)
    else setError('No se encontró ningún archivo en lo que soltaste.')
  }

  function discardNote() {
    return !hasDraft || window.confirm('Hay una nota sin guardar. ¿Quieres descartarla para cambiar de sesión?')
  }
  function choose(id: string) {
    if (id === selected || recording || working.current) return
    if (!discardNote()) return
    setBody('')
    setDraft(false)
    setSourceFileId(undefined)
    setRecordingError('')
    dragDepth.current = 0
    setDragging(false)
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
    <section className="session-journal glass overflow-clip" aria-label="Historial clínico por sesiones">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#153e32] p-4 sm:p-5">
        <div>
          <p className="text-xs text-emerald-200">Expediente del paciente</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Historial por sesiones</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || recording}
            onClick={() => discardNote() && setCreating(true)}
          >
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
                  {pending.some((f) => f.sessionId === s.id) && (
                    <span className="mt-1 block text-xs text-amber-200">Adjuntos pendientes</span>
                  )}
                </button>
              ))}
            </div>
            {!journal.sessions.length && <p className="p-3 text-sm text-muted">Aún no hay sesiones nuevas.</p>}
          </nav>
          <div
            className="journal-thread min-w-0"
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={(e) => {
              if (canStage && hasDraggedFiles(e.dataTransfer)) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                setDragging(true)
              }
            }}
            onDrop={onDrop}
          >
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
                      disabled={busy || refreshRequired || recording || hasDraft || sessionPending.length > 0}
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
                <div
                  ref={log}
                  className="journal-conversation space-y-4 p-4 sm:p-6"
                  role="log"
                  tabIndex={0}
                  aria-label="Entradas de la sesión"
                >
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
                                  disabled={busy || recording}
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
                {(open || hasDraft || sessionPending.length > 0) && (
                  <form
                    key={selected}
                    className="journal-composer"
                    data-review={draft}
                    onSubmit={(e) => {
                      e.preventDefault()
                      void send(ready, hasDraft)
                    }}
                    onPaste={(e) => {
                      if (!canStage) return
                      const pasted = clipboardFiles(e.clipboardData)
                      if (!pasted.length) return
                      e.preventDefault()
                      addFiles(pasted)
                    }}
                  >
                    {!open && hasDraft && (
                      <div>
                        <p role="status" className="mb-2 text-sm text-amber-200">
                          La sesión se cerró antes de guardar esta nota. Puedes copiar el borrador.
                        </p>
                        <label className="sr-only" htmlFor={`journal-note-${patientId}`}>
                          Nota de la sesión
                        </label>
                        <textarea id={`journal-note-${patientId}`} rows={3} className="field w-full resize-y" value={body} readOnly />
                      </div>
                    )}
                    {sessionPending.length > 0 && (
                      <ul className="journal-pending" aria-label="Adjuntos pendientes de la sesión">
                        {sessionPending.map((item) => (
                          <li key={item.id} className="journal-pending-item">
                            {item.previewUrl && item.category !== 'audio' ? (
                              <img className="journal-pending-thumbnail" src={item.previewUrl} alt="" />
                            ) : item.category === 'audio' ? (
                              <Mic size={20} aria-hidden="true" />
                            ) : (
                              <FileText size={20} aria-hidden="true" />
                            )}
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium">{item.file.name}</p>
                              <p className="text-xs text-muted">
                                {(item.file.size / 1024 / 1024).toFixed(2)} MB ·{' '}
                                {uploading === item.id
                                  ? 'Subiendo…'
                                  : !open
                                    ? 'Conservado localmente'
                                    : item.validationError || item.uploadError
                                      ? 'Pendiente de resolver'
                                      : 'Listo para enviar'}
                              </p>
                              {(item.validationError || item.uploadError) && (
                                <p role="alert" className="mt-1 text-sm text-red-200">
                                  {item.validationError || item.uploadError}
                                </p>
                              )}
                              {item.category === 'audio' ? (
                                <>
                                  <p className="mt-1 text-xs text-emerald-200">
                                    <LockKeyhole size={12} className="mr-1 inline" /> Audio interno
                                  </p>
                                  {item.previewUrl && (
                                    <audio
                                      className="journal-audio-preview"
                                      controls
                                      preload="none"
                                      src={item.previewUrl}
                                      aria-label={`Escuchar ${item.file.name}`}
                                    />
                                  )}
                                  {item.previewUrl && (item.validationError || item.uploadError || !open) && (
                                    <a className="journal-action text-xs" href={item.previewUrl} download={item.file.name}>
                                      Descargar audio
                                    </a>
                                  )}
                                </>
                              ) : (
                                !item.validationError && (
                                  <div className="journal-file-options">
                                    <select
                                      aria-label={`Tipo de adjunto: ${item.file.name}`}
                                      className="field min-h-11 max-w-full text-xs"
                                      value={item.category}
                                      disabled={busy || !open}
                                      onChange={(e) => editFile(item.id, { category: e.target.value as FileCategory })}
                                    >
                                      {Object.entries(FILE_CATEGORY_LABEL)
                                        .filter(([key]) => key !== 'audio')
                                        .map(([key, label]) => (
                                          <option key={key} value={key}>
                                            {label}
                                          </option>
                                        ))}
                                    </select>
                                    <label className="journal-visibility text-xs">
                                      <input
                                        type="checkbox"
                                        aria-label={`Incluir ${item.file.name} en vista paciente`}
                                        checked={item.patientVisible}
                                        disabled={busy || !open}
                                        onChange={(e) => editFile(item.id, { patientVisible: e.target.checked })}
                                      />
                                      {item.patientVisible ? 'Vista paciente' : 'Interno'}
                                    </label>
                                  </div>
                                )
                              )}
                              {open && item.uploadError && (
                                <button
                                  type="button"
                                  className="journal-action text-xs"
                                  aria-label={`Reintentar ${item.file.name}`}
                                  disabled={busy || refreshRequired || recording}
                                  onClick={() => void send([item], false)}
                                >
                                  <RotateCcw size={16} />
                                  Reintentar
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              className="journal-icon-button"
                              aria-label={`Quitar ${item.file.name}`}
                              title="Quitar adjunto"
                              disabled={busy}
                              onClick={() => removeFile(item.id)}
                            >
                              <X size={18} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {open && (
                      <>
                        {draft && (
                          <p role="status" className="rounded-lg bg-amber-400/10 p-2 text-xs text-amber-200">
                            Borrador generado por IA. Revisa nombres, piezas y datos antes de guardarlo. No está en el historial todavía.
                          </p>
                        )}
                        <div className="journal-write-row">
                          <button
                            type="button"
                            aria-label="Adjuntar archivo"
                            aria-haspopup="dialog"
                            title="Adjuntar archivos"
                            className="journal-icon-button"
                            disabled={busy || recording}
                            onClick={() => setPicking(true)}
                          >
                            <Paperclip size={21} />
                          </button>
                          <label className="sr-only" htmlFor={`journal-note-${patientId}`}>
                            Nota de la sesión
                          </label>
                          <textarea
                            id={`journal-note-${patientId}`}
                            rows={1}
                            maxLength={12000}
                            className="field journal-note"
                            placeholder="Escribe una nota…"
                            value={body}
                            disabled={busy}
                            enterKeyHint="enter"
                            onChange={(e) => setBody(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                                e.preventDefault()
                                e.currentTarget.form?.requestSubmit()
                              }
                            }}
                          />
                          <button
                            type="button"
                            aria-label={recording ? 'Detener grabación' : 'Grabar audio'}
                            title={recording ? 'Detener grabación' : 'Grabar audio'}
                            className="journal-icon-button"
                            disabled={busy || recorder.phase === 'requesting' || recorder.phase === 'finishing'}
                            onClick={() => (recording ? recorder.stop() : void recorder.start((file) => addFiles([file])))}
                          >
                            {recording ? <Square size={18} /> : <Mic size={21} />}
                          </button>
                          <button
                            type="submit"
                            className="journal-send"
                            title="Enviar (Ctrl o ⌘ + Enter)"
                            aria-keyshortcuts="Control+Enter Meta+Enter"
                            disabled={busy || refreshRequired || recording || (!hasDraft && !ready.length)}
                          >
                            <Send size={17} />
                            <span>
                              {busy
                                ? 'Enviando…'
                                : draft
                                  ? 'Confirmar y guardar'
                                  : hasDraft && ready.length
                                    ? 'Guardar nota y adjuntos'
                                    : hasDraft
                                      ? 'Guardar nota'
                                      : 'Enviar adjuntos'}
                            </span>
                          </button>
                        </div>
                        {recording && (
                          <div className="journal-recording">
                            <p role="status" className="text-sm">
                              {recorder.phase === 'requesting'
                                ? 'Esperando permiso del micrófono…'
                                : recorder.phase === 'finishing'
                                  ? 'Preparando el audio…'
                                  : 'Grabando audio interno… hasta 1 minuto.'}
                            </p>
                            <button type="button" className="journal-action text-xs" onClick={recorder.cancel}>
                              Cancelar grabación
                            </button>
                          </div>
                        )}
                        {recordingError && (
                          <p role="alert" className="text-sm text-red-200">
                            {recordingError}
                          </p>
                        )}
                        {refreshRequired && (
                          <p role="status" className="text-xs text-muted">
                            {error ? 'Actualiza las sesiones para confirmar que puedes enviar.' : 'Comprobando el estado de la sesión…'}
                          </p>
                        )}
                        <div className="journal-composer-options">
                          <label className="journal-visibility text-xs">
                            <input type="checkbox" checked={visible} disabled={busy} onChange={(e) => setVisible(e.target.checked)} />
                            Incluir la nota en vista paciente
                          </label>
                          <p className="text-xs text-muted">
                            Hasta 3 MB por archivo<span className="journal-desktop-hint"> · Arrastra archivos o pega fotos</span>
                          </p>
                        </div>
                        {!journal.aiEnabled && (
                          <p className="text-xs text-muted">
                            Transcripción y lectura de PDF pendientes de configurar OpenAI. Puedes guardar notas y adjuntos.
                          </p>
                        )}
                      </>
                    )}
                  </form>
                )}
                {!open && (
                  <p className="border-t border-white/10 p-4 text-sm text-muted">
                    Sesión cerrada. Crea otra sesión para continuar el historial.
                  </p>
                )}
                {dragging && canStage && (
                  <div className="journal-drop-overlay">
                    <div className="journal-drop-prompt" role="status">
                      <Paperclip size={24} aria-hidden="true" />
                      Suelta los archivos para adjuntarlos a esta sesión
                      <span className="text-xs">Hasta 3 MB por archivo</span>
                    </div>
                  </div>
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
      {picking && open && (
        <Modal open={picking} onClose={() => setPicking(false)} title="Adjuntar archivos">
          <div className="journal-picker">
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={pickFiles} />
            <input ref={galleryInput} type="file" accept={PHOTO_ACCEPT} multiple hidden onChange={pickFiles} />
            <input ref={documentInput} type="file" accept={DOCUMENT_ACCEPT} multiple hidden onChange={pickFiles} />
            <button type="button" className="journal-picker-option" onClick={() => cameraInput.current?.click()}>
              <Camera size={21} />
              Tomar foto
            </button>
            <button type="button" className="journal-picker-option" onClick={() => galleryInput.current?.click()}>
              <ImageIcon size={21} aria-hidden="true" />
              Fotos de la galería
            </button>
            <button type="button" className="journal-picker-option" onClick={() => documentInput.current?.click()}>
              <FileText size={21} />
              Documentos y audio
            </button>
            <p className="text-xs text-muted">Hasta 3 MB por archivo · JPG, PNG, WEBP, PDF y audio compatible</p>
          </div>
        </Modal>
      )}
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
                setSourceFileId(undefined)
                setRecordingError('')
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
                disabled={!consent || busy || refreshRequired || !open || hasDraft}
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
