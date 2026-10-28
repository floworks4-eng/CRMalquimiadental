// Reglas de escritura, restricciones de agenda, triggers y auditoria. Cada test usa datos propios.
import { beforeAll, describe, expect, it } from 'vitest'
import { ID, as, createDb, rows, type Db } from './harness'

let db: Db
const P = (n: number) => `00000000-0000-4000-8000-000000000${100 + n}`
const admin = { uid: ID.admin }
const dentistA = { uid: ID.dentistA }
const dentistB = { uid: ID.dentistB }
const reception = { uid: ID.reception }
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const todayAt = (hm: string) => `((current_date + time '${hm}') at time zone 'America/La_Paz')`

beforeAll(async () => {
  db = await createDb()
})

const insertAppt = (patient: string, dentist: string, cabinet: string, from: string, to: string, status = 'scheduled') =>
  db.exec(
    `insert into public.appointments (patient_id, dentist_id, cabinet_id, starts_at, ends_at, status, created_by)
     values ('${patient}', '${dentist}', '${cabinet}', ${todayAt(from)}, ${todayAt(to)}, '${status}', '${ID.reception}')`,
  )

describe('Agenda: doble reserva imposible', () => {
  // Hoy 09:00-09:30 en Gabinete 1 con la Dra. A (paciente 101) ya existe en el seed.
  it('mismo odontologo, horario solapado', async () => {
    await expect(insertAppt(P(3), ID.dentistA, B2, '09:15', '09:45')).rejects.toThrow(/appointments_dentist_no_overlap/)
  })
  it('mismo gabinete, horario solapado', async () => {
    await insertAppt(P(3), ID.dentistB, B2, '19:00', '19:30')
    await expect(insertAppt(P(4), ID.dentistA, B2, '19:10', '19:40')).rejects.toThrow(/appointments_cabinet_no_overlap/)
  })
  it('mismo paciente en dos sitios a la vez', async () => {
    await insertAppt(P(4), ID.dentistA, B1, '18:00', '18:30')
    await expect(insertAppt(P(4), ID.dentistB, B2, '18:10', '18:20')).rejects.toThrow(/appointments_patient_no_overlap/)
  })
  it('citas contiguas si se permiten ([) abierto al final)', async () => {
    await insertAppt(P(3), ID.dentistA, B1, '09:30', '10:00')
  })
  it('una cita cancelada libera el horario', async () => {
    await insertAppt(P(4), ID.dentistA, B1, '14:00', '14:30', 'cancelled')
    await insertAppt(P(3), ID.dentistA, B1, '14:00', '14:30')
  })
  it('fin anterior al inicio es invalido', async () => {
    await expect(insertAppt(P(4), ID.dentistA, B1, '16:00', '15:00')).rejects.toThrow(/appointments_time_valid/)
  })
  it('20 reservas simultaneas del mismo hueco: 1 gana', async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => insertAppt(P(2), ID.dentistA, B2, '17:00', '17:30')))
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1)
  })
  it('gabinete de otra clinica o inactivo es invalido', async () => {
    await db.exec(`update public.cabinets set active = false where id = '00000000-0000-4000-8000-0000000000b3'`)
    await expect(insertAppt(P(4), ID.dentistA, '00000000-0000-4000-8000-0000000000b3', '12:00', '12:30')).rejects.toThrow(/invalid cabinet/)
  })
  it('odontologo que no es miembro de la clinica es invalido', async () => {
    await expect(insertAppt(P(4), ID.reception, B1, '18:00', '18:30')).rejects.toThrow(/invalid dentist/)
  })
})

