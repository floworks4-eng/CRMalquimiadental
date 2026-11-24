import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const name = 'alquimia_formulario_sql_dev'
const label = 'alquimia.formulario.local-only'
const image = 'public.ecr.aws/supabase/postgres:17.6.1.167'
const database = 'alquimia_dev'
const action = process.argv[2]
if (!['start', 'status', 'reset', 'stop', 'check', 'migrations'].includes(action) || process.argv.length !== 3) {
  throw new Error('Uso: node scripts/dev-postgres.mjs start|status|reset|stop|check|migrations')
}
function docker(args, input, allowFailure = false) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) throw new Error(result.stderr || result.stdout || 'Falló Docker')
  return result
}
function inspect() {
  const result = docker(['inspect', name], undefined, true)
  if (result.status !== 0) return null
  const container = JSON.parse(result.stdout)[0]
  if (container.Config.Labels?.[label] !== 'true') throw new Error('Contenedor ajeno: operación bloqueada.')
  return container
}
function sql(query) {
  return docker(['exec', '-i', name, 'psql', '-h', '/tmp', '-U', 'postgres', '-d', database, '-X', '-v', 'ON_ERROR_STOP=1'], query).stdout
}
function reset() {
  if (!inspect()?.State.Running) throw new Error('Inicia primero el contenedor SQL de Alquimia.')
  docker(['exec', name, 'dropdb', '-h', '/tmp', '-U', 'postgres', '--if-exists', database])
  docker(['exec', name, 'createdb', '-h', '/tmp', '-U', 'postgres', database])
  const read = (path) => readFileSync(join(root, 'supabase', path), 'utf8')
  // SQL development only: auth/storage contracts are emulated, just as in PGlite tests.
  // Roles belong to the cluster and survive DROP DATABASE; this dedicated container owns them.
  sql('drop role if exists anon, authenticated, service_role;')
  sql(read('tests/supabase-shim.sql'))
  sql('create extension btree_gist with schema extensions; create extension citext with schema extensions; create extension pgcrypto with schema extensions; create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, name text not null);')
  for (const file of readdirSync(join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    const [, version, migrationName] = /^(\d+)_(.+)\.sql$/.exec(file)
    sql(`set search_path = public, extensions;\nbegin;\n${read(`migrations/${file}`)}\ninsert into supabase_migrations.schema_migrations values ('${version}', '${migrationName}');\ncommit;`)
  }
  sql(`set search_path = public, extensions;\nbegin;\n${read('seed.dev.sql')}\ncommit;`)
  console.log('Base SQL reconstruida desde migraciones y seed ficticio. Auth y Storage son contratos de prueba, sin API HTTP.')
}

if (action === 'start') {
  const previous = inspect()
  if (previous?.State.Running) {
    console.log('Base SQL local ya iniciada; no se modificaron sus datos.')
  } else {
    if (previous) docker(['rm', name])
    docker(['run', '-d', '--pull=never', '--name', name, '--label', `${label}=true`,
      '--user', '100:101', '--tmpfs', '/var/lib/postgresql/data:rw,uid=100,gid=101,mode=0700,size=384m',
      '--publish', '127.0.0.1:55322:5432', '--env', 'ALQUIMIA_DEV_PASSWORD=LocalOnly-Alquimia-2026!',
      '--entrypoint', 'sh', image, '-ec',
      'printf "%s\\n" "$ALQUIMIA_DEV_PASSWORD" > /tmp/alquimia-pw; initdb -D /var/lib/postgresql/data --auth-local=trust --auth-host=scram-sha-256 --pwfile=/tmp/alquimia-pw >/tmp/alquimia-init.log; exec postgres -D /var/lib/postgresql/data -c listen_addresses=* -c unix_socket_directories=/tmp -c shared_buffers=32MB'])
    let ready = false
    for (let attempt = 0; attempt < 30; attempt++) {
      if (docker(['exec', name, 'pg_isready', '-h', '/tmp', '-U', 'postgres'], undefined, true).status === 0) { ready = true; break }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (!ready) throw new Error('Postgres local no inició; revisar docker logs ' + name)
    reset()
  }
} else if (action === 'stop') {
  if (inspect()?.State.Running) docker(['stop', name])
  console.log('Base SQL detenida. Es desechable: start reconstruirá los datos ficticios.')
} else if (action === 'reset') {
  reset()
} else if (action === 'status') {
  console.log(JSON.stringify({ running: !!inspect()?.State.Running, container: name, host: '127.0.0.1', port: 55322, database, disposable: true }))
} else if (action === 'migrations') {
  console.log(sql('select version, name from supabase_migrations.schema_migrations order by version;'))
} else {
  if (!inspect()?.State.Running) throw new Error('Inicia primero el contenedor SQL de Alquimia.')
  const baseline = JSON.parse(readFileSync(join(root, 'supabase', 'migration-baseline.json'), 'utf8')).migrations
  const query = "select coalesce(json_agg(m order by version),'[]') from supabase_migrations.schema_migrations m;"
  const recorded = docker(['exec', '-i', name, 'psql', '-h', '/tmp', '-U', 'postgres', '-d', database, '-X', '-At', '-v', 'ON_ERROR_STOP=1'], query).stdout.trim()
  if (JSON.stringify(JSON.parse(recorded)) !== JSON.stringify(baseline)) throw new Error('Historial local distinto del baseline.')
  sql(`do $$ begin
    if exists(select 1 from auth.users where email not like '%@alquimia.test') then raise exception 'Usuarios no ficticios'; end if;
    if (select count(*) from public.clinics) <> 1 or not exists(select 1 from public.clinics where slug='alquimia-dev') then raise exception 'Clínica no ficticia'; end if;
    if to_regclass('public.ocr_documents') is not null or to_regclass('public.ocr_reviews') is not null then raise exception 'Esquema OCR no retirado'; end if;
    if not exists(select 1 from storage.buckets where id='ocr-review' and not public) then raise exception 'Bucket histórico no privado'; end if;
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and
      (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('anon',c.oid,'INSERT'))) then raise exception 'Exposición anónima o RLS desactivado'; end if;
  end $$;`)
  console.log(sql("select current_database(), (select count(*) from public.clinics) as clinics, (select count(*) from public.patients) as patients, (select count(*) from auth.users where email not like '%@alquimia.test') as unexpected_users; select to_regclass('public.ocr_documents') is null as ocr_removed, exists(select 1 from storage.buckets where id='ocr-review' and not public) as legacy_bucket_private; select count(*) as public_tables_without_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;"))
  console.log('27 migraciones coinciden con el historial remoto de referencia.')
}
