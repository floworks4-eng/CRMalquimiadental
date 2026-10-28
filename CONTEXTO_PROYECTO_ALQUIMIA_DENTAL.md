# Alquimia Dental — contexto integral del proyecto

> Documento generado a partir del estado del repositorio inspeccionado el **28/10/2026**.
> Describe la implementación actual, no una especificación futura.

## 1. Identidad y propósito

Alquimia Dental es un sistema interno para la operación de una clínica dental ubicada en San Miguel, La Paz. Está pensado para el Doc y su equipo; los pacientes no ingresan al sistema. La aplicación centraliza:

- operación diaria y tablero de inicio;
- agenda, disponibilidad y recepción;
- directorio y ficha de pacientes;
- anamnesis, odontograma e historial clínico;
- consulta odontológica y plan de tratamiento;
- inventario de insumos por lotes;
- facturación, cobros y caja;
- configuración de clínica, tratamientos, equipo e importación de pacientes;
- auditoría y control de acceso por rol.

La demo comercial anterior quedó congelada en la rama/tag `demo` / `demo-v1`. La versión actual es la Fase 1 real, basada en Next.js y Supabase.

## 2. Estado del repositorio

El repositorio tiene una aplicación funcional con 17 migraciones de Supabase, Server Actions, consultas server-side, componentes React, pruebas unitarias, pruebas de base de datos sobre PGlite y pruebas E2E con Playwright.

Al momento de generar este documento había cambios locales no committeados:

- modificados: `src/app/globals.css`, `src/components/configuracion/team-tab.tsx`, `src/components/patients/patient-clinical.tsx`, `src/server/queries/clinical.ts`;
- nueva ruta/carpeta: `src/app/api/patients/`.

Estos cambios pertenecen al estado de trabajo del usuario y no fueron alterados por la generación de este documento.

## 3. Funcionalidades por módulo

### Inicio — `/inicio`

Dashboard para todos los roles. Muestra citas del día, sala de espera, ingresos y saldos de caja, alertas de stock bajo y primeros pasos de configuración.

Implementación principal:

- página: `src/app/(app)/inicio/page.tsx`;
- consulta: `src/server/queries/dashboard.ts`;
- tipos: `Dashboard`;
- navegación y shell: `src/components/app-shell.tsx`.

### Agenda — `/agenda`

- vista diaria por gabinete;
- citas por odontólogo y gabinete;
- cálculo de horarios disponibles reales;
- creación, reprogramación y cambio de estado;
- prevención de doble reserva en base de datos;
- filtro de citas del odontólogo cuando el rol no puede ver toda la agenda;
- fuentes de origen: WhatsApp, web, campaña, teléfono, walk-in, referido e histórico;
- estados: programada, confirmada, llegada, en curso, atendida, no-show y cancelada;
- notificaciones asociadas a cambios relevantes.

Archivos principales:

- `src/app/(app)/agenda/page.tsx`;
- `src/components/agenda/agenda-board.tsx`;
- `src/components/agenda/appointment-dialog.tsx`;
- `src/components/agenda/appointment-panel.tsx`;
- `src/server/queries/agenda.ts`;
- `src/server/actions/agenda.ts`;
- `src/server/schemas/agenda.ts`;
- `src/lib/domain/status.ts` y `src/lib/domain/time.ts`.

La disponibilidad cruza horario de clínica, turnos del odontólogo, feriados, ausencias, citas existentes y gabinete. Usa intervalos de 30 minutos, excluye el pasado y maneja fechas en UTC con visualización en `America/La_Paz`.

### Recepción — `/recepcion`

Tablero de llegadas del día para administrador y recepción.

- confirma citas;
- marca “Llegó”;
- organiza la sala de espera por orden de llegada;
- avisa al odontólogo mediante notificaciones;
- se actualiza cada 10 segundos.

Archivo principal: `src/components/agenda/reception-board.tsx`.

### Pacientes — `/pacientes` y `/pacientes/[id]`

Directorio con búsqueda, filtros, paginación y alta de pacientes.

La ficha individual incluye:

- datos de contacto y demográficos;
- estado: nuevo, activo, en tratamiento o inactivo;
- próxima cita;
- anamnesis versionada;
- odontograma acumulado;
- hallazgos por pieza y superficie;
- plan de tratamiento pendiente;
- atenciones;
- notas clínicas e historial importado;
- archivos clínicos;
- facturas, pagos y saldo;
- asignación de odontólogo según permisos.

