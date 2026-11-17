import { it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildJournalPdf } from './journal-pdf'
it('genera un documento clínico e incorpora todas las páginas de la radiografía PDF original', async () => {
  const original = await PDFDocument.create()
  original.addPage()
  original.addPage()
  const output = await buildJournalPdf('Paciente sintético', [
    {
      id: 's',
      title: 'Sesión de control',
      date: '2026-11-16',
      notes: [{ body: 'Evolución revisada. Próxima sesión de control.', author: 'Dra. Pérez', date: '16/11/2026' }],
      files: [{ name: 'Radiografía.pdf', mime: 'application/pdf', bytes: await original.save() }],
    },
  ])
  const exported = await PDFDocument.load(output)
  expect(exported.getPageCount()).toBeGreaterThanOrEqual(3)
  expect(exported.getTitle()).toBe('Historia clínica - Paciente sintético')
})
it('conserva un documento exportable con aviso si un PDF adjunto está dañado o protegido', async () => {
  const output = await buildJournalPdf('Paciente', [
    {
      id: 's',
      title: 'Control',
      date: '2026-11-16',
      notes: [],
      files: [{ name: 'protegido.pdf', mime: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) }],
    },
  ])
  expect((await PDFDocument.load(output)).getPageCount()).toBeGreaterThan(0)
})