describe('Pacientes', () => {
  const insertPatient = (actor: Parameters<typeof as>[1], name: string, phone: string | null, by: string = ID.reception) =>
    as(db, actor, (tx) =>
      tx.query('insert into public.patients (clinic_id, full_name, normalized_name, phone_e164, created_by) values ($1, $2, $3, $4, $5)', [
        ID.clinic, name, name.toLowerCase(), phone, by,
      ]),
    )
  it('recepcion crea un paciente y la auditoria registra quien', async () => {
    await insertPatient(reception, 'Paciente Nuevo Uno', '+59170002001')
    const a = await rows(db, admin, `select actor_id, actor_role, action from public.audit_log where action = 'patients.create' and after ->> 'full_name' = 'Paciente Nuevo Uno'`)
    expect(a).toEqual([{ actor_id: ID.reception, actor_role: 'reception', action: 'patients.create' }])
    expect(await rows(db, reception, `select 1 from public.audit_log`)).toHaveLength(0)
  })
  it('telefono duplicado en la misma clinica: conflicto', async () => {
    await insertPatient(admin, 'Paciente Dup A', '+59170002002', ID.admin)
    await expect(insertPatient(reception, 'Paciente Dup B', '+59170002002')).rejects.toThrow(/patients_phone_unique/)
  })
  it('telefono con formato invalido', async () => {
    await expect(insertPatient(reception, 'Paciente Mal Tel', '71234567')).rejects.toThrow(/check constraint/)
  })
  it('no se puede firmar como otro usuario (created_by)', async () => {
    await expect(insertPatient(reception, 'Paciente Falso', null, ID.admin)).rejects.toThrow(/row-level security/)
  })
  it('un odontologo no edita pacientes ajenos', async () => {
    const upd = await as(db, dentistA, (tx) => tx.query(`update public.patients set zone = 'X' where id = $1`, [P(5)]))
    expect(upd.affectedRows).toBe(0)
  })
  it('recepcion si actualiza datos de contacto', async () => {
    const upd = await as(db, reception, (tx) => tx.query(`update public.patients set zone = 'Sopocachi' where id = $1`, [P(10)]))
    expect(upd.affectedRows).toBe(1)
  })
  it('nadie borra pacientes desde el cliente', async () => {
    await expect(as(db, admin, (tx) => tx.query('delete from public.patients where id = $1', [P(12)]))).rejects.toThrow(/permission denied/)
  })
})

describe('Anamnesis versionada y clinic_id no falsificable', () => {
  it('cada insercion crea la version siguiente', async () => {
    await as(db, dentistA, (tx) => tx.query(`insert into public.anamnesis_versions (patient_id, allergies, submitted_by) values ($1, '{Latex}', $2)`, [P(1), ID.dentistA]))
    const v = await rows(db, dentistA, 'select version from public.anamnesis_versions where patient_id = $1 order by version', [P(1)])
    expect(v.map((r) => r.version)).toEqual([1, 2])
    expect(await rows(db, dentistA, 'select patient_id, version from public.v_current_anamnesis')).toEqual([{ patient_id: P(1), version: 2 }])
  })
  it('un odontologo no inserta anamnesis de un paciente ajeno', async () => {
    await expect(
      as(db, dentistA, (tx) => tx.query(`insert into public.anamnesis_versions (patient_id, allergies, submitted_by) values ($1, '{Ninguna}', $2)`, [P(5), ID.dentistA])),
    ).rejects.toThrow(/row-level security/)
  })
  it('el clinic_id lo toma el servidor del paciente, no el cliente', async () => {
    await db.exec(`insert into public.clinics (id, slug, name) values ('00000000-0000-4000-8000-0000000000c9', 'falsa', 'Falsa')`)
    await as(db, dentistA, (tx) =>
      tx.query(`insert into public.anamnesis_versions (clinic_id, patient_id, allergies, submitted_by) values ('00000000-0000-4000-8000-0000000000c9', $1, '{x}', $2)`, [P(2), ID.dentistA]),
    )
    const r = await rows(db, dentistA, 'select clinic_id from public.anamnesis_versions where patient_id = $1', [P(2)])
    expect(r).toEqual([{ clinic_id: ID.clinic }])
  })
})

describe('Encuentros', () => {
  it('un encuentro finalizado es inmutable (solo addenda)', async () => {
    await expect(as(db, dentistB, (tx) => tx.query(`update public.encounters set notes = 'cambio' where id = '00000000-0000-4000-8000-000000000301'`))).rejects.toThrow(/IMMUTABLE/)
  })
  it('no se agregan hallazgos a un encuentro finalizado', async () => {
    await expect(
      as(db, dentistB, (tx) =>
        tx.query(`insert into public.tooth_findings (patient_id, encounter_id, tooth_fdi, condition, recorded_by) values ($1, '00000000-0000-4000-8000-000000000301', 36, 'caries', $2)`, [P(7), ID.dentistB]),
      ),
    ).rejects.toThrow(/row-level security/)
  })
  it('hallazgos: numeracion FDI y superficies validas', async () => {
    await db.exec(`insert into public.appointments (id, patient_id, dentist_id, cabinet_id, starts_at, ends_at, status, created_by)
      values ('00000000-0000-4000-8000-000000000206', '${P(5)}', '${ID.dentistB}', '${B2}', ${todayAt('13:00')}, ${todayAt('13:30')}, 'in_progress', '${ID.reception}')`)
    const created = await as(db, dentistB, (tx) =>
      tx.query<{ id: string }>(`insert into public.encounters (patient_id, appointment_id, dentist_id) values ($1, '00000000-0000-4000-8000-000000000206', $2) returning id`, [P(5), ID.dentistB]),
    )
    const e = created.rows[0].id
    const finding = (tooth: number, surfaces: string[]) =>
      as(db, dentistB, (tx) => tx.query('insert into public.tooth_findings (patient_id, encounter_id, tooth_fdi, condition, surfaces, recorded_by) values ($1, $2, $3, $4, $5, $6)', [P(5), e, tooth, 'caries', surfaces, ID.dentistB]))
    await finding(36, ['O', 'D'])
    await expect(finding(19, [])).rejects.toThrow(/check constraint/)
    await expect(finding(66, [])).rejects.toThrow(/check constraint/)
    await expect(finding(36, ['Z'])).rejects.toThrow(/check constraint/)
    await finding(54, []) // temporal valido
  })
})