Archivos principales:

- `src/components/patients/patients-view.tsx`;
- `src/components/patients/patient-form.tsx`;
- `src/components/patients/patient-detail.tsx`;
- `src/components/patients/patient-clinical.tsx`;
- `src/components/patients/anamnesis-card.tsx`;
- `src/server/queries/patients.ts`;
- `src/server/actions/patients.ts`;
- `src/server/schemas/patients.ts`.

La anamnesis no se sobrescribe: cada guardado genera una nueva versión. El historial importado y las notas conservan su origen.

### Consulta — `/consulta`, `/consulta/[id]`

Permite iniciar y cerrar una atención odontológica.

Durante la atención se puede:

- iniciar la atención desde una cita programada, confirmada o llegada;
- registrar motivo de consulta y notas;
- registrar hallazgos por diente, condición y superficie;
- consultar y modificar el odontograma acumulado;
- agregar tratamientos al plan;
- separar tratamientos para hoy y próximas sesiones;
- revisar insumos requeridos;
- finalizar y cobrar total o parcialmente;
- agregar correcciones posteriores mediante una adenda con motivo.

El cierre es transaccional y todo-o-nada. En una misma operación puede crear factura correlativa, fijar precios, descontar insumos FEFO, registrar pago, actualizar el plan, marcar la cita como atendida, escribir auditoría y avisar sobre stock bajo. Si faltan insumos, no se cierra la atención.

Archivos principales:

- `src/components/consulta/consulta-view.tsx`;
- `src/components/odontogram.tsx`;
- `src/server/queries/clinical.ts`;
- `src/server/actions/clinical.ts`;
- `src/server/schemas/operations.ts`;
- `src/lib/domain/clinical.ts`;
- `src/lib/teeth.ts`.

### Caja — `/caja`

Disponible para administrador y recepción.

- apertura de caja con fondo inicial;
- cobro total o parcial de facturas;
- métodos: efectivo, QR, transferencia y tarjeta;
- saldos pendientes;
- gastos y otros movimientos;
- anulación de cobros por administrador, siempre con motivo;
- cálculo de efectivo esperado;
- arqueo y cierre con diferencia explicada;
- una sola caja abierta por clínica;
- apertura automática con fondo cero si entra efectivo sin caja abierta, con aviso al administrador.

Archivos principales: `src/components/caja/caja-view.tsx`, `src/server/queries/billing.ts` y `src/server/actions/billing.ts`.

Las operaciones monetarias son idempotentes. Un reintento por doble clic o caída de red no debe cobrar dos veces.

### Inventario — `/inventario`

- catálogo de insumos;
- stock por lote;
- fecha de vencimiento;
- costo unitario;
- proveedor;
- recepción de stock;
- ajustes, mermas y devoluciones con motivo;
- movimientos de inventario;
- criterio FEFO: primero se descuenta el lote que vence antes;
- saldo protegido para que ningún lote quede negativo.

Todos los roles pueden leer. Solo el administrador puede modificar.

Archivos principales: `src/components/inventario/inventory-view.tsx`, `src/server/queries/inventory.ts` y `src/server/actions/inventory.ts`.

### Configuración — `/configuracion`

Solo administrador.

Pestañas implementadas:

- **Clínica:** nombre y datos generales;
- **Horarios y gabinetes:** horario base, feriados, gabinetes activos;
- **Tratamientos y precios:** categorías, tratamientos, precios y recetas de insumos;
- **Equipo:** miembros, roles, estado activo, contraseñas y turnos;
- **Importar pacientes e historial:** carga CSV con vista previa, validación, deduplicación por celular y auditoría.

Archivos principales: `src/components/configuracion/settings-view.tsx`, `team-tab.tsx`, `import-patients.tsx`, `use-save.tsx`, `src/server/actions/settings.ts` y `members.ts`.

### Autenticación y cuenta

Rutas:

- `/login`;
- `/recuperar`;
- `/recuperar/nueva`;
- `/configuracion-inicial`;
- `/cuenta`;
- `/forbidden`.

Funciones:

- acceso por correo y contraseña;
- recuperación y actualización de contraseña;
- creación inicial de clínica y administrador;
- invitaciones de equipo de un solo uso y con vencimiento;
- desactivación de miembros sin borrar su historial;
- protección para que siempre exista al menos un administrador activo.

