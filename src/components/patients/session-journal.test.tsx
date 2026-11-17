// @vitest-environment jsdom
import { afterEach, beforeEach, beforeAll, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  fileId = '22222222-2222-4222-8222-222222222222'
let journal: JournalData
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
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('la vista del paciente reúne la sesión y excluye notas internas', async () => {
  render(<SessionJournal patientId="patient" data={data} />)
  await screen.findByText('Evolución publicada')
  fireEvent.click(screen.getByRole('button', { name: 'Vista paciente' }))
  const preview = screen.getByRole('dialog', { name: 'Vista limpia del paciente' })
  expect(within(preview).getByText('Evolución publicada')).toBeTruthy()
  expect(within(preview).queryByText('Nota interna que no se exporta')).toBeNull()
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
