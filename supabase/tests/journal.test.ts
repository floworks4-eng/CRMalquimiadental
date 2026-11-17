import { beforeAll, describe, expect, it } from 'vitest'
import { ID, as, createDb, rows, type Db } from './harness'

let db: Db

const patientA = '00000000-0000-4000-8000-000000000101'
const patientB = '00000000-0000-4000-8000-000000000105'
const unassignedPatient = '00000000-0000-4000-8000-000000000110'
const sessionA = '00000000-0000-4000-8000-000000000401'
const sessionB = '00000000-0000-4000-8000-000000000402'
const unassignedSession = '00000000-0000-4000-8000-000000000403'
const messageA = '00000000-0000-4000-8000-000000000411'
const messageB = '00000000-0000-4000-8000-000000000412'
const unassignedMessage = '00000000-0000-4000-8000-000000000413'
const legacyFile = '00000000-0000-4000-8000-000000000421'
const sessionFile = '00000000-0000-4000-8000-000000000422'
const patientBFile = '00000000-0000-4000-8000-000000000423'

const admin = { uid: ID.admin }
const dentistA = { uid: ID.dentistA }
const dentistB = { uid: ID.dentistB }
const reception = { uid: ID.reception }

beforeAll(async () => {
  db = await createDb()
  await as(db, 'service', async (tx) => {
    await tx.query('insert into public.clinical_sessions (id, clinic_id, patient_id, title, created_by) values ($1, $2, $3, $4, $5)', [sessionA, ID.clinic, patientA, 'Consulta de Valeria', ID.dentistA])
    await tx.query('insert into public.clinical_sessions (id, clinic_id, patient_id, title, created_by) values ($1, $2, $3, $4, $5)', [sessionB, ID.clinic, patientB, 'Consulta de Sergio', ID.dentistB])
    await tx.query('insert into public.clinical_sessions (id, clinic_id, patient_id, title, created_by) values ($1, $2, $3, $4, $5)', [unassignedSession, ID.clinic, unassignedPatient, 'Paciente sin odontologo', ID.dentistA])
    await tx.query('insert into public.clinical_messages (id, clinic_id, patient_id, session_id, body, created_by) values ($1, $2, $3, $4, $5, $6)', [messageA, ID.clinic, patientA, sessionA, 'Nota privada A', ID.dentistA])
    await tx.query('insert into public.clinical_messages (id, clinic_id, patient_id, session_id, body, created_by) values ($1, $2, $3, $4, $5, $6)', [messageB, ID.clinic, patientB, sessionB, 'Nota privada B', ID.dentistB])
    await tx.query('insert into public.clinical_messages (id, clinic_id, patient_id, session_id, body, created_by) values ($1, $2, $3, $4, $5, $6)', [unassignedMessage, ID.clinic, unassignedPatient, unassignedSession, 'Nota sin asignacion', ID.dentistA])
    await tx.query(
      'insert into public.patient_files (id, clinic_id, patient_id, kind, storage_path, mime, size_bytes, sha256, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [legacyFile, ID.clinic, patientA, 'document', `${ID.clinic}/${patientA}/legacy.pdf`, 'application/pdf', 100, 'a'.repeat(64), ID.dentistA],
    )
    await tx.query(
      'insert into public.patient_files (id, clinic_id, patient_id, kind, storage_path, mime, size_bytes, sha256, uploaded_by, session_id, original_name, category, patient_visible) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
      [sessionFile, ID.clinic, patientA, 'radiograph', `${ID.clinic}/${patientA}/rx.png`, 'image/png', 100, 'b'.repeat(64), ID.dentistA, sessionA, 'rx.png', 'radiograph', false],
    )
    await tx.query(
      'insert into public.patient_files (id, clinic_id, patient_id, kind, storage_path, mime, size_bytes, sha256, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [patientBFile, ID.clinic, patientB, 'document', `${ID.clinic}/${patientB}/source.pdf`, 'application/pdf', 100, 'e'.repeat(64), ID.dentistB],
    )
  })
})

