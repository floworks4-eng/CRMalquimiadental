import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import sharp from 'sharp'
import { RECORD_GROUPS } from '@/lib/domain/clinical-record'
import type { ClinicalReportContext } from '@/lib/domain/clinical-report'
import { CONDITION_COLOR } from '@/lib/dental-colors'
import { CONDITION_LABEL, type ToothCondition } from '@/lib/domain/clinical'
export type ExportSession = {
  id: string
  title: string
  date: string
  notes: { body: string; author: string; date: string }[]
  files: { name: string; mime: string; bytes: Uint8Array }[]
}
/** A clinical copy, not a chat transcript. Only reviewed/published data is supplied. */
export async function buildJournalPdf(patient: string, sessions: ExportSession[], context: ClinicalReportContext = {}) {
  const pdf = await PDFDocument.create(),
    regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.12, 0.19, 0.19),
    muted = rgb(0.39, 0.44, 0.45),
    gold = rgb(0.67, 0.49, 0.22),
    pale = rgb(0.96, 0.95, 0.92)
  const ownPages = new Set<PDFPage>()
  let page!: PDFPage,
    y = 0,
    number = 0,
    attachmentNumber = 0
  const clinic = context.clinic?.name ?? 'Alquimia Dental',
    record = context.patient?.id ?? 'No registrado'
  const safe = (text: string) =>
    Array.from(text.normalize('NFC'))
      .map((c) => {
        try {
          regular.encodeText(c)
          return c
        } catch {
          return c === '→' ? ' > ' : '?'
        }
      })
      .join('')
  function heading(value: string, size: number, width: number) {
    let valueSafe = safe(value)
    if (bold.widthOfTextAtSize(valueSafe, size) <= width) return valueSafe
    while (valueSafe && bold.widthOfTextAtSize(`${valueSafe}...`, size) > width) valueSafe = valueSafe.slice(0, -1)
    return `${valueSafe}...`
  }
  function newPage() {
    page = pdf.addPage([595.28, 841.89])
    ownPages.add(page)
    y = 722
    page.drawRectangle({ x: 0, y: 760, width: 596, height: 82, color: ink })
    page.drawText(heading(clinic.toUpperCase(), 12, 510), { x: 42, y: 804, size: 12, font: bold, color: rgb(1, 1, 1) })
    page.drawText('HISTORIA CLÍNICA ODONTOLÓGICA', { x: 42, y: 780, size: 15, font: bold, color: rgb(1, 0.94, 0.79) })
    page.drawText(heading(patient, 10, 510), { x: 42, y: 742, size: 10, font: bold, color: ink })
    page.drawLine({ start: { x: 42, y: 733 }, end: { x: 553, y: 733 }, thickness: 0.8, color: gold })
  }
  function ensure(height: number) {
    if (!page || y - height < 60) newPage()
  }
  function wrap(text: string, size = 10, width = 506) {
    const out: string[] = []
    for (const paragraph of safe(text).split('\n')) {
      let line = ''
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue
        let rest = word
        while (regular.widthOfTextAtSize(rest, size) > width) {
          if (line) {
            out.push(line)
            line = ''
          }
          let n = 1
          while (n < rest.length && regular.widthOfTextAtSize(rest.slice(0, n + 1), size) <= width) n++
          out.push(rest.slice(0, n))
          rest = rest.slice(n)
        }
        if (line && regular.widthOfTextAtSize(`${line} ${rest}`, size) > width) {
          out.push(line)
          line = rest
        } else line = line ? `${line} ${rest}` : rest
      }
      out.push(line || ' ')
    }
    return out
  }
  function text(value: string, size = 10, color = ink, strong = false) {
    for (const line of wrap(value, size)) {
      ensure(size + 7)
      page.drawText(line, { x: 44, y, size, font: strong ? bold : regular, color })
      y -= size + 5
    }
  }
  function section(title: string) {
    ensure(52)
    y -= 9
    page.drawRectangle({ x: 42, y: y - 23, width: 511, height: 29, color: pale })
    page.drawText(`${String(++number).padStart(2, '0')}  ${safe(title.toUpperCase())}`, {
      x: 51,
      y: y - 13,
      size: 10,
      font: bold,
      color: ink,
    })
    y -= 43
  }
  function field(label: string, value?: string | null) {
    ensure(35)
    text(label, 8, muted, true)
    text(value?.trim() || 'No registrado', 10)
    y -= 5
  }
  const formatted = (v?: string | null) =>
    v ? new Date(v.length === 10 ? `${v}T12:00:00-04:00` : v).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }) : 'No registrado'
  newPage()
  text('Copia clínica · datos registrados y documentos originales', 9, muted)
  y -= 8
  section('Identificación del paciente y del expediente')
  field('Paciente', patient)
  field('Número de historia', record)
  field('Nacimiento / sexo', `${formatted(context.patient?.birthDate)} · ${context.patient?.sex || 'No registrado'}`)
  field('Contacto', context.patient?.phone)
  field('Domicilio', context.patient?.address)
  field('Profesional asignado', context.patient?.primaryDentist)
  const a = context.anamnesis,
    e = context.assessment
  section('Anamnesis y alertas declaradas')
  text(
    a
      ? `Fuente: ${a.source === 'staff' ? 'registro del equipo' : a.source === 'import' ? 'documento importado' : 'formulario del paciente'} · ${formatted(a.recordedAt)}`
      : 'Anamnesis pendiente de registrar.',
    9,
    muted,
  )
  field('Motivo declarado', a?.reason)
  field('Alergias declaradas', a?.allergies.length ? a.allergies.join(' · ') : undefined)
  field('Antecedentes declarados', a?.conditions.length ? a.conditions.join(' · ') : undefined)
  field('Medicamentos declarados', a?.medications)
  field(
    'Embarazo / anticoagulantes',
    a
      ? `Embarazo: ${a.pregnancy === null ? 'no registrado' : a.pregnancy ? 'declarado' : 'no declarado en la ficha'} · Anticoagulantes: ${a.anticoagulants === null ? 'no registrado' : a.anticoagulants ? 'declarado' : 'no declarado en la ficha'}`
      : undefined,
  )
  if (a)
    text('Información declarada: requiere valoración profesional. No se interpreta un campo vacío como un resultado negativo.', 8, muted)
  for (const group of RECORD_GROUPS) {
    section(group.title)
    if (e) text(`Revisión: ${e.author} · ${formatted(e.createdAt)}`, 8, muted)
    for (const [key, label] of group.fields) field(label, e?.fields[key])
  }
  section('Registro dental y plan documentado')
  const marked = new Map((context.teeth ?? []).map((t) => [t.tooth, t]))
  const maps = [
    {
      label: 'Dentición permanente · esquema FDI',
      rows: [
        [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
        [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
      ],
      show: !context.teeth?.length || context.teeth.some((t) => t.tooth < 50),
    },
    {
      label: 'Dentición temporal · esquema FDI',
      rows: [
        [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
        [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
      ],
      show: context.teeth?.some((t) => t.tooth >= 50),
    },
  ]
  for (const map of maps.filter((m) => m.show)) {
    ensure(116)
    text(map.label, 9, muted, true)
    for (const row of map.rows) {
      row.forEach((tooth, i) => {
        const x = 56 + i * 31,
          mark = marked.get(tooth),
          hex = mark ? CONDITION_COLOR[mark.condition as ToothCondition] : undefined,
          color = hex
            ? rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)
            : rgb(0.93, 0.94, 0.93)
        page.drawEllipse({ x, y: y - 10, xScale: 10, yScale: 13, color, borderWidth: 0.7, borderColor: rgb(0.6, 0.65, 0.63) })
        page.drawText(String(tooth), { x: x - 5, y: y - 33, size: 8, font: regular, color: ink })
      })
      y -= 48
    }
    text('Gris: sin registro. Los colores resumen los hallazgos documentados; no representan un diagnóstico nuevo.', 8, muted)
    y -= 6
  }

  if (context.teeth?.length) {
    text('Último estado registrado por pieza (FDI)', 9, muted, true)
    for (const t of context.teeth)
      text(`Pieza ${t.tooth} · ${CONDITION_LABEL[t.condition as ToothCondition] ?? t.condition} · ${formatted(t.recordedAt)}`)
  } else text('Sin hallazgos dentales registrados.', 10, muted)
  y -= 8
  if (context.plan?.length) {
    const labels: Record<string, string> = { planned: 'Pendiente', accepted: 'Aceptado', in_progress: 'En curso', done: 'Realizado' }
    for (const p of context.plan) text(`${p.treatment}${p.tooth ? ` · pieza ${p.tooth}` : ''} · ${labels[p.status] ?? p.status}`)
  } else text('Sin tratamientos registrados en el plan.', 10, muted)
  section('Evolución por sesiones')
  if (!sessions.length) text('No hay sesiones publicadas en esta copia.', 10, muted)
  for (const s of sessions) {
    ensure(60)
    text(`${/^\d{4}-\d{2}-\d{2}$/.test(s.date) ? formatted(s.date) : s.date} · ${s.title}`, 12, ink, true)
    if (!s.notes.length) text('Sin evolución publicada en esta sesión.', 10, muted)
    for (const n of s.notes) {
      text(`${n.author} · ${n.date}`, 8, muted, true)
      text(n.body)
      y -= 10
    }
    for (const f of s.files) text(`Adjunto: ${f.name}`, 9, muted)
    y -= 12
  }
  section('Documentos y pruebas complementarias')
  text(
    'Los adjuntos se identifican por su sesión. Un contrato adjunto no acredita por sí mismo firma ni consentimiento. La interpretación de radiografías corresponde al profesional.',
    9,
    muted,
  )
  const attached = sessions.flatMap((s) => s.files.map((f) => ({ ...f, session: `${s.date} · ${s.title}` })))
  if (!attached.length) text('No se adjuntaron documentos a esta copia.', 10, muted)
  for (const f of attached) {
    ensure(65)
    text(f.name, 11, ink, true)
    text(f.session, 8, muted)
    await pdf.attach(f.bytes, `${++attachmentNumber}-${f.name}`, {
      mimeType: f.mime,
      description: 'Original sin modificar; validar cualquier firma sobre este archivo original.',
    })
    if (f.mime === 'application/pdf') {
      text('Original incrustado sin modificar; las páginas siguientes son una copia visual.', 8, muted)
      try {
        const source = await PDFDocument.load(f.bytes)
        if (source.getPageCount() > 200) throw Error('page limit')
        for (const p of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(p)
      } catch {
        text(
          'No se pudo incorporar la copia visual: documento protegido, dañado o demasiado extenso. El original queda incrustado.',
          9,
          muted,
        )
      }
      newPage()
    } else if (['image/jpeg', 'image/png', 'image/webp'].includes(f.mime)) {
      try {
        const visual = await sharp(f.bytes, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer()
        const image = await pdf.embedPng(visual),
          fit = image.scaleToFit(505, 570)
        ensure(fit.height + 10)
        page.drawImage(image, { x: 44, y: y - fit.height, width: fit.width, height: fit.height })
        y -= fit.height + 18
      } catch {
        text('No se pudo representar esta imagen. Consultar el original del expediente.', 9, muted)
      }
    } else text('Este formato se conserva en el expediente; no se representa visualmente en el PDF.', 9, muted)
  }
  section('Autoría y alcance de esta copia')
  text(
    'Cada nota conserva el profesional y la fecha registrados. Este documento no agrega diagnósticos, firmas ni exploraciones no documentadas. Las correcciones se registran como una nueva versión.',
    9,
    muted,
  )
  if (context.clinic?.address) text(context.clinic.address, 8, muted)
  const pages = pdf.getPages()
  pages.forEach((p, i) => {
    if (!ownPages.has(p)) return
    p.drawLine({ start: { x: 42, y: 42 }, end: { x: 553, y: 42 }, thickness: 0.5, color: gold })
    p.drawText(heading(`${clinic} · ${patient}`, 7, 460), { x: 43, y: 28, size: 7, font: regular, color: muted })
    p.drawText(`${i + 1} / ${pages.length}`, { x: 516, y: 28, size: 8, font: regular, color: muted })
  })
  pdf.setTitle(`Historia clínica - ${patient}`)
  pdf.setAuthor(clinic)
  return pdf.save()
}
