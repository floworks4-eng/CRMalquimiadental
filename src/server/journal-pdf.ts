import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
export type ExportSession = {
  id: string
  title: string
  date: string
  notes: { body: string; author: string; date: string }[]
  files: { name: string; mime: string; bytes: Uint8Array }[]
}
/** Input already contains only published clinical entries. Never embeds a raw audit or private audio. */
export async function buildJournalPdf(patient: string, sessions: ExportSession[]) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([595, 842]),
    y = 790,
    pageUsed = false
  const safe = (s: string) =>
    Array.from(s.normalize('NFC'))
      .map((c) => {
        try {
          font.encodeText(c)
          return c
        } catch {
          return '?'
        }
      })
      .join('')
  const line = (text: string, size = 11, heading = false) => {
    const words = safe(text).split(/\s+/)
    let part = ''
    for (const w of words) {
      if (font.widthOfTextAtSize(part + ' ' + w, size) > 490 && part) {
        draw(part, size, heading)
        part = w
      } else part = part ? part + ' ' + w : w
    }
    if (part) draw(part, size, heading)
  }
  function draw(t: string, size: number, heading: boolean) {
    if (y < 60) {
      page = pdf.addPage([595, 842])
      y = 790
    }
    pageUsed = true
    page.drawText(t, { x: 48, y, size, font: heading ? bold : font, color: rgb(0.12, 0.15, 0.18), maxWidth: 495 })
    y -= size + 7
  }
  line('ALQUIMIA DENTAL · HISTORIA CLÍNICA', 17, true)
  line(`Paciente: ${patient}`, 12)
  line('Copia clínica · notas publicadas y documentos originales', 9)
  y -= 12
  let originalCounter = 0
  for (const s of sessions) {
    line(`${s.date} · ${s.title}`, 14, true)
    if (!s.notes.length) line('Sin notas publicadas para esta sesión.', 10)
    for (const n of s.notes) {
      line(`${n.date} · ${n.author}`, 9, true)
      for (const paragraph of n.body.split('\n')) {
        line(paragraph || ' ', 11)
      }
      y -= 8
    }
    for (const file of s.files) {
      line(`Adjunto: ${file.name}`, 10, true)
      try {
        if (file.mime === 'application/pdf') {
          await pdf.attach(file.bytes, `${++originalCounter}-${file.name}`, {
            mimeType: 'application/pdf',
            description: 'Original sin modificar. Las páginas del historial son una copia visual.',
          })
          line('Copia visual del adjunto. El PDF original se incluye como archivo incrustado.', 9)
          const original = await PDFDocument.load(file.bytes)
          if (original.getPageCount() > 200) throw new Error('too many pages')
          const pages = await pdf.copyPages(original, original.getPageIndices())
          for (const p of pages) pdf.addPage(p)
          page = pdf.addPage([595, 842])
          y = 790
          pageUsed = false
        } else if (file.mime === 'image/jpeg' || file.mime === 'image/png') {
          const image = file.mime === 'image/jpeg' ? await pdf.embedJpg(file.bytes) : await pdf.embedPng(file.bytes)
          const fit = image.scaleToFit(495, 620)
          if (y - fit.height < 60) {
            page = pdf.addPage([595, 842])
            y = 790
            pageUsed = false
          }
          pageUsed = true
          page.drawImage(image, { x: 48, y: y - fit.height, width: fit.width, height: fit.height })
          y -= fit.height + 20
        } else line('Original conservado en el expediente; este formato no se incorpora visualmente al PDF.', 9)
      } catch {
        line('No se pudo incorporar este original al PDF (puede estar protegido). Consúltalo en el expediente.', 9)
      }
    }
    y -= 20
  }
  if (!pageUsed && pdf.getPageCount() > 1) pdf.removePage(pdf.getPageCount() - 1)
  const total = pdf.getPageCount()
  pdf.getPages().forEach((p, i) => p.drawText(`${i + 1} / ${total}`, { x: 48, y: 22, size: 8, font, color: rgb(0.4, 0.4, 0.4) }))
  pdf.setTitle(`Historia clínica - ${patient}`)
  return pdf.save()
}
