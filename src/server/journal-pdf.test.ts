import { writeFileSync, mkdirSync } from 'node:fs'
import { it, expect } from 'vitest'
import { PDFDocument, PDFRawStream, PDFName } from 'pdf-lib'
import sharp from 'sharp'
import { buildJournalPdf } from './journal-pdf'
it('representa fotos WEBP y conserva su archivo original en vez de omitirlas de la copia', async () => {
  const webp = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#aacccc' } })
    .webp()
    .toBuffer()
  const bytes = await buildJournalPdf('Paciente sintético', [
    {
      id: 's',
      title: 'Fotos de evaluación',
      date: '2026-11-18',
      notes: [],
      files: [{ name: 'foto.webp', mime: 'image/webp', bytes: webp }],
    },
  ])
  const pdf = await PDFDocument.load(bytes)
  const streams = pdf.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object) => object instanceof PDFRawStream)
  expect(streams.some((object) => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image')).toBe(
    true,
  )
  expect(
    streams.some((object) => object instanceof PDFRawStream && object.dict.get(PDFName.of('Type'))?.toString() === '/EmbeddedFile'),
  ).toBe(true)
})
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

it('produce un informe estructurado y paginado con campos largos sin inventar datos faltantes', async () => {
  const bytes = await buildJournalPdf(
    'Paciente de ejemplo',
    [
      {
        id: 'demo',
        title: 'Evaluación inicial',
        date: '18/11/2026',
        notes: [
          {
            author: 'Dra. de ejemplo',
            date: '18/11/2026',
            body: 'Se revisaron los documentos aportados y se explicaron los próximos pasos de evaluación.',
          },
        ],
        files: [],
      },
    ],
    {
      clinic: { name: 'Alquimia Dental', address: 'La Paz, Bolivia' },
      patient: { id: 'HC-DEMO-001', birthDate: '1990-06-12', phone: 'Dato de demostración' },
      anamnesis: {
        recordedAt: '2026-11-18',
        source: 'staff',
        reason: 'Consulta de evaluación',
        allergies: [],
        conditions: [],
        pregnancy: null,
        anticoagulants: null,
      },
      assessment: {
        createdAt: '2026-11-18',
        author: 'Dra. de ejemplo',
        fields: {
          chiefComplaint: 'Molestia referida por el paciente.',
          presentIllness: 'Inicio y características del síntoma consignados durante el interrogatorio.',
          extraoralExam: 'Pendiente de completar y documentar por el profesional.',
          diagnosis: 'Pendiente de valoración clínica completa.',
          followUp: 'Completar evaluación y revisar estudios aportados.',
        },
      },
      teeth: [
        { tooth: 11, condition: 'caries', recordedAt: '2026-11-18' },
        { tooth: 36, condition: 'obturacion', recordedAt: '2026-11-18' },
      ],
    },
  )
  const document = await PDFDocument.load(bytes)
  expect(document.getPageCount()).toBeGreaterThan(1)
  expect(document.getAuthor()).toBe('Alquimia Dental')
  if (process.env.RENDER_CLINICAL_PDF === '1') {
    mkdirSync('output/pdf', { recursive: true })
    writeFileSync('output/pdf/historia-clinica-ejemplo.pdf', bytes)
  }
})
