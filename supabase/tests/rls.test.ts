// F1-021 · Matriz RLS (Gate G1). Lectura: no muta datos. Se corre sobre PGlite + emulacion de Supabase.
import { beforeAll, describe, expect, it } from 'vitest'
import { ID, as, createDb, rows, type Db } from './harness'

let db: Db
const P = (n: number) => `00000000-0000-4000-8000-000000000${100 + n}` // paciente 1..12
const admin = { uid: ID.admin }
const dentistA = { uid: ID.dentistA }
const dentistB = { uid: ID.dentistB }
const reception = { uid: ID.reception }
const ids = (r: Record<string, unknown>[]) => r.map((x) => x.id as string).sort()
const count = async (actor: Parameters<typeof rows>[1], table: string) => (await rows(db, actor, `select 1 from public.${table}`)).length

beforeAll(async () => {
  db = await createDb()
})

describe('G1 · anon no ve nada', () => {
  it('no tiene privilegios sobre ninguna tabla ni vista de public', async () => {
    const { rows: tables } = await db.query<{ t: string }>(
      `select format('public.%I', c.relname) as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')`,
    )
    expect(tables.length).toBeGreaterThan(20)
    for (const { t } of tables) {
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        const { rows: r } = await db.query<{ ok: boolean }>('select has_table_privilege($1, $2, $3) as ok', ['anon', t, priv])
        expect(r[0].ok, `anon ${priv} ${t}`).toBe(false)
      }
    }
  })
  it('no puede ejecutar funciones de permiso ni log_event', async () => {
    for (const fn of ['public.is_member(uuid)', 'public.can_read_clinical(uuid)', 'public.has_mfa()', 'public.log_event(uuid,text,text,uuid,uuid,jsonb)']) {
      const { rows: r } = await db.query<{ ok: boolean }>('select has_function_privilege($1, $2, $3) as ok', ['anon', fn, 'execute'])
      expect(r[0].ok, fn).toBe(false)
    }
  })
  it('una consulta directa falla', async () => {
    await expect(rows(db, 'anon', 'select * from public.patients')).rejects.toThrow(/permission denied/)
  })
  it('todas las tablas de public tienen RLS activo', async () => {
    const { rows: r } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
    )
    expect(r).toEqual([])
  })
})

describe('G1 · Recepcion no ve datos clinicos', () => {
  it('ve el directorio de pacientes', async () => {
    expect(await count(reception, 'patients')).toBe(12)
  })
  it.each(['anamnesis_versions', 'v_current_anamnesis', 'encounters', 'tooth_findings', 'treatment_plan_items', 'patient_files'])('%s: 0 filas', async (t) => {
    expect(await count(reception, t)).toBe(0)
  })
  it('ve la agenda completa del dia', async () => {
    expect(await count(reception, 'appointments')).toBe(5)
  })
  it('no puede insertar anamnesis', async () => {
    await expect(
      as(db, reception, (tx) =>
        tx.query('insert into public.anamnesis_versions (patient_id, allergies, submitted_by) values ($1, $2, $3)', [P(1), ['Ninguna'], ID.reception]),
      ),
    ).rejects.toThrow(/row-level security/)
  })
  it('no lee auditoria ni invitaciones', async () => {
    expect(await count(reception, 'audit_log')).toBe(0)
    expect(await count(reception, 'member_invites')).toBe(0)
    expect(await count(reception, 'suppliers')).toBe(0)
  })
  it('no puede cambiar el catalogo ni roles', async () => {
    const upd = await as(db, reception, (tx) => tx.query("update public.treatments set price_cents = 1 where code = 'limpieza'"))
    expect(upd.affectedRows).toBe(0)
    const role = await as(db, reception, (tx) => tx.query("update public.clinic_members set role = 'clinic_admin' where user_id = $1", [ID.reception]))
    expect(role.affectedRows).toBe(0)
  })
  it('sin segundo factor (decision de la clinica, 0013) ve lo mismo que con el: el rol es lo que limita', async () => {
    const aal1 = { uid: ID.reception, aal: 'aal1' as const }
    for (const t of ['patients', 'appointments', 'treatments', 'cabinets']) expect(await count(aal1, t), t).toBe(await count(reception, t))
    expect(await count(aal1, 'anamnesis_versions')).toBe(0)
  })
})

