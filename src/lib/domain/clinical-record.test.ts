import { it, expect } from 'vitest'
import { clinicalFieldsSchema } from './clinical-record'
it('no interpreta una ficha vacía como una evaluación realizada ni acepta campos ajenos', () => {
  expect(clinicalFieldsSchema.safeParse({}).success).toBe(false)
  expect(clinicalFieldsSchema.safeParse({ diagnosis: '   ' }).success).toBe(false)
  expect(clinicalFieldsSchema.safeParse({ diagnosis: 'Pendiente', patient_id: 'otro' }).success).toBe(false)
  expect(clinicalFieldsSchema.parse({ chiefComplaint: '  Molestia referida  ' })).toEqual({ chiefComplaint: 'Molestia referida' })
})