No hay registro público de pacientes ni portal público operativo.

## 4. Roles y permisos

Los roles son `clinic_admin`, `dentist` y `reception`.

| Capacidad | Administrador | Odontólogo | Recepción |
|---|---:|---:|---:|
| Inicio | todo | todo | todo |
| Agenda | todas | propias | todas |
| Pacientes de contacto | todos | propios | todos |
| Anamnesis, odontograma, notas y plan | sí | propios | no |
| Iniciar/finalizar consulta | sí | propias | no |
| Facturas y saldos | todos | propios | todos |
| Caja | sí | no | sí |
| Descuentos y anulaciones | sí | no | no |
| Inventario | leer/escribir | leer | leer |
| Configuración y equipo | sí | no | no |
| Auditoría | sí | no | no |

La autorización real está en RLS y en las funciones server-side. La función `can()` del frontend solo sirve para ocultar o mostrar controles; no es una frontera de seguridad.

Archivos: `src/server/auth/permissions.ts`, `guards.ts`, `session.ts`, `home.ts`.

## 5. Arquitectura técnica

### Frontend y runtime

- Next.js `^16.4.0` con App Router;
- React `^19.3.0` y React DOM;
- TypeScript estricto;
- Server Components para lecturas;
- Client Components para formularios, modales, agenda, odontograma y vistas interactivas;
- Server Actions para escrituras;
- Route Handlers para callbacks y archivos;
- alias TypeScript `@/*` apuntando a `src/*`.

La versión de Next.js incluye cambios respecto de versiones anteriores. Las guías locales están en `node_modules/next/dist/docs/` y las convenciones deben verificarse ahí antes de modificar código Next.

### Backend

- Supabase Auth para identidad y sesiones;
- Supabase Postgres para datos y RPC;
- `@supabase/ssr` para cookies y clientes server-side;
- `@supabase/supabase-js` para acceso a Supabase;
- RLS como defensa principal;
- funciones SQL para reglas transaccionales y operaciones críticas;
- `server-only` para impedir que secretos lleguen al navegador.

Clientes Supabase:

- `src/server/supabase/server.ts`: cliente server-side con sesión;
- `src/server/supabase/admin.ts`: cliente con service role, restringido a servidor;
- `src/server/supabase/proxy.ts`: refresco de sesión y validación de claims;
- `src/proxy.ts`: protección de rutas.

### Validación y dominio

- Zod para validar entradas en servidor;
- `libphonenumber-js` para teléfonos bolivianos;
- `date-fns` y `@date-fns/tz` para fechas;
- funciones de dominio para dinero, fechas, texto, teléfono, CSV, estados y clínica;
- dinero representado como centavos enteros en BOB;
- fechas almacenadas en UTC y presentadas en `America/La_Paz`.

### UI y estilos

- CSS global en `src/app/globals.css`;
- Tailwind CSS 4 a través de PostCSS;
- componentes UI internos en `src/components/ui.tsx`;
- iconos con `lucide-react`;
- wordmark e icono en `src/app/icon.svg` y `Wordmark`;
- componentes compartidos: cards, headers, estadísticas, avatar, modal, fields, barras, chips y estados.

No se usa `localStorage`, `sessionStorage` ni IndexedDB para información clínica o datos personales.

## 6. Rutas de la aplicación

| Ruta | Acceso | Propósito |
|---|---|---|
| `/` | redirección | Redirige a `/inicio` |
| `/login` | pública | Inicio de sesión |
| `/recuperar` | pública | Solicitud de recuperación |
| `/recuperar/nueva` | pública | Nueva contraseña |
| `/configuracion-inicial` | pública condicionada | Alta inicial de clínica/admin |
| `/forbidden` | pública | Sin permisos |
| `/inicio` | sesión | Dashboard |
| `/agenda` | sesión | Agenda |
| `/recepcion` | sesión | Sala de espera |
| `/pacientes` | sesión | Directorio |
| `/pacientes/[id]` | sesión | Ficha |
| `/consulta` | sesión | Lista de atenciones |
| `/consulta/[id]` | sesión | Atención individual |
| `/caja` | sesión | Caja y cobros |
| `/inventario` | sesión | Inventario |
| `/configuracion` | administrador | Ajustes |
| `/cuenta` | sesión | Cuenta del usuario |
| `/api/auth/callback` | pública controlada | Callback de Auth |
| `/api/health` | pública | Health check |
| `/api/patients/[id]/files` | sesión/permisos | Archivos clínicos del paciente |

