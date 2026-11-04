import { beforeAll, expect, it } from 'vitest'
import { createDb, rows, ID, type Db } from './harness'
let db: Db
let encounter: string
const patient = '00000000-0000-4000-8000-000000000101'
beforeAll(async () => {
  db = await createDb()
  const [r] = await rows(db, { uid: ID.dentistA }, 'select public.start_encounter($1) as id', ['00000000-0000-4000-8000-000000000201'])
  encounter = r.id as string
})
const save = (condition: string, tooth = 16, uid: string = ID.dentistA, p = patient) => rows(db, { uid }, 'select public.save_tooth_finding($1,$2,$3,$4::public.tooth_condition,$5::text[],null)', [encounter,p,tooth,condition,['M']])
it('registra y reemplaza caries por restaurado y sano sin duplicar la pieza', async () => {
  for (const state of ['caries', 'obturacion', 'sano']) {
    await save(state)
    expect(await rows(db, { uid: ID.dentistA }, 'select condition, surfaces from public.tooth_findings where encounter_id=$1 and tooth_fdi=16', [encounter])).toEqual([{ condition: state, surfaces: ['M'] }])
  }
})
it('rechaza otro paciente, otro odontólogo, recepción y anónimos', async () => {
  await expect(save('caries',16,ID.dentistA,'00000000-0000-4000-8000-000000000102')).rejects.toThrow()
  await expect(save('caries',16,ID.dentistB)).rejects.toThrow()
  await expect(save('caries',16,ID.reception)).rejects.toThrow()
  await expect(rows(db, 'anon', 'select public.save_tooth_finding($1,$2,16,$3::public.tooth_condition,$4::text[],null)', [encounter,patient,'caries',[]])).rejects.toThrow(/permission denied/)
})
it('un reemplazo inválido revierte el borrado y conserva el hallazgo anterior', async () => {
  await expect(rows(db, { uid: ID.dentistA }, 'select public.save_tooth_finding($1,$2,16,$3::public.tooth_condition,$4::text[],null)', [encounter,patient,'caries',['INVALID']])).rejects.toThrow()
  expect(await rows(db, { uid: ID.dentistA }, 'select condition from public.tooth_findings where encounter_id=$1 and tooth_fdi=16', [encounter])).toEqual([{condition:'sano'}])
})
it('una atención cerrada no admite nuevos estados', async () => {
  await rows(db,'service', "update public.encounters set status='finished', finished_at=now() where id=$1",[encounter])
  await expect(save('caries')).rejects.toThrow('IMMUTABLE')
})
