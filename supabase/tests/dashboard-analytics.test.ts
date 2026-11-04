import { beforeAll, describe, expect, it } from 'vitest'
import { ID, as, createDb, rows, type Db } from './harness'

let db: Db
beforeAll(async () => { db = await createDb() })

const report = async (uid: string) => {
  const [row] = await rows(db, { uid }, 'select public.dashboard_patient_analytics($1::uuid, $2::date) as data', [ID.clinic, '2026-11-04'])
  return row.data as { total: number; sources: { key: string; total: number }[]; ages: { key: string; total: number }[]; treatments: { name: string; total: number }[] }
}

describe('Estadísticas de pacientes', () => {
  it('respeta la visibilidad del odontólogo y la clínica', async () => {
    const admin = await report(ID.admin)
    const dentist = await report(ID.dentistA)
    expect(admin.total).toBe(12)
    expect(dentist.total).toBe(4)
    expect(admin.sources.reduce((sum, x) => sum + x.total, 0)).toBe(12)
    expect(dentist.ages.reduce((sum, x) => sum + x.total, 0)).toBe(4)
    expect(admin.treatments.every((x) => x.total > 0)).toBe(true)
  })
  it('no permite consulta anónima', async () => {
    await expect(rows(db, 'anon', 'select public.dashboard_patient_analytics($1::uuid, $2::date)', [ID.clinic, '2026-11-04'])).rejects.toThrow(/permission denied/)
  })
  it('permite crear una ficha solo con nombre desde recepción y la cuenta en el tablero', async () => {
    await as(db, { uid: ID.reception }, (tx) => tx.query(
      `insert into public.patients (clinic_id, full_name, normalized_name, first_source, created_by)
       values ($1, 'Paciente Sin Celular', 'paciente sin celular', 'referral', $2)`, [ID.clinic, ID.reception],
    ))
    const after = await report(ID.admin)
    expect(after.total).toBe(13)
    expect(after.sources.reduce((sum, x) => sum + x.total, 0)).toBe(13)
  })
})
