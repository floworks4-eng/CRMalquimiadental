import { describe, expect, it } from 'vitest'
import { mapHeader, parseCsv, toIsoDate, toSex } from './csv'

describe('CSV de pacientes', () => {
  it('detecta ; de Excel en español, comillas y saltos de línea', () => {
    const rows = parseCsv('﻿Nombre;Celular;Dirección\r\n"Quispe; Juan";70012345;"Calle 1\nZona Sur"\r\n\r\nAna Paz;7 123 4567;\n')
    expect(rows).toEqual([['Nombre', 'Celular', 'Dirección'], ['Quispe; Juan', '70012345', 'Calle 1\nZona Sur'], ['Ana Paz', '7 123 4567', '']])
  })
  it('comillas escapadas y coma como separador', () => {
    expect(parseCsv('a,b\n"dijo ""hola""",2')).toEqual([['a', 'b'], ['dijo "hola"', '2']])
  })
  it('reconoce encabezados con acentos y variantes', () => {
    expect(mapHeader(['Paciente', 'Teléfono', 'Fecha de nacimiento', 'Género', 'E-mail'])).toEqual({ fullName: 0, phone: 1, birthDate: 2, sex: 3, email: 4 })
  })
  it('fechas y sexo', () => {
    expect(toIsoDate('3/7/1990')).toBe('1990-07-03')
    expect(toIsoDate('1990-7-3')).toBe('1990-07-03')
    expect(toIsoDate('julio 1990')).toBe('')
    expect([toSex('Femenino'), toSex('varón'), toSex('?')]).toEqual(['F', 'M', ''])
  })
})
