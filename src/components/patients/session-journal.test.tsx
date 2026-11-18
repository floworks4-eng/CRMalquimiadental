// @vitest-environment jsdom
import { afterEach, beforeEach, beforeAll, it, expect, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SessionJournal } from './session-journal'
import type { PatientClinical } from '@/server/queries/clinical'
import type { JournalData } from '@/lib/domain/journal'
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
const data = { history: [], notes: [], anamnesisVersions: [] } as unknown as PatientClinical
const sid = '11111111-1111-4111-8111-111111111111',
  fileId = '22222222-2222-4222-8222-222222222222',
  secondSession = '33333333-3333-4333-8333-333333333333'
let journal: JournalData
const createObjectURL = vi.fn()
const revokeObjectURL = vi.fn()
beforeEach(() => {
  journal = {
    sessions: [
      { id: sid, title: 'Evaluación', sessionDate: '2026-11-16', status: 'open', encounterId: null, createdAt: '2026-11-16T12:00:00Z' },
    ],
    messages: [
      {
        id: 'public',
        sessionId: sid,
        body: 'Evolución publicada',
        patientVisible: true,
        createdAt: '2026-11-16T12:00:00Z',
        author: 'Dra. Pérez',
      },
      {
        id: 'private',
        sessionId: sid,
        body: 'Nota interna que no se exporta',
        patientVisible: false,
        createdAt: '2026-11-16T12:01:00Z',
        author: 'Dra. Pérez',
      },
    ],
    files: [],
    aiEnabled: true,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) =>
      Response.json(options?.method === 'POST' ? { text: 'Texto transcrito para revisar', draft: true } : journal),
    ),
  )
  createObjectURL.mockReset().mockImplementation((file: File) => `blob:${file.name}`)
  revokeObjectURL.mockReset()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const file = (name: string, type: string) => new File(['test'], name, { type })
const fileDrag = (...files: File[]) => ({ types: ['Files'], files })
const composer = () => screen.getByRole('textbox', { name: 'Nota de la sesión' })
const pending = () => screen.getByRole('list', { name: 'Adjuntos pendientes de la sesión' })
const journalChanged = (patientId?: string) =>
  fireEvent(
    window,
    patientId ? new CustomEvent('alquimia:journal-changed', { detail: { patientId } }) : new Event('alquimia:journal-changed'),
  )
const uploads = () =>
  vi.mocked(fetch).mock.calls.flatMap(([url, init]) => (init?.body instanceof FormData ? [{ url, form: init.body }] : []))

function mockUploads(respond: (form: FormData) => Response | Promise<Response>, refresh = () => Response.json(journal)) {
  vi.mocked(fetch).mockImplementation(async (_url, init) => (init?.body instanceof FormData ? respond(init.body) : refresh()))
}

class TestRecorder {
  static isTypeSupported() {
    return true
  }

  state = 'inactive'
  mimeType = 'audio/webm;codecs=opus'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    const chunk = new Blob(['recorded audio'], { type: this.mimeType })
    this.ondataavailable?.({ data: chunk })
    this.onstop?.()
  }
}

function mockMicrophone(getUserMedia: () => Promise<MediaStream>) {
  const browser = window.navigator
  vi.stubGlobal('MediaRecorder', TestRecorder)
  vi.stubGlobal(
    'navigator',
    new Proxy(browser, {
      get(target, property) {
        return property === 'mediaDevices' ? { getUserMedia } : Reflect.get(target, property, target)
      },
    }),
  )
}

