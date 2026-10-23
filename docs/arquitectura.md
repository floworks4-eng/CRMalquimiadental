# Arquitectura (Fase 1)

Resumen operativo. El detalle y los criterios de aceptación están en [`fase1-brief.md`](fase1-brief.md) (secciones 4, 5 y 8).

## Ramas y entornos

| Rama / tag | Uso |
|---|---|
| `demo-v1` (tag) y `demo` (rama) | Demo comercial congelada: datos ficticios en `localStorage`. Se sigue desplegando desde aquí para ventas |
| `main` | Producción (Fase 1). Protegida: solo por PR con CI verde |
| `staging` | Pruebas y UAT con datos ficticios o anonimizados |
| `feat/F1-xx-*` | Una tarea o grupo de tareas del brief |

Nunca se copian datos de producción a staging sin anonimizar ni se prueba con datos reales en local.

## Capas

- **Servidor primero:** lecturas en Server Components, escrituras en Server Actions o RPC de Postgres.
- **RLS como defensa principal**; las acciones revalidan permiso y reglas.
- **DTOs explícitos** por pantalla y rol. El navegador nunca recibe un registro clínico completo.
- **Una transacción por caso de uso** (check-in, reserva pública, cierre de atención, cierre de caja), idempotente.
- Fechas en UTC (`timestamptz`), visualización en `America/La_Paz`. Dinero en centavos enteros (BOB).

## Estado actual (Sprint 1)

Base de datos (`supabase/migrations`, aplicadas en orden por `supabase db reset`):

| Migracion | Contenido |
|---|---|
| 0001 | Extensiones, enums y privilegios por defecto cerrados (nada nace abierto) |
| 0002 | Clinica, perfiles, miembros, invitaciones; "siempre un admin activo" |
| 0003 | Horarios (una sola fuente), feriados, gabinetes, turnos |
| 0004 | Catalogo de tratamientos e insumos, recetas |
| 0005 | Pacientes, agenda con exclusion de solapamientos, anamnesis versionada, encuentros, hallazgos, plan, archivos |
| 0006 | Funciones de permiso (`is_staff`, `can_read_clinical`, …), RLS en todas las tablas, grants por columna |
| 0007 | `audit_log` append-only, trigger generico y `log_event()` |
| 0008 | Buckets y politicas de Storage (ruta `{clinic}/{patient}/archivo`) |
| 0009 | `accept_invite()` atomica, solo `service_role` |

Servidor (`src/server`): clientes Supabase (`server`, `admin` con `server-only`, `proxy`), `auth/{session,guards,permissions}`,
Server Actions de autenticacion e invitaciones, esquemas Zod. Rutas nuevas: `/login`, `/mfa`, `/recuperar`, `/recuperar/nueva`,
`/invitacion/[token]`, `/forbidden`, `/cuenta`, `/api/auth/callback`. La demo sigue en las demas rutas hasta que cada vertical la reemplace.

## Como se verifica sin Docker

`supabase/tests/` corre las migraciones y el seed en **PGlite** (Postgres en WASM) sobre una emulacion minima de Supabase
(`supabase-shim.sql`: roles, `auth.uid()/jwt()`, `storage`). Cubre RLS por rol, MFA (aal1/aal2), aislamiento entre clinicas y
odontologos, restricciones de agenda, triggers y auditoria. **No sustituye** una corrida contra Supabase real: `db reset` y `db lint`
con Docker, y el flujo de login/TOTP contra GoTrue, siguen pendientes (ver `docs/seguridad.md`).

## Desviaciones deliberadas del brief

1. **Tablas adelantadas:** `patients`, `appointments`, anamnesis, encuentros, hallazgos, plan y archivos se crean en el Sprint 1 (el brief las pone en 2 y 4)
   porque el Gate G1 prueba RLS sobre ellas y las funciones de permiso las referencian. La logica llega en sus sprints.
2. **Grant de `patients`:** el brief omitia en el `SELECT` columnas que si deja editar (email, sexo, direccion); se incluyen. Los datos clinicos
   viven en otras tablas, por eso Recepcion los ve sin riesgo.
3. **Invitaciones:** se usa un token propio (hash en `member_invites`) y `auth.admin.createUser` al aceptar, en lugar de `inviteUserByEmail`,
   porque este ultimo no soporta PKCE y entrega los tokens en el fragmento de la URL, ilegible para el servidor. El enlace se muestra al admin
   para compartirlo; el envio por correo (Resend) queda para despues.
4. **`pgcrypto`** solo se usa en el seed; hashes y UUID usan funciones nativas (`sha256`, `gen_random_uuid`). `pg_trgm` no se instala (no hace falta en Fase 1).
5. **Acciones de auditoria** se nombran `tabla.create|update|delete` (p. ej. `patients.create`).