describe('Equipo', () => {
  it('no se puede dejar la clinica sin administrador', async () => {
    await expect(db.exec(`update public.clinic_members set active = false where user_id = '${ID.admin}'`)).rejects.toThrow(/LAST_ADMIN/)
    await expect(db.exec(`update public.clinic_members set role = 'dentist' where user_id = '${ID.admin}'`)).rejects.toThrow(/LAST_ADMIN/)
  })
  it('con un segundo admin si se puede degradar al primero', async () => {
    await db.exec(`update public.clinic_members set role = 'clinic_admin' where user_id = '${ID.dentistA}'`)
    await db.exec(`update public.clinic_members set role = 'dentist' where user_id = '${ID.admin}'`)
    await db.exec(`update public.clinic_members set role = 'clinic_admin' where user_id = '${ID.admin}'`)
  })
  it('un usuario activo no puede estar en dos clinicas', async () => {
    await db.exec(`insert into public.clinics (id, slug, name) values ('00000000-0000-4000-8000-0000000000c8', 'dos', 'Dos')`)
    await expect(db.exec(`insert into public.clinic_members (clinic_id, user_id, role) values ('00000000-0000-4000-8000-0000000000c8', '${ID.reception}', 'reception')`)).rejects.toThrow(/clinic_members_one_active_clinic/)
  })
  it('crear un usuario de Auth crea su perfil', async () => {
    await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000f9', 'nuevo@alquimia.test', '{"full_name":"Nuevo Usuario"}')`)
    expect((await db.query('select full_name from public.profiles where id = $1', ['00000000-0000-4000-8000-0000000000f9'])).rows).toEqual([{ full_name: 'Nuevo Usuario' }])
  })
})

describe('Digitalización de fichas y catálogo editable', () => {
  it('registra una ficha de papel sin celular y conserva su referencia al archivo privado', async () => {
    const created = await as(db, admin, (tx) => tx.query<{ id: string }>(
      `insert into public.patients (clinic_id, full_name, normalized_name, first_source, created_by)
       values ($1, 'Paciente Ficha Papel', 'paciente ficha papel', 'historical', $2) returning id`, [ID.clinic, ID.admin],
    ))
    const patientId = created.rows[0].id
    const storagePath = `${ID.clinic}/${patientId}/hoja.jpg`
    await as(db, admin, (tx) => tx.query(
      `insert into public.patient_files (clinic_id, patient_id, kind, storage_path, mime, size_bytes, sha256, uploaded_by)
       values ($1, $2, 'photo', $3, 'image/jpeg', 1024, $4, $5)`, [ID.clinic, patientId, storagePath, 'a'.repeat(64), ID.admin],
    ))
    expect(await rows(db, admin, 'select storage_path from public.patient_files where patient_id = $1', [patientId])).toEqual([{ storage_path: storagePath }])
    expect(await rows(db, reception, 'select storage_path from public.patient_files where patient_id = $1', [patientId])).toEqual([])
  })
  it('el administrador crea un tratamiento, cambia el precio y recupera el importe actualizado', async () => {
    const created = await as(db, admin, (tx) => tx.query<{ id: string }>(
      `insert into public.treatments (clinic_id, code, name, price_cents, duration_min)
       values ($1, 'prueba_catalogo', 'Tratamiento de prueba', 10000, 30) returning id`, [ID.clinic],
    ))
    const id = created.rows[0].id
    await as(db, admin, (tx) => tx.query('update public.treatments set price_cents = 27000 where id = $1', [id]))
    expect(await rows(db, admin, 'select price_cents from public.treatments where id = $1', [id])).toEqual([{ price_cents: 27000 }])
  })
})