El proxy deja sin sesión únicamente `login`, recuperación, configuración inicial, callback de Auth, health y forbidden. El resto se redirige a `/login`.

## 7. Server Actions y consultas

### Acciones

| Archivo | Funciones |
|---|---|
| `actions/auth.ts` | `signIn`, `signOut`, `requestPasswordReset`, `updatePassword` |
| `actions/setup.ts` | `needsSetup`, `setupClinic` |
| `actions/agenda.ts` | `getSlots`, `createAppointment`, `rescheduleAppointment`, `changeAppointmentStatus`, `listNotifications`, `markNotificationsRead` |
| `actions/patients.ts` | `createPatient`, `updatePatient`, `searchPatientPicker`, `reviewAnamnesis`, `importPatients`, `addClinicalNote` |
| `actions/clinical.ts` | `startEncounter`, `saveEncounterNotes`, `addFinding`, `removeFinding`, `addPlanItem`, `setPlanItemToday`, `removePlanItem`, `finishEncounter`, `addAddendum`, `saveAnamnesis` |
| `actions/billing.ts` | `recordPayment`, `voidPayment`, `openCash`, `closeCash`, `addCashMovement` |
| `actions/inventory.ts` | `saveSupplyItem`, `receiveStock`, `adjustStock`, `createSupplier` |
| `actions/settings.ts` | `updateClinic`, `saveHours`, `addHoliday`, `removeHoliday`, `saveCabinet`, `saveTreatment`, `saveCategory`, `saveRecipe`, `updateMember`, `saveSchedule` |
| `actions/members.ts` | `createMember`, `setMemberPassword` |

Todas validan la entrada con esquemas Zod, comprueban sesión/capacidad, llaman a Supabase/RPC y revalidan las rutas afectadas.

### Consultas

| Archivo | Funciones principales |
|---|---|
| `queries/dashboard.ts` | `getDashboard` |
| `queries/agenda.ts` | `appointmentCards`, `getBookingOptions`, `getDayBoard` |
| `queries/patients.ts` | `searchPatients`, `getPatientDetail`, `pickPatients`, `getCurrentAnamnesis` |
| `queries/clinical.ts` | `findingsOf`, `planOf`, `treatmentOptions`, `getConsultaList`, `getConsulta`, `getPatientClinical`, `getPatientInvoices` |
| `queries/billing.ts` | `getCashDay`, `getInvoice` |
| `queries/inventory.ts` | `getInventory` |
| `queries/settings.ts` | `getSettings` |

Los DTOs están definidos principalmente en `src/server/queries/types.ts`, `clinical.ts`, `billing.ts` e `inventory.ts`. La aplicación intenta enviar al navegador solo los datos necesarios para cada pantalla y rol.

## 8. Modelo de datos de Supabase

### Enums principales

- `member_role`: administrador, odontólogo, recepción;
- `appointment_status`: programada, confirmada, llegada, en curso, completada, no-show, cancelada;
- `appointment_source`: fuentes de captación y origen histórico;
- `encounter_status`: en curso, finalizada, anulada;
- `plan_status`: planeado, aceptado, en curso, terminado, cancelado;
- `tooth_condition`: caries, corona, endodoncia, ausente, fractura, sellante, implante, prótesis, otro;
- `invoice_status`: borrador, emitida, parcialmente pagada, pagada, anulada;
- `payment_method`: efectivo, QR, transferencia, tarjeta;
- `payment_status`: confirmado, anulado;
- `cash_session_status`: abierta, cerrada;
- `transaction_kind`: ingreso, gasto, ajuste;
- `stock_reason`: compra, tratamiento, ajuste, merma, devolución;
- `notification_kind`: check-in, cita, stock bajo, pago, sistema;
- `anamnesis_source`: check-in, equipo, importación;
- `consent_type`: tratamiento de datos, tratamiento clínico, recordatorios WhatsApp, marketing.

### Tablas y vistas