describe('G1 · aislamiento entre odontologos', () => {
  it('la Dra. A ve solo sus pacientes', async () => {
    expect(ids(await rows(db, dentistA, 'select id from public.patients'))).toEqual([P(1), P(2), P(3), P(4)])
  })
  it('el Dr. B ve los suyos y al que le agendaron', async () => {
    expect(ids(await rows(db, dentistB, 'select id from public.patients'))).toEqual([P(5), P(6), P(7), P(8), P(9)])
  })
  it('anamnesis: cada uno solo la de sus pacientes', async () => {
    expect((await rows(db, dentistA, 'select patient_id from public.anamnesis_versions')).map((r) => r.patient_id)).toEqual([P(1)])
    expect((await rows(db, dentistB, 'select patient_id from public.anamnesis_versions')).map((r) => r.patient_id)).toEqual([P(5)])
  })
  it('encuentro y hallazgos del Dr. B no son visibles para la Dra. A', async () => {
    expect(await count(dentistA, 'encounters')).toBe(0)
    expect(await count(dentistA, 'tooth_findings')).toBe(0)
    expect(await count(dentistB, 'encounters')).toBe(1)
    expect(await count(dentistB, 'tooth_findings')).toBe(1)
  })
  it('cada odontologo ve solo su agenda', async () => {
    expect(await count(dentistA, 'appointments')).toBe(2)
    expect(await count(dentistB, 'appointments')).toBe(3)
  })
  it('un odontologo no lee auditoria ni escribe catalogo', async () => {
    expect(await count(dentistA, 'audit_log')).toBe(0)
    const upd = await as(db, dentistA, (tx) => tx.query("update public.treatments set price_cents = 1 where code = 'limpieza'"))
    expect(upd.affectedRows).toBe(0)
  })
  it('lee el catalogo y los gabinetes', async () => {
    expect(await count(dentistA, 'treatments')).toBe(10)
    expect(await count(dentistA, 'cabinets')).toBe(3)
  })
})

describe('G1 · el administrador ve todo', () => {
  it.each([
    ['patients', 12],
    ['appointments', 5],
    ['anamnesis_versions', 2],
    ['encounters', 1],
    ['tooth_findings', 1],
    ['treatments', 10],
    ['clinic_members', 4],
  ])('%s: %i filas', async (t, n) => {
    expect(await count(admin, t)).toBe(n)
  })
  it('lee la auditoria', async () => {
    expect(await count(admin, 'audit_log')).toBeGreaterThan(0)
  })
})

describe('Aislamiento entre clinicas', () => {
  const clinic2 = '00000000-0000-4000-8000-0000000000c2'
  const admin2 = '00000000-0000-4000-8000-0000000000f1'
  beforeAll(async () => {
    await db.exec(`
      insert into public.clinics (id, slug, name) values ('${clinic2}', 'otra-clinica', 'Otra clinica');
      insert into auth.users (id, email) values ('${admin2}', 'admin2@otra.test');
      insert into public.clinic_members (clinic_id, user_id, role) values ('${clinic2}', '${admin2}', 'clinic_admin');
    `)
  })
  it('el admin de otra clinica no ve nada de Alquimia', async () => {
    const other = { uid: admin2 }
    for (const t of ['patients', 'appointments', 'anamnesis_versions', 'treatments', 'cabinets']) {
      expect(await count(other, t), t).toBe(0)
    }
    // La auditoria de su propia clinica si; la de Alquimia, nunca.
    const audit = await rows(db, other, 'select distinct clinic_id from public.audit_log')
    expect(audit.every((r) => r.clinic_id === clinic2)).toBe(true)
    expect(ids(await rows(db, other, 'select id from public.clinics'))).toEqual([clinic2])
    expect((await rows(db, other, 'select user_id from public.clinic_members')).length).toBe(1)
  })
  it('tampoco puede crear pacientes en Alquimia', async () => {
    await expect(
      as(db, { uid: admin2 }, (tx) =>
        tx.query('insert into public.patients (clinic_id, full_name, created_by) values ($1, $2, $3)', [ID.clinic, 'Intruso Prueba', admin2]),
      ),
    ).rejects.toThrow(/row-level security/)
  })
  it('y el personal de Alquimia no ve la otra clinica', async () => {
    expect(ids(await rows(db, admin, 'select id from public.clinics'))).toEqual([ID.clinic])
  })
})