it('la vista del paciente excluye notas internas, audios y archivos que siguen pendientes', async () => {
  const internalImage = {
    id: fileId,
    sessionId: sid,
    name: 'interna.png',
    category: 'image' as const,
    mime: 'image/png',
    sizeBytes: 120,
    url: null,
    createdAt: '2026-11-16T12:00:00Z',
    patientVisible: false,
  }
  journal.files = [
    internalImage,
    { ...internalImage, id: 'published-image', name: 'publicada.png', patientVisible: true },
    { ...internalImage, id: 'old-audio', name: 'audio.webm', category: 'audio', mime: 'audio/webm', patientVisible: true },
  ]
  render(<SessionJournal patientId="patient" data={data} />)
  fireEvent.drop(await screen.findByRole('log'), { dataTransfer: fileDrag(file('sin-enviar.png', 'image/png')) })
  fireEvent.click(screen.getByRole('button', { name: 'Vista paciente' }))
  const preview = screen.getByRole('dialog', { name: 'Vista limpia del paciente' })
  expect(within(preview).getByText('Evolución publicada')).toBeTruthy()
  expect(within(preview).getByText(/publicada\.png/)).toBeTruthy()
  expect(within(preview).queryByText('Nota interna que no se exporta')).toBeNull()
  expect(within(preview).queryByText(/interna\.png|audio\.webm|sin-enviar\.png/)).toBeNull()
  fireEvent.click(within(preview).getByRole('button', { name: 'Cerrar vista' }))
  expect(document.body.style.overflow).not.toBe('hidden')
})
it('una transcripción necesita autorización y permanece como borrador hasta confirmar su guardado', async () => {
  journal.files = [
    {
      id: fileId,
      sessionId: sid,
      name: 'audio.webm',
      category: 'audio',
      mime: 'audio/webm',
      sizeBytes: 120,
      url: null,
      createdAt: '2026-11-16T12:00:00Z',
      patientVisible: false,
    },
  ]
  render(<SessionJournal patientId="patient" data={data} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Transcribir audio' }))
  const dialog = screen.getByRole('dialog', { name: 'Procesar con IA' })
  const button = within(dialog).getByRole('button', { name: 'Procesar archivo' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  fireEvent.click(within(dialog).getByRole('checkbox'))
  fireEvent.click(button)
  await screen.findByText(/Borrador generado por IA/)
  expect((screen.getByRole('textbox', { name: 'Nota de la sesión' }) as HTMLTextAreaElement).value).toBe('Texto transcrito para revisar')
  expect(screen.getByRole('log').textContent).not.toContain('Texto transcrito para revisar')
  expect(
    vi.mocked(fetch).mock.calls.filter(([, options]) => options?.body && String(options.body).includes('"action":"message"')),
  ).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
  await waitFor(() =>
    expect(vi.mocked(fetch).mock.calls.some(([, options]) => String(options?.body).includes(`"sourceFileId":"${fileId}"`))).toBe(true),
  )
})
it('una sesión cerrada impide escribir y adjuntar', async () => {
  journal.sessions[0].status = 'closed'
  render(<SessionJournal patientId="patient" data={data} />)
  await screen.findByText(/Registro cerrado/)
  expect(screen.queryByRole('textbox', { name: 'Nota de la sesión' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Adjuntar archivo' })).toBeNull()
})

it('muestra una sesión creada desde la atención sin remontar el historial', async () => {
  const sessions = journal.sessions
  journal = { ...journal, sessions: [], messages: [] }
  render(<SessionJournal patientId="patient" data={data} />)
  await screen.findByRole('button', { name: 'Crear primera sesión' })
  journal.sessions = sessions
  const reads = vi.mocked(fetch).mock.calls.length
  journalChanged('otro-paciente')
  expect(vi.mocked(fetch).mock.calls).toHaveLength(reads)
  journalChanged('patient')
  await screen.findByRole('heading', { name: 'Evaluación' })
  expect(screen.getByRole('button', { name: /Evaluación/ }).getAttribute('aria-pressed')).toBe('true')
})

it('conserva la sesión, el borrador y los adjuntos cuando la atención abre otra sesión o cierra la actual', async () => {
  render(<SessionJournal patientId="patient" data={data} />)
  fireEvent.drop(await screen.findByRole('log'), { dataTransfer: fileDrag(file('pendiente.png', 'image/png')) })
  fireEvent.change(composer(), { target: { value: 'Nota para conservar' } })
  journal.sessions.unshift({ ...journal.sessions[0], id: secondSession, title: 'Sesión enlazada' })
  journalChanged()
  await screen.findByRole('button', { name: /Sesión enlazada/ })
  expect(screen.getByRole('button', { name: /Evaluación/ }).getAttribute('aria-pressed')).toBe('true')
  expect((composer() as HTMLTextAreaElement).value).toBe('Nota para conservar')
  expect(within(pending()).getByText('pendiente.png')).toBeTruthy()

  journal.sessions[1].status = 'closed'
  journalChanged('patient')
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Guardar nota y adjuntos' }).disabled).toBe(true)
  await screen.findByText(/Registro cerrado/)
  const note = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Nota de la sesión' })
  expect(note.value).toBe('Nota para conservar')
  expect(note.readOnly).toBe(true)
  expect(within(pending()).getByText('pendiente.png')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Evaluación/ }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('button', { name: /Guardar nota|Enviar adjuntos/ })).toBeNull()
  fireEvent.submit(note.form!)
  expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
})

it('deja los archivos restantes en la cola si se cierra la sesión durante un envío', async () => {
  let finish!: (response: Response) => void
  mockUploads(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  render(<SessionJournal patientId="patient" data={data} />)
  fireEvent.drop(await screen.findByRole('log'), {
    dataTransfer: fileDrag(file('en-curso.pdf', 'application/pdf'), file('pendiente.pdf', 'application/pdf')),
  })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar adjuntos' }))
  expect(uploads()).toHaveLength(1)
  journal.sessions[0].status = 'closed'
  journalChanged()
  await screen.findByText(/Registro cerrado/)
  await act(async () => finish(Response.json({ file: { id: fileId } }, { status: 201 })))
  expect(uploads()).toHaveLength(1)
  expect(within(pending()).queryByText('en-curso.pdf')).toBeNull()
  expect(within(pending()).getByText('pendiente.pdf')).toBeTruthy()
})

it('solo muestra el área de arrastre con archivos y evita que abrirlos saque del historial', async () => {
  render(<SessionJournal patientId="patient" data={data} />)
  const log = await screen.findByRole('log')
  const message = within(log).getByText('Evolución publicada')
  const text = { types: ['text/plain'], files: [] }
  const textDrop = createEvent.drop(composer(), { dataTransfer: text })
  fireEvent.dragEnter(log, { dataTransfer: text })
  fireEvent(composer(), textDrop)
  expect(textDrop.defaultPrevented).toBe(false)
  expect(screen.queryByText(/Suelta los archivos/)).toBeNull()

  const transfer = fileDrag(file('boca.png', 'image/png'), file('consentimiento.pdf', 'application/pdf'))
  fireEvent.dragEnter(log, { dataTransfer: transfer })
  fireEvent.dragEnter(message, { dataTransfer: transfer })
  fireEvent.dragLeave(log, { dataTransfer: transfer })
  expect(screen.getByText(/Suelta los archivos/)).toBeTruthy()
  fireEvent.dragLeave(message, { dataTransfer: transfer })
  expect(screen.queryByText(/Suelta los archivos/)).toBeNull()

  fireEvent.dragOver(log, { dataTransfer: transfer })
  const outsideDrop = createEvent.drop(document.body, { dataTransfer: transfer })
  fireEvent(document.body, outsideDrop)
  expect(outsideDrop.defaultPrevented).toBe(true)
  expect(screen.queryByText(/Suelta los archivos/)).toBeNull()
  expect(screen.queryByText('boca.png')).toBeNull()

  fireEvent.drop(log, { dataTransfer: transfer })
  expect(within(pending()).getAllByRole('listitem')).toHaveLength(2)
  expect(pending().querySelector('img')?.getAttribute('src')).toBe('blob:boca.png')
  expect(uploads()).toHaveLength(0)
  fireEvent.click(within(pending()).getByRole('button', { name: 'Quitar boca.png' }))
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:boca.png')
  expect(within(pending()).getAllByRole('listitem')).toHaveLength(1)
})

it('admite pegar varias fotos y conserva el pegado de texto y Enter para escribir', async () => {
  mockUploads(() => Response.json({ file: { id: fileId } }, { status: 201 }))
  render(<SessionJournal patientId="patient" data={data} />)
  await screen.findByRole('textbox', { name: 'Nota de la sesión' })
  const textPaste = createEvent.paste(composer(), { clipboardData: { files: [], items: [{ kind: 'string' }] } })
  fireEvent(composer(), textPaste)
  expect(textPaste.defaultPrevented).toBe(false)

  const photos = [file('foto 1.jpg', 'image/jpeg'), file('foto 2.webp', 'image/webp')]
  const imagePaste = createEvent.paste(composer(), {
    clipboardData: { files: [], items: photos.map((photo) => ({ kind: 'file', getAsFile: () => photo })) },
  })
  fireEvent(composer(), imagePaste)
  expect(imagePaste.defaultPrevented).toBe(true)
  expect(within(pending()).getAllByRole('listitem')).toHaveLength(2)
  expect((composer() as HTMLTextAreaElement).value).toBe('')
  fireEvent.keyDown(composer(), { key: 'Enter' })
  expect(uploads()).toHaveLength(0)
  fireEvent.keyDown(composer(), { key: 'Enter', ctrlKey: true })
  await waitFor(() => expect(uploads()).toHaveLength(2))
  await waitFor(() => expect(screen.queryByRole('list', { name: /Adjuntos pendientes/ })).toBeNull())
  expect(uploads().map(({ form }) => (form.get('file') as File).name)).toEqual(photos.map((photo) => photo.name))
})

it('ofrece captura individual y selectores múltiples separados para galería y documentos', async () => {
  render(<SessionJournal patientId="patient" data={data} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Adjuntar archivo' }))
  const picker = screen.getByRole('dialog', { name: 'Adjuntar archivos' })
  const [camera, gallery, documents] = picker.querySelectorAll<HTMLInputElement>('input[type=file]')
  expect(camera.getAttribute('capture')).toBe('environment')
  expect(camera.accept).toBe('image/*')
  expect(camera.multiple).toBe(false)
  expect(gallery.multiple).toBe(true)
  expect(gallery.accept).toContain('image/jpeg')
  expect(documents.multiple).toBe(true)
  expect(documents.accept).toContain('application/pdf')
  const openPicker = vi.spyOn(documents, 'click')
  fireEvent.click(within(picker).getByRole('button', { name: 'Documentos y audio' }))
  expect(openPicker).toHaveBeenCalledOnce()
  fireEvent.change(documents, { target: { files: [file('contrato.pdf', 'application/pdf'), file('indicaciones.pdf', 'application/pdf')] } })
  expect(screen.queryByRole('dialog', { name: 'Adjuntar archivos' })).toBeNull()
  expect(within(pending()).getAllByRole('listitem')).toHaveLength(2)
})

it('explica qué archivos superan 3 MB y permite enviar los que sí cumplen el límite', async () => {
  mockUploads(() => Response.json({ file: { id: fileId } }, { status: 201 }))
  render(<SessionJournal patientId="patient" data={data} />)
  const log = await screen.findByRole('log')
  const exact = new File([new Uint8Array(3 * 1024 * 1024)], 'justo.pdf', { type: 'application/pdf' })
  const large = new File([new Uint8Array(exact.size + 1)], 'grande.pdf', { type: 'application/pdf' })
  fireEvent.drop(log, { dataTransfer: fileDrag(exact, large, file('foto.heic', 'image/heic')) })
  expect(within(pending()).getByText('Supera los 3 MB por archivo.')).toBeTruthy()
  expect(within(pending()).getByText(/Formato incompatible/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Enviar adjuntos' }))
  await waitFor(() => expect(within(pending()).queryByText('justo.pdf')).toBeNull())
  expect(uploads()).toHaveLength(1)
  expect((uploads()[0].form.get('file') as File).size).toBe(exact.size)
  expect(within(pending()).getAllByRole('listitem')).toHaveLength(2)
})

it('mantiene un fallo parcial en su sesión y reintenta solo ese archivo con su privacidad y categoría', async () => {
  journal.sessions.push({ ...journal.sessions[0], id: secondSession, title: 'Control' })
  mockUploads((form) =>
    (form.get('file') as File).name === 'radiografía.png'
      ? Response.json({ error: 'El servidor no pudo guardar esta imagen.' }, { status: 500 })
      : Response.json({ file: { id: fileId } }, { status: 201 }),
  )
  render(<SessionJournal patientId="patient" data={data} />)
  const log = await screen.findByRole('log')
  fireEvent.drop(log, { dataTransfer: fileDrag(file('radiografía.png', 'image/png'), file('otro.pdf', 'application/pdf')) })
  fireEvent.change(within(pending()).getByRole('combobox', { name: 'Tipo de adjunto: radiografía.png' }), {
    target: { value: 'radiograph' },
  })
  fireEvent.click(within(pending()).getByRole('checkbox', { name: 'Incluir radiografía.png en vista paciente' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enviar adjuntos' }))
  await waitFor(() => expect(within(pending()).getAllByRole('listitem')).toHaveLength(1))
  expect(within(pending()).getByRole('alert').textContent).toContain('El servidor no pudo guardar esta imagen.')
  fireEvent.click(screen.getByRole('button', { name: 'Vista paciente' }))
  const preview = screen.getByRole('dialog', { name: 'Vista limpia del paciente' })
  expect(within(preview).queryByText(/radiografía.png/)).toBeNull()
  fireEvent.click(within(preview).getByRole('button', { name: 'Cerrar vista' }))

  fireEvent.click(screen.getByRole('button', { name: /Control/ }))
  expect(screen.queryByRole('list', { name: /Adjuntos pendientes/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Evaluación/ }))
  expect(within(pending()).getByText('radiografía.png')).toBeTruthy()
  mockUploads(() => Response.json({ file: { id: fileId } }, { status: 201 }))
  fireEvent.click(within(pending()).getByRole('button', { name: 'Reintentar radiografía.png' }))
  await waitFor(() => expect(screen.queryByRole('list', { name: /Adjuntos pendientes/ })).toBeNull())
  expect(uploads()).toHaveLength(3)
  const { url, form } = uploads()[2]
  expect(url).toBe('/api/patients/patient/journal/files')
  expect((form.get('file') as File).name).toBe('radiografía.png')
  expect(form.get('sessionId')).toBe(sid)
  expect(form.get('category')).toBe('radiograph')
  expect(form.get('patientVisible')).toBe('false')
})

it('una actualización fallida del historial no vuelve a crear adjuntos ya guardados', async () => {
  render(<SessionJournal patientId="patient" data={data} />)
  const log = await screen.findByRole('log')
  mockUploads(
    () => Response.json({ file: { id: fileId } }, { status: 201 }),
    () => Response.json({ error: 'No disponible' }, { status: 503 }),
  )
  fireEvent.drop(log, { dataTransfer: fileDrag(file('indicaciones.pdf', 'application/pdf')) })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar adjuntos' }))
  await screen.findByText(/Lo enviado se guardó/)
  expect(screen.queryByRole('list', { name: /Adjuntos pendientes/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar sesiones' }))
  await screen.findByText(/No disponible/)
  expect(uploads()).toHaveLength(1)
})

it('fija la sesión de destino mientras el servidor recibe el archivo', async () => {
  journal.sessions.push({ ...journal.sessions[0], id: secondSession, title: 'Control' })
  let finish!: (response: Response) => void
  mockUploads(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  render(<SessionJournal patientId="patient" data={data} />)
  fireEvent.drop(await screen.findByRole('log'), { dataTransfer: fileDrag(file('radiografía.png', 'image/png')) })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar adjuntos' }))
  const next = screen.getByRole<HTMLButtonElement>('button', { name: /Control/ })
  expect(next.disabled).toBe(true)
  fireEvent.click(next)
  expect(screen.getByRole('button', { name: /Evaluación/ }).getAttribute('aria-pressed')).toBe('true')
  expect(uploads()[0].form.get('sessionId')).toBe(sid)
  await act(async () => finish(Response.json({ file: { id: fileId } }, { status: 201 })))
  fireEvent.click(next)
  expect(next.getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('list', { name: /Adjuntos pendientes/ })).toBeNull()
})

it('permite cancelar el permiso pendiente y libera el micrófono al navegar a otro paciente', async () => {
  const stop = vi.fn()
  const media = { getTracks: () => [{ stop }] } as unknown as MediaStream
  let grantPermission!: (stream: MediaStream) => void
  const getUserMedia = vi
    .fn<() => Promise<MediaStream>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          grantPermission = resolve
        }),
    )
    .mockResolvedValueOnce(media)
  mockMicrophone(getUserMedia)
  const view = render(<SessionJournal patientId="first" data={data} />)
  fireEvent.drop(await screen.findByRole('log'), { dataTransfer: fileDrag(file('primer-paciente.png', 'image/png')) })
  fireEvent.click(await screen.findByRole('button', { name: 'Grabar audio' }))
  await screen.findByText(/Esperando permiso/)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar grabación' }))
  await act(async () => grantPermission(media))
  expect(stop).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Grabar audio' }))
  await screen.findByText(/Grabando audio interno/)
  view.rerender(<SessionJournal patientId="second" data={data} />)
  await screen.findByRole('button', { name: 'Grabar audio' })
  expect(stop).toHaveBeenCalledTimes(2)
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:primer-paciente.png')
  expect(screen.queryByText('primer-paciente.png')).toBeNull()
  expect(screen.queryByText(/Nota de voz/)).toBeNull()
  expect(uploads()).toHaveLength(0)
})

it('la nota de voz requiere envío explícito y se puede escuchar, descargar o reintentar si falla', async () => {
  const stop = vi.fn()
  mockMicrophone(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream)
  mockUploads(() => Response.json({ error: 'Audio no disponible temporalmente.' }, { status: 503 }))
  render(<SessionJournal patientId="patient" data={data} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Grabar audio' }))
  await screen.findByText(/Grabando audio interno/)
  fireEvent.click(screen.getByRole('button', { name: 'Detener grabación' }))
  expect(stop).toHaveBeenCalledOnce()
  expect(within(pending()).getByText('Audio interno')).toBeTruthy()
  expect(pending().querySelector('audio')?.getAttribute('src')).toContain('blob:Nota de voz')
  expect(uploads()).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Enviar adjuntos' }))
  await screen.findByText('Audio no disponible temporalmente.')
  expect(within(pending()).getByRole('link', { name: 'Descargar audio' }).getAttribute('download')).toMatch(/\.webm$/)
  expect(uploads()[0].form.get('patientVisible')).toBe('false')
  expect(uploads()[0].form.get('category')).toBe('audio')
  mockUploads(() => Response.json({ file: { id: fileId } }, { status: 201 }))
  fireEvent.click(within(pending()).getByRole('button', { name: /Reintentar Nota de voz/ }))
  await waitFor(() => expect(screen.queryByRole('list', { name: /Adjuntos pendientes/ })).toBeNull())
  expect(uploads()).toHaveLength(2)
})