**Clínica, identidad y configuración:** `clinics`, `profiles`, `clinic_members`, `member_invites`, `clinic_hours`, `clinic_holidays`, `cabinets`, `dentist_schedules`, `dentist_time_off`.

**Catálogo e insumos:** `treatment_categories`, `treatments`, `supply_items`, `treatment_supplies`, `suppliers`, `supply_lots`, `stock_movements`, vista `v_stock`.

**Pacientes y clínica:** `patients`, `anamnesis_versions`, `clinical_notes`, `encounters`, `tooth_findings`, `treatment_plan_items`, `patient_files`, `patient_consents`, `encounter_addenda`.

**Agenda y notificaciones:** `appointments`, `appointment_events`, `notifications`.

**Facturación y caja:** `invoice_counters`, `invoices`, `invoice_items`, `payments`, `transactions`, `cash_sessions`, `operation_results`.

**Auditoría y protección:** `audit_log`, `rate_limit_events`.

**Legado retirado del portal público:** algunas migraciones históricas contienen `checkin_tokens`, `checkin_submissions`, `consent_versions`, `campaigns`, `attribution_touches` y funciones de reserva/check-in público. La decisión vigente es operar solo para el personal; la migración `0013_staff_only.sql` retira el acceso y funcionalidad pública.

## 9. Migraciones y funciones SQL relevantes

| Migración | Alcance |
|---|---|
| `0001_extensions_enums.sql` | Extensiones, enums y privilegios cerrados |
| `0002_clinic_identity.sql` | Clínica, perfiles, miembros, invitaciones |
| `0003_schedule.sql` | Horarios, feriados, gabinetes y turnos |
| `0004_catalog.sql` | Tratamientos, categorías, insumos y recetas |
| `0005_patients_clinical.sql` | Pacientes, anamnesis, atenciones, hallazgos, plan y archivos |
| `0006_rls_core.sql` | Permisos, funciones de autorización y RLS |
| `0007_audit.sql` | Auditoría append-only y triggers |
| `0008_storage.sql` | Buckets y políticas de archivos |
| `0009_invites.sql` | Invitaciones y aceptación atómica |
| `0010_agenda.sql` | Citas, slots, eventos y notificaciones |
| `0011_checkin_public.sql` | Primer diseño de check-in/portal público |
| `0012_public_book_cast.sql` | Ajuste histórico del portal público |
| `0013_staff_only.sql` | Retiro del portal y MFA simplificado |
| `0014_consulta_caja_inventario.sql` | Consulta, inventario, facturación, pagos y caja |
| `0015_setup.sql` | Configuración inicial de clínica |
| `0016_lint_start_encounter.sql` | Corrección/ajuste de inicio de atención |
| `0017_historial_clinico.sql` | Notas clínicas e historial importado |

Funciones SQL críticas:

- disponibilidad: `within_availability`, `available_slots`, `slots_core`;
- agenda: `create_appointment`, `reschedule_appointment`, `change_appointment_status`;
- consulta: `start_encounter`, `finish_encounter`;
- facturación: `record_payment`, `void_payment`, `apply_payment`, `invoice_status_for`;
- caja: `open_cash_session`, `cash_expected`, `close_cash_session`, `add_cash_movement`, `ensure_cash_session`;
- inventario: `receive_stock`, `adjust_stock`, `apply_stock_movement`;
- inicialización: `setup_clinic`, `is_setup_done`;
- autorización: `is_staff`, `is_admin`, `is_dentist`, `is_cashier`, `can_read_clinical`, `can_bill`, `can_use_appointment`, `is_patient_dentist`;
- auditoría/notificaciones: `audit_row`, `log_event`, `notify`, `notify_role`.

## 10. Reglas de negocio importantes

- Todas las fechas persistidas son UTC; la zona de negocio es `America/La_Paz`.
- El dinero se almacena en centavos enteros; la interfaz lo muestra en bolivianos.
- Una cita no puede solaparse con otra del odontólogo ni del gabinete.
- Las transiciones de estados están reflejadas tanto en TypeScript como en SQL; `status-parity.test.ts` verifica su paridad.
- El odontólogo solo puede operar sobre pacientes propios o relacionados con sus citas/atenciones.
- Recepción puede manejar datos administrativos y de contacto, pero no recibe datos clínicos.
- La anamnesis es versionada.
- Una atención cerrada no se edita: se corrige mediante adendas con motivo.
- El precio del plan se congela desde la tarifa vigente en base de datos; el navegador no decide el precio final.
- El inventario se mueve mediante movimientos; el saldo no se edita directamente.
- El descuento de stock usa FEFO y no permite saldo negativo.
- Facturas por clínica y año usan numeración correlativa del tipo `ALQ-AAAA-000001`.
- Las operaciones financieras críticas usan idempotencia con `operation_results`.
- El cierre de atención es todo-o-nada.
- Las acciones auditables escriben en `audit_log` dentro de la misma transacción.
- Se debe mantener al menos un administrador activo.