describe('Privilegios de columna y tabla', () => {
  const priv = async (role: string, obj: string, p: string, col?: string) =>
    (
      await db.query<{ ok: boolean }>(
        col ? 'select has_column_privilege($1, $2, $3, $4) as ok' : 'select has_table_privilege($1, $2, $3) as ok',
        col ? [role, obj, col, p] : [role, obj, p],
      )
    ).rows[0].ok
  it('token_hash de invitaciones no es legible', async () => {
    expect(await priv('authenticated', 'public.member_invites', 'select', 'token_hash')).toBe(false)
    expect(await priv('authenticated', 'public.member_invites', 'select', 'email')).toBe(true)
  })
  it('first_source y first_campaign_id de pacientes son inmutables para el cliente', async () => {
    expect(await priv('authenticated', 'public.patients', 'update', 'first_source')).toBe(false)
    expect(await priv('authenticated', 'public.patients', 'update', 'first_campaign_id')).toBe(false)
  })
  it('checked_in_at/started_at/completed_at de citas solo por RPC', async () => {
    for (const c of ['checked_in_at', 'started_at', 'completed_at']) expect(await priv('authenticated', 'public.appointments', 'update', c)).toBe(false)
  })
  it('el estado de un encuentro no se cambia directamente', async () => {
    expect(await priv('authenticated', 'public.encounters', 'update', 'status')).toBe(false)
  })
  it('auditoria: ni insertar, ni editar ni borrar desde el cliente', async () => {
    for (const p of ['insert', 'update', 'delete']) expect(await priv('authenticated', 'public.audit_log', p), p).toBe(false)
  })
  it('un usuario edita su perfil pero no el de otros', async () => {
    const own = await as(db, reception, (tx) => tx.query("update public.profiles set full_name = 'Paola C.' where id = $1", [ID.reception]))
    expect(own.affectedRows).toBe(1)
    const other = await as(db, reception, (tx) => tx.query("update public.profiles set full_name = 'Hack' where id = $1", [ID.admin]))
    expect(other.affectedRows).toBe(0)
  })
})

describe('Storage clinico', () => {
  const file = (patient: string) => `${ID.clinic}/${patient}/radiografia.pdf`
  beforeAll(async () => {
    await db.exec(
      `insert into storage.objects (bucket_id, name) values ('clinical', '${file(P(1))}'), ('clinical', '${file(P(5))}'), ('clinical', 'ruta-mal-formada.pdf')`,
    )
  })
  const names = async (actor: Parameters<typeof rows>[1]) => (await rows(db, actor, 'select name from storage.objects')).map((r) => r.name)
  it('cada odontologo solo ve archivos de sus pacientes', async () => {
    expect(await names(dentistA)).toEqual([file(P(1))])
    expect(await names(dentistB)).toEqual([file(P(5))])
  })
  it('recepcion no ve ninguno; admin ve los bien formados', async () => {
    expect(await names(reception)).toEqual([])
    expect((await names(admin)).sort()).toEqual([file(P(1)), file(P(5))].sort())
  })
  it('anon no ve ninguno', async () => {
    expect(await names('anon')).toEqual([])
  })
})
