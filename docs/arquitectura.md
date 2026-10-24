# Arquitectura (Fase 1)

Resumen operativo. El detalle y los criterios de aceptación están en [`fase1-brief.md`](fase1-brief.md) (secciones 4, 5 y 8).

## Ramas y entornos

| Rama / tag | Uso |
|---|---|
| `demo-v1` (tag) y `demo` (rama) | Demo comercial congelada: datos ficticios en `localStorage`. No se toca |
| `main` | Producción (Fase 1). Protegida: solo por PR con CI verde |
| `staging` | Pruebas y UAT con datos ficticios o anonimizados |
| `feat/F1-xx-*` | Una tarea o grupo de tareas del brief |

Nunca se copian datos de producción a staging sin anonimizar ni se prueba con datos reales en local.

## Capas

- **Servidor primero:** lecturas en Server Components, escrituras en Server Actions o RPC de Postgres.
- **RLS como defensa principal**; las acciones revalidan permiso y reglas.
- **DTOs explícitos** por pantalla y rol. El navegador nunca recibe un registro clínico completo.
- **Una transacción por caso de uso** (iniciar y cerrar atención, cobrar, anular, caja, stock), idempotente donde hay dinero.
- Fechas en UTC (`timestamptz`), visualización en `America/La_Paz`. Dinero en centavos enteros (BOB).

## Sprint 1 — Fundación

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
Server Actions de autenticacion e invitaciones, esquemas Zod. Rutas: `/login`, `/recuperar`, `/recuperar/nueva`,
`/invitacion/[token]`, `/forbidden`, `/cuenta`, `/api/auth/callback`.

## Sprint 2 — Pacientes y agenda

Migracion `0010_agenda.sql`: `appointment_events`, `notifications`, `within_availability()`, `available_slots()` y las RPC
`create_appointment`, `reschedule_appointment`, `change_appointment_status`. **Las citas ya no se escriben directo desde el cliente**
(se revoco INSERT/UPDATE): toda regla vive en esas funciones.

- Disponibilidad: horario de la clinica ∩ turno del odontologo − feriados − ausencias − citas del odontologo y del gabinete; paso de 30 min,
  nunca en el pasado. Un odontologo sin turnos definidos atiende en el horario de la clinica.
- Una cita da acceso clinico al odontologo (`is_patient_dentist`). Por eso un odontologo solo agenda a **sus** pacientes; asignar a otro lo hace recepcion o admin.
  (El brief no lo contemplaba: sin esa regla un odontologo podia autoasignarse cualquier paciente y leer su historia.)
- Maquina de estados en SQL con espejo en `src/lib/domain/status.ts`; `supabase/tests/status-parity.test.ts` verifica las 147 combinaciones.
- Pantallas reales: `/agenda` (rejilla por gabinete con teclado, pestañas ARIA en celular), `/pacientes` (busqueda, filtros, paginacion, alta),
  `/pacientes/[id]`, `/recepcion` (sala de espera por orden de llegada, actualiza cada 10 s), campana de notificaciones (cada 15 s).


## Sprint 3 — Check-in y portal publico (retirado)

Se construyo (migracion 0011: check-in por QR, reserva en linea, consentimientos firmados, atribucion) y se **retiro en la
primera version** por decision de la clinica: el sistema es solo para el personal. La migracion 0013 elimina esas tablas y
funciones; el historial queda en git (commit `d1662df`).

## Primera version (24/10/2026) — decisiones de la clinica

1. **Solo personal.** Sin paginas publicas: todo el sitio exige sesion (`src/proxy.ts`, lista corta de rutas publicas: login,
   recuperar, invitacion, configuracion inicial). La anamnesis la carga el equipo en la ficha (nueva version, no se sobrescribe).
2. **Sin verificacion en dos pasos.** `has_mfa()` responde "hay sesion" (0013). Para volver a exigirla basta con restaurar su
   version de 0006 y la pantalla `/mfa` (historial de git); las politicas no cambian.
3. **Sin demo.** Se eliminaron las pantallas con datos en `localStorage`, el odontograma 3D y sus dependencias (three, R3F).
4. **Base vacia al empezar.** `/configuracion-inicial` crea la clinica y el administrador (RPC `setup_clinic`, solo
   `service_role`, bloqueo para envios simultaneos) y se cierra sola. Deja horario base y un gabinete, editables.

## Sprint 4 — Consulta, caja e inventario

Migracion `0014_consulta_caja_inventario.sql`:

