// La UI ofrece las transiciones de src/lib/domain/status.ts; la base de datos decide. Deben coincidir en las 147 combinaciones.
import { beforeAll, describe, expect, it } from 'vitest'
import { allowedTransitions, type AppointmentStatus } from '@/lib/domain/status'
import type { Role } from '@/server/auth/permissions'
import { ID, as, createDb, type Db } from './harness'

const STATES: AppointmentStatus[] = ['scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'no_show', 'cancelled']
const ROLES: [Role, string][] = [['clinic_admin', ID.admin], ['reception', ID.reception], ['dentist', ID.dentistA]]

let db: Db
beforeAll(async () => {
  db = await createDb()
})

describe('paridad de la maquina de estados (TS vs SQL)', () => {
  it('cada combinacion origen/destino/rol coincide', async () => {
    let n = 0
    const mismatches: string[] = []
    for (const from of STATES) {
      for (const to of STATES) {
        for (const [role, uid] of ROLES) {
          // Una cita por caso, en el pasado y en horas distintas para no chocar con las exclusiones.
          const id = (
            await db.query<{ id: string }>(
              `insert into public.appointments (clinic_id, patient_id, dentist_id, cabinet_id, starts_at, ends_at, status, created_by)
               values ($1, '00000000-0000-4000-8000-000000000101', $2, '00000000-0000-4000-8000-0000000000b1',
                       date_trunc('day', now()) - interval '20 days' + $3 * interval '1 hour',
                       date_trunc('day', now()) - interval '20 days' + $3 * interval '1 hour' + interval '30 minutes', $4, $5) returning id`,
              [ID.clinic, ID.dentistA, n++, from, ID.reception],
            )
          ).rows[0].id
          let sqlAllows = true
          try {
            await as(db, { uid }, (tx) => tx.query('select public.change_appointment_status($1, $2, $3)', [id, to, 'Motivo de prueba válido']))
          } catch (e) {
            sqlAllows = !/INVALID_TRANSITION|FORBIDDEN|NOT_FOUND/.test(String(e))
          }
          const tsAllows = allowedTransitions(from, role).includes(to)
          if (sqlAllows !== tsAllows) mismatches.push(`${role}: ${from} -> ${to} (SQL=${sqlAllows}, TS=${tsAllows})`)
        }
      }
    }
    expect(n).toBe(147)
    expect(mismatches).toEqual([])
  })
})