describe('clinical session journal isolation', () => {
  it('shows each dentist only their patients’ sessions and messages; reception, anon, and unassigned patients see none', async () => {
    expect((await rows(db, dentistA, 'select id from public.clinical_sessions order by id')).map((r) => r.id)).toEqual([sessionA])
    expect((await rows(db, dentistA, 'select id from public.clinical_messages order by id')).map((r) => r.id)).toEqual([messageA])
    expect((await rows(db, dentistB, 'select id from public.clinical_sessions order by id')).map((r) => r.id)).toEqual([sessionB])
    expect((await rows(db, dentistB, 'select id from public.clinical_messages order by id')).map((r) => r.id)).toEqual([messageB])
    expect(await rows(db, dentistA, 'select id from public.clinical_sessions where patient_id = $1', [unassignedPatient])).toEqual([])
    expect(await rows(db, dentistB, 'select id from public.clinical_messages where patient_id = $1', [unassignedPatient])).toEqual([])
    expect(await rows(db, reception, 'select id from public.clinical_sessions')).toEqual([])
    expect(await rows(db, reception, 'select id from public.clinical_messages')).toEqual([])
    await expect(rows(db, 'anon', 'select id from public.clinical_sessions')).rejects.toThrow(/permission denied/)
    await expect(rows(db, 'anon', 'select id from public.clinical_messages')).rejects.toThrow(/permission denied/)
  })

  it('rejects messages and files whose patient differs from their session', async () => {
    await expect(as(db, 'service', (tx) => tx.query(
      `insert into public.clinical_messages (clinic_id, patient_id, session_id, body, created_by)
       values ($1, $2, $3, 'cross-patient message', $4)`, [ID.clinic, patientB, sessionA, ID.dentistB],
    ))).rejects.toThrow(/INVALID_SESSION_PATIENT|foreign key/i)

    await expect(as(db, 'service', (tx) => tx.query(
      `insert into public.patient_files (clinic_id, patient_id, kind, storage_path, mime, size_bytes, sha256, uploaded_by, session_id)
       values ($1, $2, 'document', $3, 'application/pdf', 100, $4, $5, $6)`,
      [ID.clinic, patientB, `${ID.clinic}/${patientB}/wrong-session.pdf`, 'c'.repeat(64), ID.dentistB, sessionA],
    ))).rejects.toThrow('INVALID_SESSION_PATIENT')

    await expect(as(db, 'service', (tx) => tx.query(
      `insert into public.clinical_messages (clinic_id, patient_id, session_id, source_file_id, body, created_by)
       values ($1, $2, $3, $4, 'wrong-patient source', $5)`, [ID.clinic, patientA, sessionA, patientBFile, ID.dentistA],
    ))).rejects.toThrow('INVALID_SOURCE_PATIENT')
  })

  it('does not allow new messages or files in a closed session', async () => {
    await as(db, dentistA, (tx) => tx.query("update public.clinical_sessions set status = 'closed' where id = $1", [sessionA]))

    await expect(as(db, dentistA, (tx) => tx.query(
      `insert into public.clinical_messages (clinic_id, patient_id, session_id, body, created_by)
       values ($1, $2, $3, 'too late', $4)`, [ID.clinic, patientA, sessionA, ID.dentistA],
    ))).rejects.toThrow('SESSION_CLOSED')

    await expect(as(db, dentistA, (tx) => tx.query(
      `insert into public.patient_files (clinic_id, patient_id, kind, storage_path, mime, size_bytes, sha256, uploaded_by, session_id)
       values ($1, $2, 'document', $3, 'application/pdf', 100, $4, $5, $6)`,
      [ID.clinic, patientA, `${ID.clinic}/${patientA}/closed.pdf`, 'd'.repeat(64), ID.dentistA, sessionA],
    ))).rejects.toThrow('SESSION_CLOSED')
  })

  it('publication changes visibility only, keeps the body immutable, and retains audit records', async () => {
    const before = await rows(db, admin, "select id from public.audit_log where entity_type = 'clinical_messages' and entity_id = $1", [messageA])
    await as(db, dentistA, (tx) => tx.query('update public.clinical_messages set patient_visible = true where id = $1', [messageA]))

    await expect(as(db, dentistA, (tx) => tx.query("update public.clinical_messages set body = 'edited' where id = $1", [messageA])))
      .rejects.toThrow(/permission denied|IMMUTABLE_MESSAGE/)

    expect(await rows(db, dentistA, 'select body, patient_visible from public.clinical_messages where id = $1', [messageA]))
      .toEqual([{ body: 'Nota privada A', patient_visible: true }])
    const after = await rows(db, admin, "select id, action from public.audit_log where entity_type = 'clinical_messages' and entity_id = $1", [messageA])
    expect(after.length).toBeGreaterThan(before.length)
    expect(after.map((r) => r.id)).toEqual(expect.arrayContaining(before.map((r) => r.id)))
    expect(after.map((r) => r.action)).toContain('clinical_messages.update')
  })

  it('keeps pre-existing patient files without a session', async () => {
    expect(await rows(db, dentistA, 'select id, session_id from public.patient_files where id = $1', [legacyFile]))
      .toEqual([{ id: legacyFile, session_id: null }])
    expect(await rows(db, dentistA, 'select id, session_id from public.patient_files where id = $1', [sessionFile]))
      .toEqual([{ id: sessionFile, session_id: sessionA }])
    expect(await rows(db, reception, 'select id from public.patient_files')).toEqual([])
  })
})
