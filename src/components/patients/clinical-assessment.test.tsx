// @vitest-environment jsdom
import { afterEach, beforeAll, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalAssessmentForm } from './clinical-assessment'
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('guarda una revisión explícita conservando la privacidad elegida y muestra un rechazo sin perder lo escrito', async () => {
  const request = vi.fn(async (_url, options) =>
    options?.method === 'POST'
      ? Response.json({ error: 'La sesión ha caducado.' }, { status: 401 })
      : Response.json({
          assessment: {
            id: 'v1',
            author: 'Dra. Pérez',
            createdAt: '2026-11-18',
            patientVisible: false,
            fields: { chiefComplaint: 'Dolor referido' },
          },
        }),
  )
  vi.stubGlobal('fetch', request)
  render(<ClinicalAssessmentForm patientId="patient" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Revisar ficha clínica' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Evaluación clínica' }))
  const field = dialog.getByRole<HTMLTextAreaElement>('textbox', { name: 'Motivo de consulta' })
  expect(field.value).toBe('Dolor referido')
  fireEvent.change(field, { target: { value: 'Dolor referido, actualizado tras interrogar al paciente' } })
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar evaluación revisada' }))
  expect((await dialog.findByRole('alert')).textContent).toContain('La sesión ha caducado.')
  expect(field.value).toContain('actualizado')
  const saved = request.mock.calls.find(([, options]) => options?.method === 'POST')?.[1]
  expect(JSON.parse(String(saved?.body))).toEqual({ fields: { chiefComplaint: field.value }, patientVisible: false })
})
