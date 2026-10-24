// Lectura de CSV exportado de Excel / Google Sheets: separador , o ; (se detecta), comillas dobles y saltos de linea dentro de comillas.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]/g, '')

/** Columnas reconocidas de la planilla de pacientes (acepta variantes comunes del encabezado). */
export const PATIENT_COLUMNS = {
  fullName: ['nombre', 'nombrecompleto', 'paciente', 'nombreyapellido', 'nombres'],
  phone: ['celular', 'telefono', 'cel', 'movil', 'whatsapp', 'fono'],
  birthDate: ['fechadenacimiento', 'nacimiento', 'fechanacimiento', 'fnac'],
  sex: ['sexo', 'genero'],
  zone: ['zona', 'barrio'],
  address: ['direccion', 'domicilio'],
  email: ['correo', 'email', 'correoelectronico', 'mail'],
} as const
export type PatientColumn = keyof typeof PATIENT_COLUMNS

export function mapHeader(header: string[]): Partial<Record<PatientColumn, number>> {
  const out: Partial<Record<PatientColumn, number>> = {}
  header.forEach((h, i) => {
    const n = norm(h)
    for (const [k, aliases] of Object.entries(PATIENT_COLUMNS) as [PatientColumn, readonly string[]][]) {
      if (out[k] === undefined && aliases.includes(n)) out[k] = i
    }
  })
  return out
}

/** '31/12/1990', '31-12-1990' o '1990-12-31' -> '1990-12-31'. Vacio si no se reconoce. */
export function toIsoDate(v: string) {
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

/** 'F', 'Femenino', 'mujer' -> 'F'; 'M', 'masculino', 'varon' -> 'M'. */
export function toSex(v: string) {
  const n = norm(v)
  if (['f', 'femenino', 'mujer'].includes(n)) return 'F'
  if (['m', 'masculino', 'hombre', 'varon'].includes(n)) return 'M'
  return ''
}
