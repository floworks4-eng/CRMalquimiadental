import { useEffect, useRef, useState } from 'react'
import type { FileCategory } from '@/lib/domain/journal'

const MAX_BYTES = 3 * 1024 * 1024
const IMAGES = ['image/jpeg', 'image/png', 'image/webp']
const DOCUMENTS_AND_AUDIO = ['application/pdf', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']
export const PHOTO_ACCEPT = IMAGES.join(',')
export const DOCUMENT_ACCEPT = DOCUMENTS_AND_AUDIO.join(',')

export type PendingAttachment = {
  id: number
  file: File
  sessionId: string
  category: FileCategory
  patientVisible: boolean
  validationError?: string
  uploadError?: string
}

export function stageAttachment(id: number, file: File, sessionId: string, visible: boolean): PendingAttachment {
  const audio = file.type.startsWith('audio/')
  let validationError: string | undefined
  if (file.size > MAX_BYTES) validationError = 'Supera los 3 MB por archivo.'
  else if (!file.size) validationError = 'El archivo está vacío.'
  else if (!IMAGES.includes(file.type) && !DOCUMENTS_AND_AUDIO.includes(file.type))
    validationError = 'Formato incompatible. Usa JPG, PNG, WEBP, PDF o un audio compatible.'
  return {
    id,
    file,
    sessionId,
    category: audio ? 'audio' : file.type.startsWith('image/') ? 'image' : 'document',
    patientVisible: !audio && visible,
    validationError,
  }
}

export function hasDraggedFiles(data: DataTransfer) {
  return Array.from(data.types ?? []).includes('Files') || data.files?.length > 0
}

export function clipboardFiles(data: DataTransfer) {
  if (data.files?.length) return Array.from(data.files)
  return Array.from(data.items ?? []).flatMap((item) => {
    const file = item.kind === 'file' ? item.getAsFile() : null
    return file ? [file] : []
  })
}

export async function uploadAttachment(base: string, attachment: PendingAttachment) {
  const form = new FormData()
  form.set('file', attachment.file)
  form.set('sessionId', attachment.sessionId)
  form.set('category', attachment.category)
  form.set('patientVisible', String(attachment.patientVisible))
  const response = await fetch(`${base}/files`, { method: 'POST', body: form }).catch(() => {
    throw new Error('Se interrumpió la conexión al enviar el archivo. Revisa tu conexión e intenta de nuevo.')
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    throw new Error(result?.error ?? 'No se pudo subir el archivo.')
  }
}

type Recording = {
  media?: MediaStream
  recorder?: MediaRecorder
  timer?: ReturnType<typeof setTimeout>
}

function releaseRecording(recording: Recording) {
  clearTimeout(recording.timer)
  const recorder = recording.recorder
  if (recorder) {
    recorder.onstop = null
    recorder.ondataavailable = null
    recorder.onerror = null
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // Some browsers stop the recorder themselves when the input disconnects.
      }
    }
  }
  recording.media?.getTracks().forEach((track) => track.stop())
}

export function useJournalRecorder(onError: (message: string) => void) {
  const active = useRef<Recording | null>(null)
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'finishing'>('idle')

  useEffect(() => {
    function release() {
      const recording = active.current
      active.current = null
      if (recording) releaseRecording(recording)
    }
    function onPageHide() {
      release()
      setPhase('idle')
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      release()
    }
  }, [])

  async function start(onFile: (file: File) => void) {
    if (active.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Este navegador no permite grabar. Puedes adjuntar un audio o usar el dictado del teclado.')
      return
    }
    const capture: Recording = {}
    active.current = capture
    setPhase('requesting')
    onError('')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      capture.media = media
      if (active.current !== capture) {
        releaseRecording(capture)
        return
      }
      const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(media, { ...(mime && { mimeType: mime }), audioBitsPerSecond: 64000 })
      capture.recorder = recorder
      const chunks: Blob[] = []
      let bytes = 0
      recorder.ondataavailable = (e) => {
        if (!e.data.size) return
        chunks.push(e.data)
        bytes += e.data.size
        if (bytes >= MAX_BYTES - 128 * 1024) stop()
      }
      recorder.onerror = () => {
        onError('La grabación se interrumpió. Revisa si el audio quedó disponible en los adjuntos.')
      }
      recorder.onstop = () => {
        if (active.current !== capture) return
        active.current = null
        releaseRecording(capture)
        setPhase('idle')
        if (!chunks.length) {
          onError('No se capturó audio. Revisa el micrófono e intenta de nuevo.')
          return
        }
        const type = (recorder.mimeType || chunks[0].type).split(';')[0]
        const extension = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm'
        onFile(new File(chunks, `Nota de voz-${Date.now()}.${extension}`, { type }))
      }
      recorder.start(1000)
      setPhase('recording')
      capture.timer = setTimeout(stop, 60_000)
    } catch {
      if (active.current !== capture) return
      active.current = null
      releaseRecording(capture)
      setPhase('idle')
      onError('No pudimos iniciar la grabación. Revisa el micrófono y los permisos del navegador.')
    }
  }

  function stop() {
    const capture = active.current
    const recorder = capture?.recorder
    if (!recorder || recorder.state === 'inactive') return
    clearTimeout(capture.timer)
    setPhase('finishing')
    recorder.stop()
  }

  function cancel() {
    const capture = active.current
    if (!capture) return
    active.current = null
    releaseRecording(capture)
    setPhase('idle')
  }

  return { phase, start, stop, cancel }
}
