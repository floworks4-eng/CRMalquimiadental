// El codigo TypeScript consulta con nombres de llaves foraneas y parametros de RPC. Si una migracion los cambia, esto avisa
// antes de que falle contra PostgREST (que no se puede correr sin Docker).
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from './harness'

let db: Db
beforeAll(async () => {
  db = await createDb({ seed: false })
})

describe('contrato con PostgREST', () => {
  it.each([
    'appointments_dentist_id_fkey',
    'patients_primary_dentist_id_fkey',
    'patients_first_campaign_id_fkey',
    'appointments_patient_id_fkey',
    'appointments_cabinet_id_fkey',
    'appointments_treatment_id_fkey',
    'appointments_campaign_id_fkey',
    'clinic_members_user_id_fkey',
  ])('existe la llave foranea %s', async (name) => {
    const r = await db.query('select 1 from pg_constraint where conname = $1 and contype = $2', [name, 'f'])
    expect(r.rows).toHaveLength(1)
  })

  it.each([
    ['available_slots', ['p_clinic', 'p_treatment', 'p_from', 'p_to', 'p_dentist', 'p_step']],
    ['create_appointment', ['p_patient', 'p_dentist', 'p_cabinet', 'p_treatment', 'p_starts_at', 'p_duration', 'p_source', 'p_campaign', 'p_notes']],
    ['reschedule_appointment', ['p_id', 'p_starts_at', 'p_cabinet', 'p_dentist', 'p_expected_updated_at', 'p_duration']],
    ['change_appointment_status', ['p_id', 'p_to', 'p_reason', 'p_expected_updated_at']],
    ['log_event', ['p_clinic', 'p_action', 'p_entity_type', 'p_entity_id', 'p_patient', 'p_meta']],
    ['accept_invite', ['p_token_hash', 'p_user_id']],
  ])('%s acepta los parametros que envia el servidor', async (fn, params) => {
    const r = await db.query<{ args: string[] | null }>(
      `select proargnames as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
      [fn],
    )
    expect(r.rows).toHaveLength(1)
    expect((r.rows[0].args ?? []).slice(0, params.length)).toEqual(params)
  })
})
