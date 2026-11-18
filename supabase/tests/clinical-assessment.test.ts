import { beforeAll, it, expect } from 'vitest'
import { createDb, as, rows, ID, type Db } from './harness'
let db: Db
const patient = '00000000-0000-4000-8000-000000000101'
beforeAll(async () => {
  db = await createDb()
})
it('una evaluación queda fechada y versionada sin permitir modificar el registro previo', async () => {
  const inserted = await as(db, { uid: ID.dentistA }, (tx) =>
    tx.query<{ id: string }>(
      'insert into public.clinical_assessments(clinic_id,patient_id,fields,patient_visible,created_by) values($1,$2,$3,true,$4) returning id',
      [ID.clinic, patient, { chiefComplaint: 'Dolor referido por paciente', diagnosis: 'Pendiente de completar evaluación' }, ID.dentistA],
    ),
  )
  const id = inserted.rows[0].id
  expect(await rows(db, { uid: ID.dentistA }, 'select id from public.clinical_assessments where id=$1', [id])).toHaveLength(1)
  await expect(as(db, 'service', (tx) => tx.query("update public.clinical_assessments set fields='{}' where id=$1", [id]))).rejects.toThrow(
    'IMMUTABLE_ASSESSMENT',
  )
  await as(db, { uid: ID.dentistA }, (tx) =>
    tx.query('insert into public.clinical_assessments(clinic_id,patient_id,fields,created_by) values($1,$2,$3,$4)', [
      ID.clinic,
      patient,
      { diagnosis: 'Evaluación revisada' },
      ID.dentistA,
    ]),
  )
  expect(await rows(db, { uid: ID.dentistA }, 'select id from public.clinical_assessments where patient_id=$1', [patient])).toHaveLength(2)
})
it('recepción y otro odontólogo no leen ni escriben evaluaciones ajenas', async () => {
  expect(await rows(db, { uid: ID.reception }, 'select * from public.clinical_assessments')).toHaveLength(0)
  expect(await rows(db, { uid: ID.dentistB }, 'select * from public.clinical_assessments where patient_id=$1', [patient])).toHaveLength(0)
  await expect(
    as(db, { uid: ID.reception }, (tx) =>
      tx.query('insert into public.clinical_assessments(clinic_id,patient_id,fields,created_by) values($1,$2,$3,$4)', [
        ID.clinic,
        patient,
        { diagnosis: 'No autorizado' },
        ID.reception,
      ]),
    ),
  ).rejects.toThrow()
})