## 11. Seguridad

- sitio privado para personal autenticado;
- sin registro público;
- sin páginas públicas para pacientes;
- RLS habilitado sobre todas las tablas relevantes;
- service role solo en módulos `server-only`;
- cookies de sesión administradas por Supabase SSR;
- claims verificados mediante `getClaims()` en el proxy;
- rutas privadas bloqueadas antes del renderizado;
- datos clínicos no almacenados en el navegador;
- auditoría append-only;
- CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Robots-Tag` y HSTS cuando corresponde;
- el navegador no conecta directamente con Supabase: `connect-src` queda en `'self'`;
- archivos clínicos bajo rutas protegidas por clínica/paciente.

### Decisiones y limitaciones conocidas

- MFA está desactivado por decisión de la clínica; `has_mfa()` actualmente solo verifica que exista sesión.
- Se recomienda activarlo al menos para el administrador en una fase posterior.
- La política CSP usa `'unsafe-inline'` porque Next necesita scripts inline para hidratar.
- La recuperación de contraseña usa el correo de Supabase por defecto; para producción se recomienda SMTP propio.
- Antes de habilitar múltiples clínicas a escala se deberían reforzar algunas relaciones con llaves compuestas `(clinic_id, id)`.
- La política legal de privacidad, consentimiento y retención de historias debe revisarse con asesoría boliviana.

## 12. Archivos y recursos del proyecto

### Estructura relevante

```text
src/app/                    Rutas, layouts, páginas, API y estilos globales
src/components/             UI, agenda, pacientes, consulta, caja, inventario y configuración
src/lib/domain/              Reglas puras de dominio y utilidades
src/server/actions/          Escrituras mediante Server Actions
src/server/queries/          Lecturas y DTOs de pantalla
src/server/schemas/          Validación Zod de entradas
src/server/auth/             Sesión, guards y permisos
src/server/supabase/         Clientes Supabase y proxy de sesión
supabase/migrations/         Evolución versionada del esquema
supabase/tests/              Pruebas SQL/RLS sobre PGlite
supabase/seed.dev.sql        Datos ficticios solo para pruebas/desarrollo
docs/                        Arquitectura, seguridad, operación y brief
e2e/                         Pruebas Playwright
```

### Dependencias de producción

- `next`, `react`, `react-dom`;
- `@supabase/ssr`, `@supabase/supabase-js`;
- `@hookform/resolvers`, `react-hook-form`, `zod`;
- `date-fns`, `@date-fns/tz`;
- `libphonenumber-js`;
- `lucide-react`;
- `server-only`;
- `@sentry/nextjs` disponible para observabilidad.

### Dependencias de desarrollo

- TypeScript;
- ESLint y `eslint-config-next`;
- Prettier;
- Vitest, Testing Library y JSDOM;
- Playwright;
- Supabase CLI;
- PGlite para ejecutar Postgres en WASM sin Docker;
- Tailwind CSS 4 y PostCSS.

### Variables de entorno

Variables públicas esperadas:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `NEXT_PUBLIC_SITE_URL`.

La clave `SUPABASE_SERVICE_ROLE_KEY` es de servidor y nunca debe exponerse al navegador. Los nombres deben mantenerse en `.env.example` sin valores reales.

## 13. Verificación y pruebas

Comandos disponibles:

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run db:reset
npm run db:types
npm run db:lint
```

### Pruebas unitarias y de dominio

- `src/lib/domain/clinical.test.ts`;
- `src/lib/domain/csv.test.ts`;
- `src/lib/domain/domain.test.ts`;
- `src/server/auth/permissions.test.ts`;
- `src/server/schemas/auth.test.ts`;
- `src/server/schemas/patients.test.ts`.

