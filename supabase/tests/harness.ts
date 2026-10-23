import { PGlite, type Transaction } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'supabase')
const read = (p: string) => readFileSync(join(dir, p), 'utf8')

// Las migraciones se aplican en orden, igual que `supabase db reset`.
export async function createDb({ seed = true } = {}) {
  const db = new PGlite({ extensions: { btree_gist, citext, pgcrypto } })
  await db.exec(read('tests/supabase-shim.sql'))
  await db.exec('set search_path = public, extensions')
  for (const f of readdirSync(join(dir, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(read(`migrations/${f}`))
  if (seed) await db.exec(read('seed.dev.sql'))
  return db
}

export type Db = PGlite

export const ID = {
  clinic: '00000000-0000-4000-8000-0000000000c1',
  admin: '00000000-0000-4000-8000-0000000000a1',
  dentistA: '00000000-0000-4000-8000-0000000000a2',
  dentistB: '00000000-0000-4000-8000-0000000000a3',
  reception: '00000000-0000-4000-8000-0000000000a4',
} as const

export type Actor = 'anon' | { uid: string; aal?: 'aal1' | 'aal2' }

/** Ejecuta `fn` como ese usuario (rol Postgres + JWT), dentro de una transaccion. */
export async function as<T>(db: Db, actor: Actor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (actor === 'anon') {
      await tx.exec('set local role anon')
    } else {
      await tx.exec('set local role authenticated')
      const claims = JSON.stringify({ sub: actor.uid, role: 'authenticated', aal: actor.aal ?? 'aal2' })
      await tx.query("select set_config('request.jwt.claims', $1, true)", [claims])
    }
    return fn(tx)
  })
}

/** Filas visibles de una consulta para ese actor. */
export async function rows(db: Db, actor: Actor, sql: string, params: unknown[] = []) {
  return as(db, actor, async (tx) => (await tx.query(sql, params)).rows as Record<string, unknown>[])
}