describe('Auditoria append-only y log_event', () => {
  it('ni siquiera un superusuario edita o borra la auditoria', async () => {
    await expect(db.exec(`update public.audit_log set action = 'x'`)).rejects.toThrow(/append-only/)
    await expect(db.exec('delete from public.audit_log')).rejects.toThrow(/append-only/)
    await expect(db.exec('truncate public.audit_log')).rejects.toThrow(/append-only/)
  })
  it('un miembro registra un evento propio; un extrano no', async () => {
    await as(db, dentistA, (tx) => tx.query(`select public.log_event($1, 'patient.view', 'patients', $2, $2, '{"via":"ficha"}')`, [ID.clinic, P(1)]))
    const a = await rows(db, admin, `select actor_id, actor_role, patient_id from public.audit_log where action = 'patient.view'`)
    expect(a).toEqual([{ actor_id: ID.dentistA, actor_role: 'clinic_admin', patient_id: P(1) }]) // A fue ascendida a admin arriba
    await db.exec(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f8', 'extrano@x.test')`)
    await expect(as(db, { uid: '00000000-0000-4000-8000-0000000000f8' }, (tx) => tx.query(`select public.log_event($1, 'x', 'y')`, [ID.clinic]))).rejects.toThrow(/FORBIDDEN/)
  })
})

describe('Invitaciones (accept_invite)', () => {
  const hash = (t: string) => `sha256(convert_to('${t}', 'UTF8'))`
  const invite = (token: string, email: string, interval = '1 hour') =>
    db.exec(`insert into public.member_invites (clinic_id, email, role, token_hash, expires_at)
      values ('${ID.clinic}', '${email}', 'reception', ${hash(token)}, now() + interval '${interval}')`)
  const newUser = async (id: string, email: string) => db.exec(`insert into auth.users (id, email) values ('${id}', '${email}')`)
  const accept = (token: string, uid: string) => db.query<{ r: unknown }>(`select public.accept_invite(${hash(token)}, $1) as r`, [uid])

  it('crea la membresia, marca la invitacion y audita; un segundo uso falla', async () => {
    await invite('tok-ok', 'ok@alquimia.test')
    await newUser('00000000-0000-4000-8000-0000000000e1', 'ok@alquimia.test')
    const r = await accept('tok-ok', '00000000-0000-4000-8000-0000000000e1')
    expect(r.rows[0].r).toEqual({ clinic_id: ID.clinic, role: 'reception' })
    expect((await db.query(`select role, active from public.clinic_members where user_id = '00000000-0000-4000-8000-0000000000e1'`)).rows).toEqual([{ role: 'reception', active: true }])
    expect((await db.query(`select 1 from public.audit_log where action = 'member_invites.accept'`)).rows).toHaveLength(1)
    await expect(accept('tok-ok', '00000000-0000-4000-8000-0000000000e1')).rejects.toThrow(/INVITE_INVALID/)
  })
  it('una invitacion vencida no se acepta', async () => {
    await invite('tok-old', 'old@alquimia.test', '-1 hour')
    await newUser('00000000-0000-4000-8000-0000000000e2', 'old@alquimia.test')
    await expect(accept('tok-old', '00000000-0000-4000-8000-0000000000e2')).rejects.toThrow(/INVITE_INVALID/)
  })
  it('el usuario debe ser el del correo invitado', async () => {
    await invite('tok-mail', 'dueno@alquimia.test')
    await newUser('00000000-0000-4000-8000-0000000000e3', 'otro@alquimia.test')
    await expect(accept('tok-mail', '00000000-0000-4000-8000-0000000000e3')).rejects.toThrow(/INVITE_INVALID/)
  })
  it('un token inexistente no se acepta', async () => {
    await expect(accept('nunca-emitido', ID.reception)).rejects.toThrow(/INVITE_INVALID/)
  })
  it('solo service_role puede ejecutarla', async () => {
    const can = async (role: string) =>
      (await db.query<{ ok: boolean }>(`select has_function_privilege($1, 'public.accept_invite(bytea, uuid)', 'execute') as ok`, [role])).rows[0].ok
    expect(await can('anon')).toBe(false)
    expect(await can('authenticated')).toBe(false)
    expect(await can('service_role')).toBe(true)
  })
})