| Tabla / funcion | Para que |
|---|---|
| `encounter_addenda` | Correcciones a una atencion cerrada (con motivo); la historia cerrada no se edita |
| `supply_lots`, `stock_movements`, `v_stock` | Stock por lote. El saldo solo cambia por movimientos (trigger); el lote nunca queda negativo |
| `invoices`, `invoice_items`, `invoice_counters` | Factura interna `ALQ-AAAA-000001` por clinica y año; precio congelado |
| `payments`, `transactions`, `cash_sessions` | Cobros, libro de caja (no se edita: se corrige con otro movimiento), una caja abierta por clinica |
| `operation_results` | Respuesta guardada por clave de idempotencia |
| `start_encounter` | Desde programada/confirmada/en sala; el tratamiento de la cita entra al plan "hoy" |
| `finish_encounter` | Todo o nada: factura, insumos FEFO, pago, plan, cita, auditoria, aviso de stock bajo; `STOCK_SHORTAGE` con lista |
| `record_payment`, `void_payment` | Cobrar saldo; anular (solo admin, motivo, movimiento negativo) |
| `open_cash_session`, `close_cash_session`, `cash_expected`, `add_cash_movement` | Caja: esperado = fondo + entradas − salidas en efectivo |
| `receive_stock`, `adjust_stock` | Ingreso por lote (admin); ajuste, merma o devolucion con motivo |

- Plan: `in_progress` = se hace hoy, `planned` = proxima sesion, `done` lo marca solo `finish_encounter`. El precio lo pone un
  trigger con la tarifa vigente: el navegador no lo decide.
- Si entra efectivo sin caja abierta, se abre sola con fondo 0 y se avisa al admin.
- Descuentos: solo admin y con motivo.

Pantallas: `/inicio`, `/consulta`, `/consulta/[cita]`, `/caja`, `/inventario`, `/configuracion` (clinica, horarios y gabinetes,
tratamientos y recetas, equipo y turnos, importar pacientes), ficha del paciente con historia clinica y cuenta.

## Sprint 5 — Endurecimiento

- Cabeceras: CSP (`connect-src 'self'`: el navegador nunca habla con Supabase), `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, `X-Robots-Tag: noindex`, HSTS en https, sin `X-Powered-By` (`next.config.ts`).
- Importador CSV de pacientes con vista previa, validacion igual al alta manual, deduplicacion por celular y auditoria.
- Runbooks en [`operacion.md`](operacion.md).

## Como se verifica sin Docker

`supabase/tests/` corre las migraciones y el seed en **PGlite** (Postgres en WASM) sobre una emulacion minima de Supabase
(`supabase-shim.sql`: roles, `auth.uid()/jwt()`, `storage`). Cubre RLS por rol, aislamiento entre clinicas y odontologos,
agenda, consulta, facturacion, caja, inventario, triggers y auditoria.

Ademas, el 24/10/2026 se verifico contra el **Supabase real** (proyecto CRMdoc): las 16 migraciones aplicadas, `db lint` limpio y
un flujo completo con usuarios temporales (configuracion inicial, invitaciones, cita, llegada, atencion, factura con pago
parcial, reintento sin doble cobro, descuento de stock, caja que se abre sola, cobro del saldo, gasto, cierre cuadrado,
auditoria). Despues se vacio la base.

## Desviaciones deliberadas del brief

1. **Tablas adelantadas:** `patients`, `appointments`, anamnesis, encuentros, hallazgos, plan y archivos se crean en el Sprint 1 (el brief las pone en 2 y 4)
   porque el Gate G1 prueba RLS sobre ellas y las funciones de permiso las referencian. La logica llega en sus sprints.
2. **Grant de `patients`:** el brief omitia en el `SELECT` columnas que si deja editar (email, sexo, direccion); se incluyen. Los datos clinicos
   viven en otras tablas, por eso Recepcion los ve sin riesgo.
3. **Invitaciones:** se usa un token propio (hash en `member_invites`) y `auth.admin.createUser` al aceptar, en lugar de `inviteUserByEmail`,
   porque este ultimo no soporta PKCE y entrega los tokens en el fragmento de la URL, ilegible para el servidor. El enlace se muestra al admin
   para compartirlo por WhatsApp o correo.
4. **`pgcrypto`** solo se usa en el seed; hashes y UUID usan funciones nativas (`sha256`, `gen_random_uuid`). `pg_trgm` no se instala (no hace falta en Fase 1).
5. **Acciones de auditoria** se nombran `tabla.create|update|delete` (p. ej. `patients.create`).