Cubren dinero, fechas, CSV, teléfonos, nombres, estados, permisos y esquemas.

### Pruebas de Supabase/PGlite

- `supabase/tests/rls.test.ts`: aislamiento y permisos;
- `supabase/tests/agenda.test.ts`: agenda, slots y doble reserva;
- `supabase/tests/consulta-caja.test.ts`: atención, factura, pago, caja e inventario;
- `supabase/tests/postgrest-contract.test.ts`: contratos de acceso;
- `supabase/tests/status-parity.test.ts`: paridad de estados SQL/TypeScript;
- `supabase/tests/writes.test.ts`: escrituras y auditoría;
- `supabase/tests/harness.ts` y `supabase-shim.sql`: entorno de prueba.

### Pruebas E2E

- `e2e/auth.spec.ts`;
- `e2e/smoke.spec.ts`.

Playwright prueba escritorio y móvil, genera build de producción y verifica rutas privadas, health check y cabeceras de seguridad. Usa Chrome instalado y un servidor en el puerto `3100`.

## 14. Operación y despliegue

Flujo local:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Base de datos enlazada:

```bash
npx supabase db push --linked
```

Primera puesta en marcha:

1. configurar variables en Vercel u otro host;
2. configurar Site URL y Redirect URL de Supabase Auth;
3. entrar a `/login`;
4. completar configuración inicial;
5. definir horarios, gabinetes, tratamientos, insumos, equipo y pacientes.

Respaldos recomendados:

```bash
npx supabase db dump --linked -f respaldo-esquema.sql
npx supabase db dump --linked --data-only -f respaldo-datos.sql
```

Los respaldos contienen datos de salud y deben guardarse fuera del equipo, cifrados y nunca compartirse por WhatsApp o correo.

## 15. Documentación existente relacionada

- `README.md`: resumen, ejecución local, base de datos y verificación;
- `docs/arquitectura.md`: capas, sprints, decisiones y desviaciones;
- `docs/seguridad.md`: permisos, verificaciones y limitaciones;
- `docs/operacion.md`: puesta en marcha, altas/bajas, respaldos, restauración, rotación de llaves e incidentes;
- `docs/fase1-brief.md`: brief completo, alcance, modelo de datos, criterios de aceptación, plan y riesgos;
- `docs/clinica.md`: investigación de la clínica y contexto de mercado;
- `docs/resumen-demo-y-necesidades.md`: evolución desde la demo y necesidades operativas.

## 16. Decisiones históricas que hay que respetar

- La aplicación actual es solo para personal; no reactivar automáticamente el portal público.
- La demo con `localStorage`, odontograma 3D, Three.js y React Three Fiber está retirada.
- El frontend no debe escribir directamente citas, facturas, pagos, caja o stock.
- Las reglas críticas deben permanecer en RPC/SQL y RLS.
- No usar datos reales en `seed.dev.sql`, local ni staging sin anonimización.
- Los cambios de esquema deben hacerse mediante una nueva migración ordenada.
- La información clínica nunca debe aparecer en URLs, logs del navegador o almacenamiento local.

## 17. Próximas áreas de atención

Antes de una operación productiva conviene mantener como checklist:

- revisar los cambios locales actuales y decidir si se commitean;
- ejecutar `typecheck`, `lint`, pruebas unitarias, pruebas Supabase y E2E;
- confirmar que las 17 migraciones están aplicadas al proyecto correcto;
- configurar SMTP y backups automáticos;
- definir política legal de privacidad, consentimiento y retención;
- evaluar MFA para administradores;
- validar el flujo de importación con un CSV real anonimizado;
- hacer una prueba de restauración de respaldo;
- capacitar al equipo en estados de agenda, cierre de consulta, caja y anulación.

## 18. Resumen ejecutivo

Alquimia Dental ya no es solo una demo visual: es un CRM clínico interno con agenda, pacientes, consulta, inventario, facturación, caja, configuración y controles de seguridad. La arquitectura es server-first: el navegador presenta y captura datos, pero las decisiones de autorización, precios, stock, numeración, transacciones y auditoría ocurren en el servidor y la base de datos.

El flujo operativo principal es:

```text
Paciente → agenda → recepción/llegada → consulta
         → hallazgos + plan + insumos
         → cierre transaccional
         → factura + pago + stock + cita atendida + auditoría
         → saldo/caja e historial clínico
```

