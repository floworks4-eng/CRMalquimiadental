# Alquimia Dental · Fase 1 — De demo a CRM clínico real

**Brief de construcción para Opus 5.5**
Versión 1.0 · 23/10/2026 · Lumen Labs
Proyecto: `/Users/leo/code/archivos claude/Proyectos/clinica alquimia`
Documento de referencia: “Alquimia Dental · Qué se construyó y qué necesita la clínica” (23/10/2026)
Investigación de base: `docs/clinica.md`

---

## 0. Instrucciones para el agente que implementa

Este documento **no es una propuesta comercial**. Es un contrato técnico de ejecución. Léelo completo antes de escribir una línea de código.

### 0.1 Reglas no negociables

1. **No inventes datos de la clínica.** Precios, horarios, tratamientos, nombres y número de WhatsApp son placeholders hasta que el cliente los confirme. Todo dato sin confirmar va en `supabase/seed.dev.sql`, nunca en migraciones ni en producción.
2. **No hay “modo demo” en producción.** El selector de rol, la demo guiada, `/ruta`, `/ingesta` simulada y las cifras de campaña inventadas se quedan en la rama/tag `demo-v1`, no en `main`.
3. **Ningún dato clínico en el cliente.** Prohibido `localStorage`, `sessionStorage`, IndexedDB, URLs con nombres/teléfonos o props que incluyan el registro completo. El navegador solo recibe DTOs con los campos que la pantalla necesita.
4. **La autorización vive en el servidor.** RLS en Postgres es la defensa principal; las Server Actions revalidan permiso y reglas. Un `can()` en React es solo cosmético.
5. **Nunca uses `service_role` en el navegador.** Si una ruta o acción la necesita (invitaciones, tareas administrativas), el cliente Supabase se crea en un módulo `server-only`, con verificación de rol previa.
6. **Toda escritura clínica es auditable.** Si una acción toca pacientes, anamnesis, diagnósticos, planes, pagos, stock o miembros, escribe en `audit_log` en la misma transacción.
7. **Operaciones de dinero y stock son atómicas e idempotentes.** Nada de “descontar stock y luego cobrar”. Una sola función RPC transaccional.
8. **Fechas en UTC, visualización en `America/La_Paz`.** Dinero en centavos enteros (BOB). Cantidades de insumos en `numeric(12,3)`.
9. **Cada tarea termina en verde:** `typecheck`, `lint`, tests unitarios, tests de RLS y, cuando aplique, E2E. Sin excepciones.
10. **Detente en los gates.** Si un gate no pasa, no avances al sprint siguiente. Documenta el bloqueo y pide decisión.

### 0.2 Convenciones

- Código, nombres de tablas, columnas, tipos y funciones: **inglés**, `snake_case` en SQL, `camelCase` en TypeScript.
- UI y mensajes: **español (es-BO)**, tono cercano y claro, sin jerga técnica.
- Fechas de negocio: `timestamptz`; hora de la clínica: `clinics.timezone`.
- IDs: `uuid` generados en Postgres (`gen_random_uuid()`). No IDs secuenciales expuestos.
- Migraciones: solo por archivos en `supabase/migrations`, nunca cambios manuales en producción.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). PR pequeño por tarea o grupo de tareas.
- Ramas: `main` (producción), `staging`, `feat/F1-xx-descripcion`.
- No se aceptan PRs que mezclen refactor visual con migración de datos.

### 0.3 Definition of Done (por tarea)

- [ ] Código tipado, sin `any` nuevos, sin `!` no justificados.
- [ ] Validación Zod en el borde del servidor.
- [ ] Permiso verificado en servidor + política RLS si hay tabla nueva.
- [ ] Auditoría si la acción modifica datos sensibles.
- [ ] Estados `loading`, `empty`, `error` y `success` implementados.
- [ ] Teclado y lector de pantalla verificados en la pantalla tocada.
- [ ] Tests: unitario de regla + RLS si aplica + E2E si es flujo crítico.
- [ ] Migración reproducible desde cero (`supabase db reset`).
- [ ] Documentación breve en `docs/` o comentario de migración.
- [ ] Sin datos reales, secretos ni PHI en el repo.

---

## 1. Decisión de alcance: qué es la “Fase 1”

### 1.1 Dos interpretaciones y una recomendación

El plan comercial habla de 25 días y 5 fases. La “Fase 1” comercial (días 1–5) es solo cimientos: WhatsApp, base de datos, roles y migración. Eso **no produce un CRM usable**. Si se construye solo eso, la clínica sigue con Excel y la demo sigue siendo la única prueba.

Este documento define la **Fase 1 técnica** como el **núcleo operativo seguro**: cimientos + una rebanada vertical completa que la clínica pueda usar con un paciente real.

| Interpretación | Duración | Entrega | Veredicto |
|---|---|---|---|
| A. Fase 1 comercial (días 1–5) | 5 días | Base de datos, auth, roles, inicio de migración | Necesaria pero insuficiente |
| B. **Fase 1 técnica (recomendada)** | **~25 días de desarrollo** | A + pacientes, agenda, check-in, consulta, caja, inventario, portal público, auditoría, staging y piloto | **Este documento** |
| C. Producto completo | 3–6 meses | B + WhatsApp API, analítica, OCR, SIAT, multi-sede | Fase 2+ |

**Recomendación:** ejecutar B. La Fase 1A queda incluida como Sprint 1. WhatsApp se inicia en paralelo como **trámite de negocio** (verificación del número, portafolio Meta, plantillas), pero **su código entra en Fase 2**. Montar WhatsApp antes de tener agenda y ficha reales es teatro: el bot no tendría dónde agendar.

### 1.2 Dentro de Fase 1

- Autenticación real, invitaciones, MFA y sesiones.
- Una clínica (multi-tenant preparado, sin UI multi-sede).
- Roles y permisos por capacidad, RLS, auditoría.
- Pacientes: alta, edición, búsqueda, deduplicación, ficha básica y clínica.
- Agenda multi-gabinete con exclusión de solapamientos, estados, reprogramación y cancelación.
- Check-in por token firmado, anamnesis versionada y consentimiento.
- Consulta: encuentro clínico, hallazgos por pieza/superficie, plan de tratamiento persistente.
- Cierre de atención transaccional: factura, pago, stock y auditoría.
- Caja del día y cierre de caja con arqueo.
- Inventario por receta, lotes mínimos y movimientos.
- Portal público de reserva con disponibilidad real y atribución UTM.
- Importación CSV de pacientes (sin OCR).
- Staging, CI, backups, monitoreo y runbooks.
- Migración de datos y piloto con el equipo.

### 1.3 Fuera de Fase 1 (explícito)

| Elemento | Fase | Motivo |
|---|---|---|
| WhatsApp Business Cloud API, bandeja y recordatorios automáticos | 2 | Verificación de Meta tarda semanas; requiere agenda estable primero |
| Analítica avanzada, Meta Ads/TikTok, costo por cita real | 2 | Sin datos históricos limpios, cualquier métrica es ficción |
| OCR de fichas en papel | 2 | Precisión insuficiente en manuscrito; riesgo clínico |
| Facturación electrónica SIAT | 2 | Proyecto regulatorio aparte; no cabe en 25 días |
| Pagos en línea / conciliación bancaria | 2+ | No hay API pública de comercio para QR interoperable |
| Portal del paciente con cuenta | 2+ | Los enlaces con token cubren check-in y reserva |
| Multi-sede / spa | 3 | El modelo lo soporta (`clinic_id`), la UI no |
| Odontograma 3D como flujo principal | 2 | Se conserva como vista opcional; el flujo clínico es 2D |
| IA diagnóstica o chatbot | 3+ | Riesgo clínico y legal; no es el cuello de botella |

### 1.4 Advertencia de calendario

El plan comercial de 25 días **no alcanza** para todo lo que promete (WhatsApp + OCR + SIAT + marketing + piloto). Este plan usa 25 días de desarrollo para el núcleo. Si la clínica exige WhatsApp o facturación desde el día 1, hay que **recortar alcance** o **sumar 5–10 días**. Decirlo ahora, no en la semana 4.

---

## 2. Estado actual verificado

### 2.1 Radiografía del proyecto

| Dato | Valor |
|---|---|
| Ubicación | `/Users/leo/code/archivos claude/Proyectos/clinica alquimia` |
| Stack | Next.js 16.4.0, React 19.3.0, Tailwind 4.3.3, TypeScript 5.9.3, three 0.182.0 + R3F 9.8 + drei 10.7, lucide-react, qrcode |
| Runtime local | Node 26.3.1, npm 11.16.0 |
| Tamaño | 4.158 líneas en `src` (30 archivos) |
| Estado | Sin `.git`, sin tests, sin ESLint, sin CI, sin variables de entorno |
| Typecheck | Pasa (`tsc --noEmit`, 0 errores) — verificado en modo lectura |
| Build | No reverificado en esta auditoría; hay artefactos `.next` del 09/10/2026 |
| Persistencia | `localStorage['alquimia-demo-v1']`, seed regenerado cada día |
| Capa de datos | `src/lib/data.ts` (435 líneas), store global + 21 usos de `useDB()` |
| Asincronía | **0** `async/await/fetch` en todo `src` |
| Datos clínicos en cliente | Sí: alergias, antecedentes, medicamentos, firma, consentimiento, historia, odontograma, pagos |

### 2.2 Lo que está bien y se conserva

- **El flujo de producto está validado.** WhatsApp → cita → check-in → consulta → caja → analítica es una historia coherente y vendible.
- **El sistema visual funciona.** Paleta negro/plata/dorado, tipografía Fraunces + Inter + JetBrains Mono, vidrio, jerarquía. Es un activo comercial; no se rediseña desde cero.
- **El odontograma 2D es accesible** (SVG, botones, etiquetas, leyenda con texto). El 3D es un extra, no el núcleo.
- **Bases de accesibilidad correctas:** skip link, foco visible, `<dialog>`, `role="alert"`, `prefers-reduced-motion`, estados con texto además de color.
- **Separación de semillas y tipos** clara para una demo; los nombres del dominio son razonables.
- **Responsive real:** sidebar en laptop, barra inferior en móvil.

### 2.3 Lo que falta (y bloquea producción)

| # | Hueco | Evidencia | Consecuencia |
|---|---|---|---|
| 1 | Autenticación real | `src/app/page.tsx:16-19`, `src/lib/data.ts:267-271` | Cualquiera entra como Admin |
| 2 | Autorización en servidor | `src/components/shell.tsx:52,113`; `src/lib/data.ts:162-177` | RBAC cosmético; `useDB()` entrega el `DB` completo |
| 3 | Persistencia real | `src/lib/data.ts:180-205` | Datos por navegador, se borran al cambiar el día |
| 4 | Transacciones | `src/lib/data.ts:372-412` | Stock, caja e historia pueden quedar inconsistentes |
| 5 | Idempotencia | `src/lib/data.ts:298-301`, `372-412` | Doble clic = doble cobro/descuento |
| 6 | Concurrencia de agenda | `src/lib/data.ts:249-264` | Dos pestañas/dispositivos reservan el mismo sillón |
| 7 | Historia clínica versionada | `src/lib/data.ts:56-66` | `ClinicalRecord` es texto libre; no hay evolución ni adjuntos |
| 8 | Plan de tratamiento persistente | `src/app/(app)/consulta/[id]/page.tsx:37-65` | El plan vive en `useState`; se pierde al salir |
| 9 | Consentimiento legal | `src/app/check-in/page.tsx:149-165` | Firma tecleada, texto de ejemplo, sin versión ni hash |
| 10 | QR seguro | `src/app/(app)/recepcion/page.tsx:27` | ID secuencial, sin caducidad ni un solo uso |
| 11 | Caja real | `src/app/(app)/caja/page.tsx:11-16` | Solo hoy, sin cierre, arqueo, pagos parciales ni comprobante |
| 12 | Inventario real | `src/app/(app)/inventario/page.tsx:12-14` | Sin lotes, vencimientos, proveedores, costo ni trazabilidad |
| 13 | Migración de datos | `src/app/(app)/ingesta/page.tsx:11-27` | OCR prefabricado; no lee archivos |
| 14 | Auditoría | No existe | No se sabe quién vio o cambió qué |
| 15 | Tests/CI | `package.json` | Sin red de seguridad para refactorizar |
| 16 | SEO/SSR público | `src/app/check-in/page.tsx:18`, `src/app/agendar-cita/page.tsx:24` | HTML vacío; el portal no se indexa |

### 2.4 Lo que sobra o está mal modelado

**Teatro de venta que no debe pasar a producción**

- `/ruta` (cronograma estático) y la matriz estática de `/equipo`.
- Demo guiada (`src/components/demo-guide.tsx`) y selector de rol (`src/app/page.tsx:8-25`).
- WhatsApp simulado (`src/app/(app)/whatsapp/page.tsx:11-56`) y el celular simulado de recepción (`src/app/(app)/recepcion/page.tsx:86-97`).
- Ingesta OCR falsa (`src/app/(app)/ingesta/page.tsx:11-27`, confianzas 97 %/62 % inventadas).
- Cifras base de analítica (`src/app/(app)/analitica/page.tsx:6`) y métricas de campaña en `src/lib/seed.ts:169-173`.
- Textos `[ejemplo]`, `(demo)`, “recordatorio 24 h enviado”, “sin pagos reales”.

**Modelo de datos insuficiente**

- `Patient.dentistId` asume un dueño único; la realidad es “paciente de la clínica, atendido por varios”.
- `Appointment.procedureId` asume un procedimiento por cita; una cita puede tener varios ítems de plan.
- `ClinicalRecord` no tiene hallazgos, superficies, ni relación con factura.
- `OdontogramEvent` no tiene superficies, hora, autor ni tipo (hallazgo vs tratamiento).
- `Campaign` guarda agregados inventados, no eventos de inversión ni toques de atribución.
- `Transaction` manual no se vincula a paciente/factura/sesión de caja.
- `AnamnesisData.signature` es un string; el opt-in de recordatorios se descarta (`src/app/check-in/page.tsx:33,68`).
- `Source` no contempla teléfono, walk-in ni referidos.

**Deuda técnica**

- `setCabinetCount` deja citas huérfanas (`src/lib/data.ts:279-281`).
- IDs `Date.now()+seq` colisionan entre pestañas; si el ID existe, `createAppointment` devuelve éxito sin crear (`src/lib/data.ts:298-301`).
- `commit()` traga errores de cuota/seguridad (`src/lib/data.ts:201-203`): la UI confirma un guardado que no ocurrió.
- `useHydrated` fuerza HTML vacío en SSR (`src/lib/data.ts:221`, `src/components/shell.tsx:50`): CLS y LCP pobres.
- Horarios contradictorios: 08:30–19:30 (`src/lib/data.ts:108`) vs 08:00–20:00 (`src/app/(app)/agenda/page.tsx:10-11`, `src/lib/data.ts:252`) vs portal (`src/app/agendar-cita/page.tsx:41-42`).
- Cola LIFO: el último en llegar aparece primero (`src/app/(app)/inicio/page.tsx:18`).
- `role="tablist"` sin navegación por flechas (`src/app/(app)/agenda/page.tsx:113-126`).
- Franjas de agenda no enfocables (`tabIndex={-1} aria-hidden`, `src/app/(app)/agenda/page.tsx:91-98`).
- `Card.as` sin uso (`src/components/ui.tsx:6-10`); `PHONE_RE` exportado desde un componente (`src/components/appointment-modal.tsx:9`); módulo `clinico` sin pantalla (`src/lib/data.ts:154-160`).
- Import muerto `toMin` en `src/app/agendar-cita/page.tsx:6`.
- ~30 aserciones `!` en rutas críticas; un registro borrado tumba la pantalla.

### 2.5 Veredicto

La demo es un **prototipo de producto convincente**, no una arquitectura. Se reutiliza:

- sistema visual y componentes base;
- flujo y nombres del dominio;
- odontograma 2D/3D;
- narrativa de atribución.

Se reemplaza por completo:

- la capa de datos (`data.ts`, `seed.ts`, `useDB`);
- el control de acceso;
- el modelo de agenda, historia, caja e inventario;
- la persistencia y la sincronización.

**No es realista “cambiar `data.ts` por Supabase sin tocar pantallas”.** Hay 21 suscripciones, acciones síncronas y tipos `DB` completos en props. Hay que tocar todas las pantallas.

---

## 3. Objetivos y criterios de éxito

### 3.1 Objetivos de negocio

1. Que la clínica atienda **un paciente real de principio a fin** sin papel: reserva → check-in → consulta → cobro.
2. Que recepción **nunca** vea datos clínicos.
3. Que no existan **doble reserva** ni **doble cobro**.
4. Que la caja del día **cuadre** y se pueda cerrar con arqueo.
5. Que se sepa **de qué anuncio/canal vino cada paciente** que pagó.
6. Que la información clínica sea **recuperable, auditable y retenida** según norma.

### 3.2 Criterios de aceptación medibles (Gate Final)

| Criterio | Umbral | Cómo se verifica |
|---|---|---|
| PHI en almacenamiento del navegador | 0 registros | Inspección de `localStorage/sessionStorage/IndexedDB` en E2E |
| Acceso de Recepción a datos clínicos | 403 / 0 filas | Test RLS + petición directa a PostgREST + URL directa |
| Aislamiento entre odontólogos | 0 filas ajenas | Test RLS con dos dentistas |
| Doble reserva | 0 en 20 intentos concurrentes | Test de concurrencia contra la exclusión |
| Doble cobro por reintento | 1 factura, 1 pago | Test de idempotencia con la misma key |
| Auditoría de escrituras clínicas | 100 % | Consulta `audit_log` después de E2E |
| Restauración de backup | RTO < 4 h, RPO < 24 h | Simulacro documentado |
| LCP en 4G medio | < 2,5 s | Lighthouse móvil |
| Agenda interactiva | < 100 ms de respuesta percibida | Medición manual + Profiler |
| Cobertura de reglas críticas | 100 % de estados y dinero | Tests unitarios |
| Consola del navegador | 0 errores, 0 warnings | E2E |

### 3.3 No objetivos de Fase 1

- No se promete diagnóstico asistido por IA.
- No se promete conciliación bancaria automática.
- No se promete factura electrónica.
- No se promete WhatsApp 24/7 real (solo se prepara el terreno).

---

## 4. Arquitectura objetivo

### 4.1 Diagrama

```
┌──────────────────────────────┐
│ Navegador (clínica/celular) │
│ RSC + islas cliente         │
└──────────────┬───────────────┘
               │ HTTPS (cookies httpOnly, SameSite=Lax)
┌──────────────▼───────────────┐
│ Next.js 16 en Vercel (gru1) │
│ - Server Components (lectura)│
│ - Server Actions (escritura) │
│ - Route Handlers (público)   │
│ - proxy.ts (sesión + headers)│
└──────┬───────────────┬───────┘
       │               │
┌──────▼──────┐  ┌─────▼────────────────────────────┐
│ Supabase    │  │ Servicios externos (Fase 2)       │
│ Auth (JWT)  │  │ WhatsApp Cloud API · Meta Ads     │
│ Postgres+RLS│  │ Resend · Sentry · Turnstile       │
│ Storage     │  └───────────────────────────────────┘
│ Realtime    │
│ pg_cron     │
└─────────────┘
```

### 4.2 Principios

1. **Server-first.** Las lecturas son Server Components; las escrituras, Server Actions o RPC. El cliente no conoce la base.
2. **RLS como última línea.** Aunque una acción tenga un bug, Postgres no devuelve filas que el rol no puede ver.
3. **DTOs explícitos.** `PatientDirectoryItem`, `PatientClinicalDetail`, `AppointmentCard`, `EncounterView`. Nunca `DB`.
4. **Una transacción por caso de uso.** Cierre de atención, check-in, reserva pública y cierre de caja son RPC atómicas.
5. **Append-only para lo clínico y lo financiero.** Correcciones por addenda o reverso, no por `UPDATE` silencioso.
6. **Idempotencia en todo lo que cuesta dinero o crea historia.**
7. **Tiempo y dinero sin ambigüedad:** `timestamptz` UTC, `America/La_Paz`, centavos enteros.
8. **Fallar cerrado.** Si falta permiso, sesión, MFA o datos: 403/404, nunca “modo demo”.
9. **Observabilidad desde el día 1.** Sentry + audit + logs estructurados + health check.
10. **El diseño no se toca.** La estética actual se conserva; se corrigen usabilidad y accesibilidad.

### 4.3 Stack definitivo

| Capa | Elección | Versión | Por qué |
|---|---|---|---|
| Framework | Next.js App Router | 16.x | Ya está; RSC + Server Actions |
| UI | React | 19.x | Ya está |
| Estilos | Tailwind CSS | 4.x | Ya está; tokens en `globals.css` |
| Backend | Supabase (Postgres 15/16, Auth, Storage, Realtime) | Pro | Auth, RLS, backups, región São Paulo |
| Cliente Supabase | `@supabase/ssr` + `@supabase/supabase-js` | última estable | Cookies y RLS por request |
| Validación | Zod | 4.x | Un esquema para cliente y servidor |
| Formularios | React Hook Form | 7.x | Errores por campo, accesibilidad |
| Fechas | date-fns + `@date-fns/tz` | 4.x | `America/La_Paz`, sin DST |
| Teléfonos | libphonenumber-js | última | E.164 +591 |
| PDF (Fase 1.5) | `@react-pdf/renderer` o `pdf-lib` | última | Sin Puppeteer en Vercel |
| Firma | `signature_pad` + canvas | última | Firma dibujada + hash |
| Tests unitarios | Vitest + Testing Library | última | Rápido, TS nativo |
| E2E | Playwright | última | Flujos reales, móvil |
| Calidad | ESLint flat + Prettier | última | Reemplaza `next lint` |
| Errores | Sentry | SaaS | PII scrubbing |
| Email | Resend | SaaS | Invitaciones y recuperación |
| Rate limit | Tabla Postgres + Turnstile | — | Sin servicio extra en Fase 1 |
| Hosting | Vercel Pro, región `gru1` | — | Cercanía a São Paulo |
| CI | GitHub Actions | — | Typecheck, tests, RLS, build |

### 4.4 Estructura de carpetas objetivo

```
src/
  app/
    (auth)/
      login/page.tsx
      mfa/page.tsx
      invitacion/[token]/page.tsx
      recuperar/page.tsx
    (app)/
      layout.tsx                  # shell + sesión + permisos
      inicio/page.tsx
      agenda/page.tsx
      recepcion/page.tsx
      pacientes/page.tsx
      pacientes/[id]/page.tsx
      consulta/page.tsx
      consulta/[id]/page.tsx
      caja/page.tsx
      caja/cierre/page.tsx
      inventario/page.tsx
      equipo/page.tsx
      configuracion/page.tsx
      auditoria/page.tsx
    (public)/
      reservar/page.tsx
      c/[token]/page.tsx
      privacidad/page.tsx
      consentimiento/page.tsx
      gracias/page.tsx
    api/
      health/route.ts
      auth/callback/route.ts
    layout.tsx
    globals.css
    not-found.tsx
    error.tsx
    forbidden.tsx
  components/
    ui/                           # Button, Field, Modal, Table, Toast, EmptyState…
    layout/                       # Shell, Sidebar, MobileNav, UserMenu
    agenda/
    patients/
    clinical/
    billing/
    inventory/
  server/
    supabase/
      server.ts                   # cliente por request (cookies)
      client.ts                   # cliente navegador (solo auth/realtime)
      admin.ts                    # service_role, server-only
      proxy.ts
    auth/
      session.ts
      guards.ts
      permissions.ts
    queries/                      # lecturas por recurso (RSC)
    actions/                      # Server Actions por dominio
    schemas/                      # Zod por dominio
    audit.ts
    rate-limit.ts
    errors.ts
  lib/
    domain/
      labels.ts
      money.ts
      time.ts
      phone.ts
      teeth.ts
      status.ts
    utils.ts
  types/
    database.ts                   # generado por Supabase CLI
supabase/
  migrations/
  seed.dev.sql
  tests/
    rls.test.sql
    constraints.test.sql
  config.toml
docs/
  arquitectura.md
  operacion.md
  seguridad.md
  migracion-datos.md
  runbooks/
```

### 4.5 Entornos

| Entorno | Supabase | Next.js | Datos | Uso |
|---|---|---|---|---|
| Local | CLI + Docker | `next dev` | Seed ficticio | Desarrollo |
| Staging | Proyecto separado | Vercel Preview/Staging | Ficticios o anonimizados | QA y UAT |
| Producción | Proyecto Pro `sa-east-1` | Vercel Pro `gru1` | Reales | Clínica |
| Demo comercial | Proyecto congelado `demo-v1` | Vercel actual | Ficticios | Ventas |

**Regla:** nunca se copian datos de producción a staging sin anonimizar. Nunca se prueba con datos reales en local.

### 4.6 Estrategia de migración del repo

1. `git init` y commit del estado actual.
2. Tag `demo-v1` y rama `demo` congelada (para seguir vendiendo).
3. `main` parte de `demo-v1` y empieza el refactor.
4. El deploy de demo se queda en su proyecto de Vercel; el de producción usa otro proyecto y otro dominio.
5. No se borra la demo hasta que producción esté en piloto.

---

## 5. Modelo de datos

### 5.1 Convenciones

- Toda tabla de negocio tiene `clinic_id uuid not null references clinics(id)`.
- Toda tabla tiene `created_at timestamptz not null default now()`.
- Las tablas editables tienen `updated_at` y trigger `set_updated_at()`.
- Borrado lógico con `archived_at` en catálogos y pacientes. **Nunca** borrar historia clínica, facturas, pagos, movimientos de stock ni auditoría.
- Dinero: `*_cents integer` (o `bigint` si supera 21 millones de Bs.). Moneda única `BOB`.
- Cantidades: `numeric(12,3)`.
- Enums de Postgres para estados estables; tablas de catálogo para lo editable por la clínica.
- Índices explícitos en `clinic_id`, claves foráneas y columnas de búsqueda.

### 5.2 Enums

```sql
create type member_role as enum ('clinic_admin', 'dentist', 'reception');
create type appointment_status as enum
  ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'no_show', 'cancelled');
create type appointment_source as enum
  ('whatsapp', 'web', 'campaign', 'phone', 'walk_in', 'referral', 'historical');
create type encounter_status as enum ('in_progress', 'finished', 'voided');
create type tooth_condition as enum
  ('caries', 'corona', 'endodoncia', 'ausente', 'fractura', 'sellante', 'implante', 'protesis', 'otro');
create type plan_status as enum ('planned', 'accepted', 'in_progress', 'done', 'cancelled');
create type invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'voided');
create type payment_method as enum ('cash', 'qr', 'transfer', 'card');
create type payment_status as enum ('confirmed', 'voided');
create type transaction_kind as enum ('income', 'expense', 'adjustment');
create type stock_reason as enum ('purchase', 'treatment', 'adjustment', 'waste', 'return');
create type consent_type as enum
  ('data_processing', 'clinical_treatment', 'whatsapp_reminders', 'marketing');
create type anamnesis_source as enum ('patient_checkin', 'staff', 'import');
create type cash_session_status as enum ('open', 'closed');
create type notification_kind as enum
  ('checkin', 'appointment', 'low_stock', 'payment', 'system');
```

> `member_role` es deliberadamente corto. Si más adelante entra contabilidad o asistente, se agrega con `ALTER TYPE ... ADD VALUE` y se actualiza la matriz de permisos; no se crean roles “comodín”.

### 5.3 Dominio: clínica y equipo

#### `clinics`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text unique | Para `/reservar/[slug]` si hay más de una sede |
| `name` | text | “Alquimia Dental” |
| `legal_name` | text | Para documentos |
| `nit` | text | Solo cuando el contador lo confirme |
| `timezone` | text | `America/La_Paz` |
| `currency` | char(3) | `BOB` |
| `phone` | text | |
| `whatsapp_number` | text | Número histórico, cuando se confirme |
| `address` | text | San Miguel, La Paz |
| `logo_path` | text | Storage público |
| `created_at` | timestamptz | |

#### `profiles`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | **Igual a `auth.users.id`** |
| `full_name` | text | |
| `phone` | text | |
| `avatar_path` | text | |
| `created_at` | timestamptz | |

Trigger `on auth.users insert` crea el perfil.

#### `clinic_members`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clinic_id` | uuid FK | |
| `user_id` | uuid FK `profiles` | |
| `role` | `member_role` | |
| `title` | text | “Odontóloga general” |
| `active` | boolean default true | |
| `created_at`, `updated_at` | timestamptz | |

Restricciones: `unique (clinic_id, user_id)`; en Fase 1, índice único parcial `unique (user_id) where active` (un usuario, una clínica).

#### `member_invites`

`id`, `clinic_id`, `email citext`, `role`, `token_hash bytea`, `expires_at`, `accepted_at`, `invited_by`, `created_at`.

#### `clinic_hours`

`id`, `clinic_id`, `weekday smallint check (0..6)`, `opens_at time`, `closes_at time`, `is_closed boolean`, `unique (clinic_id, weekday)`.

#### `clinic_holidays`

`id`, `clinic_id`, `date date`, `name`, `unique (clinic_id, date)`.

#### `cabinets`

`id`, `clinic_id`, `name`, `sort`, `active`, `created_at`.

> Cambiar la cantidad de gabinetes ya no “borra” nada: se activan/desactivan. Una cita futura en un gabinete inactivo bloquea la desactivación y obliga a reasignar.

#### `dentist_schedules`

`id`, `clinic_id`, `dentist_id`, `weekday`, `starts_at time`, `ends_at time`, `cabinet_id nullable`, `active`.

#### `dentist_time_off`

`id`, `clinic_id`, `dentist_id`, `starts_at timestamptz`, `ends_at timestamptz`, `reason`.

### 5.4 Dominio: catálogo clínico

#### `treatment_categories`

`id`, `clinic_id`, `name`, `sort`.

#### `treatments`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clinic_id` | uuid | |
| `code` | text | Código interno |
| `name` | text | |
| `category_id` | uuid | |
| `duration_min` | int | > 0 |
| `price_cents` | int | >= 0 |
| `requires_tooth` | boolean | |
| `active` | boolean | |
| `sort` | int | |

`unique (clinic_id, code)`.

#### `treatment_supplies` (la “receta”)

`id`, `clinic_id`, `treatment_id`, `supply_item_id`, `qty numeric(12,3) > 0`, `unique (treatment_id, supply_item_id)`.

> La receta se valida con el Doc antes de cargarla. En la demo son cantidades `[ejemplo]`; en producción es un dato clínico-operativo que debe aprobar el responsable.

### 5.5 Dominio: pacientes

#### `patients`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clinic_id` | uuid | |
| `full_name` | text not null | |
| `normalized_name` | text | Sin acentos, minúsculas, para búsqueda |
| `phone_e164` | text | `+5917XXXXXXX` |
| `phone_raw` | text | Como lo escribió el paciente |
| `email` | citext | Opcional |
| `birth_date` | date | |
| `sex` | text | Opcional |
| `zone` | text | |
| `address` | text | |
| `primary_dentist_id` | uuid FK `profiles` | Opcional; no es dueño del paciente |
| `first_source` | `appointment_source` | Inmutable |
| `first_campaign_id` | uuid FK `campaigns` | Inmutable |
| `status` | text | `new`, `active`, `in_treatment`, `inactive` |
| `archived_at` | timestamptz | |
| `created_by` | uuid | |
| `created_at`, `updated_at` | timestamptz | |

Restricciones:
- `unique (clinic_id, phone_e164)` donde `phone_e164 is not null`.
- `check (birth_date is null or birth_date <= current_date)`.
- Índice GIN trigram en `normalized_name` si se busca por texto libre a escala; en Fase 1, `btree` + `ILIKE` es suficiente.

#### `patient_consents`

`id`, `clinic_id`, `patient_id`, `consent_version_id`, `granted boolean`, `granted_at`, `revoked_at`, `channel`, `evidence jsonb`, `signature_path`, `recorded_by`, `created_at`.

#### `consent_versions`

`id`, `clinic_id`, `type consent_type`, `version text`, `body_md text`, `body_hash text`, `effective_from`, `retired_at`, `unique (clinic_id, type, version)`.

> El texto del consentimiento lo entrega la clínica. Hasta entonces se usa un borrador marcado `draft` que **no** se puede usar en producción.

#### `anamnesis_versions`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clinic_id` | uuid | |
| `patient_id` | uuid | |
| `version` | int | 1..n |
| `allergies` | text[] | |
| `allergy_other` | text | |
| `conditions` | text[] | |
| `medications` | text | |
| `reason` | text | |
| `emergency_contact_name` | text | |
| `emergency_contact_phone` | text | |
| `pregnancy` | boolean | |
| `anticoagulants` | boolean | |
| `notes` | text | |
| `source` | `anamnesis_source` | |
| `submitted_at` | timestamptz | |
| `submitted_by` | uuid | |
| `reviewed_by` | uuid | |
| `reviewed_at` | timestamptz | |

`unique (patient_id, version)`. Vista `v_current_anamnesis` con `distinct on (patient_id) ... order by version desc`.

**Regla:** la anamnesis no se edita; se crea una versión nueva. El odontólogo marca “revisada” antes de la primera atención.

#### `patient_files`

`id`, `clinic_id`, `patient_id`, `kind` (`radiograph`, `photo`, `consent`, `document`), `storage_path`, `mime`, `size_bytes`, `sha256`, `uploaded_by`, `created_at`.

### 5.6 Dominio: campañas y atribución

#### `campaigns`

`id`, `clinic_id`, `name`, `channel`, `utm_campaign`, `external_id`, `starts_on`, `ends_on`, `budget_cents`, `active`, `created_at`.

`unique (clinic_id, utm_campaign)`.

#### `campaign_spend`

`id`, `clinic_id`, `campaign_id`, `spent_on date`, `amount_cents`, `source` (`manual`, `meta`, `tiktok`), `notes`, `unique (campaign_id, spent_on, source)`.

#### `attribution_touches`

`id`, `clinic_id`, `patient_id`, `appointment_id nullable`, `source appointment_source`, `campaign_id`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `referrer`, `landing_path`, `created_at`.

> En Fase 1 no se inventan alcance ni clics. Solo se registran toques reales del portal y el origen declarado por recepción/WhatsApp.

### 5.7 Dominio: agenda

#### `appointments`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clinic_id` | uuid | |
| `patient_id` | uuid | |
| `dentist_id` | uuid FK `profiles` | |
| `cabinet_id` | uuid | |
| `treatment_id` | uuid | Opcional; el plan real vive en `treatment_plan_items` |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | |
| `status` | `appointment_status` | |
| `source` | `appointment_source` | |
| `campaign_id` | uuid | |
| `notes` | text | |
| `cancellation_reason` | text | |
| `checked_in_at` | timestamptz | |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz | |
| `created_by` | uuid | |
| `created_at`, `updated_at` | timestamptz | |

Restricciones clave:

```sql
create extension if not exists btree_gist;

alter table appointments
  add constraint appointments_time_valid check (ends_at > starts_at),
  add constraint appointments_dentist_no_overlap exclude using gist (
    dentist_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show')),
  add constraint appointments_cabinet_no_overlap exclude using gist (
    cabinet_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show')),
  add constraint appointments_patient_no_overlap exclude using gist (
    patient_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show'));
```

Índices: `(clinic_id, starts_at)`, `(dentist_id, starts_at)`, `(patient_id, starts_at desc)`, `(status) where status in ('checked_in','in_progress')`.

#### `appointment_events`

`id`, `clinic_id`, `appointment_id`, `from_status`, `to_status`, `actor_id`, `reason`, `at`.

> Cada transición de estado deja evento. Es la fuente de verdad para no-show, tiempos de espera y auditoría operativa.

### 5.8 Dominio: check-in

#### `checkin_tokens`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clinic_id` | uuid | |
| `appointment_id` | uuid FK | |
| `token_hash` | bytea unique | SHA-256 del token; **nunca** el token en claro |
| `expires_at` | timestamptz | 48 h antes → 2 h después |
| `used_at` | timestamptz | Un solo uso |
| `revoked_at` | timestamptz | |
| `created_by` | uuid | |
| `created_at` | timestamptz | |

El token son 32 bytes aleatorios en base64url. El QR codifica `${SITE_URL}/c/<token>`. No contiene PII.

#### `checkin_submissions`

`id`, `token_id`, `appointment_id`, `patient_id`, `anamnesis_version_id`, `consent_id`, `ip_hash`, `user_agent`, `submitted_at`.

`unique (token_id)`.

### 5.9 Dominio: encuentro clínico

#### `encounters`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clinic_id` | uuid | |
| `patient_id` | uuid | |
| `appointment_id` | uuid unique | |
| `dentist_id` | uuid | |
| `status` | `encounter_status` | |
| `chief_complaint` | text | |
| `notes` | text | |
| `started_at` | timestamptz | |
| `finished_at` | timestamptz | |
| `voided_at`, `void_reason` | | Solo admin |

#### `tooth_findings`

`id`, `clinic_id`, `patient_id`, `encounter_id`, `tooth_fdi smallint check (tooth_fdi between 11 and 85)`, `condition tooth_condition`, `surfaces text[]` (`M`, `D`, `V`, `L`, `O`, `I`), `notes`, `recorded_at`, `recorded_by`.

> Hallazgo ≠ tratamiento. “Caries en 36” es un hallazgo; “resina 2 superficies en 36” es un ítem de plan.

#### `treatment_plan_items`

`id`, `clinic_id`, `patient_id`, `encounter_id nullable`, `treatment_id`, `tooth_fdi`, `surfaces`, `status plan_status`, `price_cents`, `sequence`, `accepted_at`, `completed_encounter_id`, `created_by`, `created_at`.

> El plan sobrevive a la sesión. “Hoy” y “próxima sesión” son estados/fechas, no un `boolean` efímero.

#### `encounter_addenda`

`id`, `clinic_id`, `encounter_id`, `reason`, `notes`, `created_by`, `created_at`.

> Corregir historia clínica no es editar: es agregar una addenda con motivo.

### 5.10 Dominio: facturación y caja

#### `invoices`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clinic_id` | uuid | |
| `patient_id` | uuid | |
| `encounter_id` | uuid unique | |
| `number` | text | `ALQ-2026-000123` |
| `status` | `invoice_status` | |
| `subtotal_cents`, `discount_cents`, `total_cents` | int | |
| `issued_at`, `due_at` | timestamptz | |
| `voided_at`, `void_reason` | | |
| `created_by`, `created_at` | | |

`unique (clinic_id, number)`.

#### `invoice_items`

`id`, `invoice_id`, `treatment_id nullable`, `description`, `qty`, `unit_price_cents`, `total_cents`, `tooth_fdi`, `plan_item_id`.

#### `payments`

`id`, `clinic_id`, `invoice_id`, `patient_id`, `amount_cents > 0`, `method`, `reference`, `status`, `received_at`, `received_by`, `idempotency_key text unique`, `voided_at`, `void_reason`.

#### `invoice_counters`

`clinic_id`, `year`, `last_number`, `primary key (clinic_id, year)`. Se actualiza dentro de la RPC de facturación con `update ... returning`.

#### `cash_sessions`

`id`, `clinic_id`, `opened_by`, `opened_at`, `opening_float_cents`, `closed_by`, `closed_at`, `expected_cents`, `counted_cents`, `difference_cents`, `status`, `notes`.

Índice único parcial: `unique (clinic_id) where status = 'open'`.

#### `transactions`

`id`, `clinic_id`, `cash_session_id`, `kind transaction_kind`, `category`, `concept`, `amount_cents`, `method`, `patient_id`, `invoice_id`, `payment_id`, `created_by`, `created_at`, `voided_at`, `void_reason`.

> `transactions` es el libro de caja. Los pagos generan un ingreso; los gastos, un egreso. No se edita: se reversa con otro movimiento y se audita.

### 5.11 Dominio: inventario

#### `suppliers`

`id`, `clinic_id`, `name`, `phone`, `notes`, `active`.

#### `supply_items`

`id`, `clinic_id`, `name`, `sku`, `unit`, `min_stock numeric(12,3)`, `track_lots boolean default true`, `active`.

#### `supply_lots`

`id`, `clinic_id`, `supply_item_id`, `lot_code`, `expires_on date`, `qty_on_hand numeric(12,3) >= 0`, `unit_cost_cents`, `supplier_id`, `received_at`.

#### `stock_movements`

`id`, `clinic_id`, `supply_item_id`, `lot_id`, `delta numeric(12,3)`, `reason stock_reason`, `ref_type`, `ref_id`, `unit_cost_cents`, `note`, `created_by`, `created_at`.

Trigger:
- `insert` en `stock_movements` actualiza `supply_lots.qty_on_hand`.
- `check (qty_on_hand >= 0)` en el lote.
- Consumo por tratamiento usa FEFO (`order by expires_on nulls last, received_at`).
- Si no alcanza, la RPC de cierre **falla completa** con lista de faltantes. No se permite stock negativo salvo ajuste explícito de admin con motivo.

### 5.12 Dominio: notificaciones y trabajos

#### `notifications`

`id`, `clinic_id`, `user_id`, `kind`, `title`, `body`, `href`, `read_at`, `created_at`.

#### `jobs` (outbox)

`id`, `clinic_id`, `kind`, `payload jsonb`, `run_at`, `attempts`, `last_error`, `status`, `created_at`, `completed_at`.

> En Fase 1 se usa para recordatorios internos y tareas diferidas. WhatsApp se conecta aquí en Fase 2.

### 5.13 Dominio: auditoría

#### `audit_log`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigint identity PK | |
| `clinic_id` | uuid | |
| `actor_id` | uuid nullable | `auth.uid()` o null si sistema |
| `actor_role` | `member_role` | |
| `action` | text | `patient.create`, `encounter.finish`, … |
| `entity_type` | text | |
| `entity_id` | uuid | |
| `patient_id` | uuid | Para buscar todo lo de un paciente |
| `before` | jsonb | |
| `after` | jsonb | |
| `ip_hash` | text | |
| `user_agent` | text | |
| `at` | timestamptz | |

Sin `UPDATE` ni `DELETE`. Índices `(clinic_id, at desc)`, `(entity_type, entity_id)`, `(patient_id, at desc)`.

> `before/after` puede contener datos clínicos. La tabla es solo para admin y se cifra en reposo por Supabase. No se exporta a terceros.

### 5.14 Vista de relación (resumen)

```
clinics 1─n clinic_members n─1 profiles
clinics 1─n cabinets / clinic_hours / clinic_holidays / treatments / campaigns
patients 1─n appointments n─1 dentists(profiles) / cabinets / campaigns
patients 1─n anamnesis_versions / patient_consents / patient_files
appointments 1─1 encounters 1─n tooth_findings / treatment_plan_items / addenda
encounters 1─1 invoices 1─n invoice_items / payments
payments n─1 transactions n─1 cash_sessions
treatments 1─n treatment_supplies n─1 supply_items 1─n supply_lots 1─n stock_movements
todo → audit_log
```

### 5.15 Invariantes que el agente debe probar

1. Un paciente no puede tener dos citas activas solapadas.
2. Un odontólogo no puede tener dos citas activas solapadas.
3. Un gabinete no puede tener dos citas activas solapadas.
4. Cancelar/no-show libera el horario; completar no.
5. Una cita `checked_in` no puede volver a `scheduled` sin motivo y auditoría.
6. Un encuentro `finished` no se edita; solo addenda.
7. Una factura pagada no se borra; se reversa.
8. La suma de pagos confirmados nunca supera el total de la factura (salvo saldo a favor explícito, fuera de Fase 1).
9. El stock nunca queda negativo por consumo de tratamiento.
10. Un token de check-in usado no se reutiliza.
11. Un paciente no se duplica por teléfono normalizado.
12. Toda escritura clínica tiene actor y timestamp.

---

## 6. Seguridad, permisos y cumplimiento

### 6.1 Autenticación

| Flujo | Implementación | Reglas |
|---|---|---|
| Alta de usuario | Admin invita por email (`auth.admin.inviteUserByEmail`) desde Server Action `server-only` | Nunca hay registro público |
| Activación | Enlace de invitación → crear contraseña → enrolar MFA | Token de invitación con caducidad y un solo uso |
| Login | Email + contraseña | Rate limit por IP y por email; mensaje genérico |
| MFA | TOTP obligatorio para todos los miembros activos | `aal2` exigido por RLS en tablas con PHI |
| Recuperación | Email con enlace de un solo uso | No revela si el email existe |
| Sesión | Cookies `httpOnly`, `Secure`, `SameSite=Lax` vía `@supabase/ssr` | Refresh en `proxy.ts`; nunca `getSession()` en servidor |
| Logout | Server Action + revocación de sesión | Limpia cookies y redirige a `/login` |
| Baja | `clinic_members.active = false` + revocación de sesiones | No se borra el perfil: la auditoría lo referencia |

**Prohibido:** login por rol, “entrar como admin”, contraseñas compartidas, cuentas genéricas de recepción. Cada persona tiene su usuario; la trazabilidad es el punto.

### 6.2 Matriz de permisos por capacidad

| Capacidad | clinic_admin | dentist | reception |
|---|:---:|:---:|:---:|
| `patients.read_directory` | ✅ | ✅ (sus pacientes) | ✅ |
| `patients.read_clinical` | ✅ | ✅ (sus pacientes) | ❌ |
| `patients.create` | ✅ | ✅ | ✅ |
| `patients.update_demographics` | ✅ | ✅ (sus pacientes) | ✅ |
| `patients.merge` | ✅ | ❌ | ❌ |
| `agenda.read_all` | ✅ | ❌ | ✅ |
| `agenda.read_own` | ✅ | ✅ | — |
| `agenda.manage` | ✅ | ✅ (su agenda) | ✅ |
| `checkin.issue` | ✅ | ❌ | ✅ |
| `checkin.manage` | ✅ | ✅ (sus pacientes) | ✅ |
| `encounters.read` | ✅ | ✅ (sus pacientes) | ❌ |
| `encounters.write` | ✅ | ✅ (sus pacientes) | ❌ |
| `encounters.finish` | ✅ | ✅ (sus pacientes) | ❌ |
| `inventory.read` | ✅ | ✅ | ✅ (solo stock, sin costos) |
| `inventory.receive` | ✅ | ❌ | ❌ |
| `inventory.adjust` | ✅ | ❌ | ❌ |
| `billing.read` | ✅ | ✅ (sus encuentros) | ✅ |
| `billing.charge` | ✅ | ✅ (al cerrar) | ✅ |
| `billing.void` | ✅ | ❌ | ❌ |
| `cash.open` | ✅ | ❌ | ✅ |
| `cash.close` | ✅ | ❌ | ✅ |
| `cash.read` | ✅ | ❌ | ✅ |
| `reports.operational` | ✅ | ❌ | ✅ (día) |
| `reports.marketing` | ✅ | ❌ | ❌ |
| `members.manage` | ✅ | ❌ | ❌ |
| `settings.manage` | ✅ | ❌ | ❌ |
| `audit.read` | ✅ | ❌ | ❌ |
| `exports.clinical` | ✅ | ✅ (sus pacientes) | ❌ |

> “Sus pacientes” = `patients.primary_dentist_id = auth.uid()` **o** existe una cita/encuentro con ese odontólogo. Un odontólogo no ve la historia de un paciente que nunca atendió.

### 6.3 Patrones RLS

#### Funciones base

```sql
create or replace function public.is_member(p_clinic uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members m
    where m.clinic_id = p_clinic
      and m.user_id = (select auth.uid())
      and m.active
  );
$$;

create or replace function public.has_role(p_clinic uuid, p_roles public.member_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members m
    where m.clinic_id = p_clinic
      and m.user_id = (select auth.uid())
      and m.active
      and m.role = any (p_roles)
  );
$$;

create or replace function public.has_mfa()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

create or replace function public.is_patient_dentist(p_patient uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patients p
    where p.id = p_patient
      and p.primary_dentist_id = (select auth.uid())
  )
  or exists (
    select 1 from public.appointments a
    where a.patient_id = p_patient
      and a.dentist_id = (select auth.uid())
  )
  or exists (
    select 1 from public.encounters e
    where e.patient_id = p_patient
      and e.dentist_id = (select auth.uid())
  );
$$;

create or replace function public.can_read_clinical(p_patient uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_mfa()
    and exists (
      select 1 from public.patients p
      where p.id = p_patient
        and public.is_member(p.clinic_id)
        and (
          public.has_role(p.clinic_id, array['clinic_admin']::public.member_role[])
          or (
            public.has_role(p.clinic_id, array['dentist']::public.member_role[])
            and public.is_patient_dentist(p_patient)
          )
        )
    );
$$;
```

> `security definer` + `search_path = ''` evita secuestro de funciones. Todas las referencias van calificadas con `public.`.

#### Políticas por tabla

```sql
alter table public.patients enable row level security;

create policy patients_select on public.patients
for select to authenticated
using (
  public.is_member(clinic_id)
  and public.has_mfa()
  and (
    public.has_role(clinic_id, array['clinic_admin', 'reception']::public.member_role[])
    or (public.has_role(clinic_id, array['dentist']::public.member_role[]) and public.is_patient_dentist(id))
  )
);

create policy patients_insert on public.patients
for insert to authenticated
with check (
  public.is_member(clinic_id)
  and public.has_mfa()
  and public.has_role(clinic_id, array['clinic_admin', 'dentist', 'reception']::public.member_role[])
);

create policy patients_update on public.patients
for update to authenticated
using (
  public.is_member(clinic_id)
  and public.has_mfa()
  and (
    public.has_role(clinic_id, array['clinic_admin', 'reception']::public.member_role[])
    or (public.has_role(clinic_id, array['dentist']::public.member_role[]) and public.is_patient_dentist(id))
  )
)
with check (public.is_member(clinic_id) and public.has_mfa());
```

```sql
alter table public.anamnesis_versions enable row level security;

create policy anamnesis_select on public.anamnesis_versions
for select to authenticated
using (public.can_read_clinical(patient_id));

create policy anamnesis_insert on public.anamnesis_versions
for insert to authenticated
with check (public.can_read_clinical(patient_id));
```

> El check-in público **no** inserta directamente: llama a `public.submit_checkin(token, payload)`, `security definer`, que valida el token y escribe con el rol del dueño de la función. Así `anon` no tiene grants sobre la tabla.

```sql
alter table public.appointments enable row level security;

create policy appointments_select on public.appointments
for select to authenticated
using (
  public.is_member(clinic_id)
  and public.has_mfa()
  and (
    public.has_role(clinic_id, array['clinic_admin', 'reception']::public.member_role[])
    or (public.has_role(clinic_id, array['dentist']::public.member_role[]) and dentist_id = (select auth.uid()))
  )
);
```

```sql
alter table public.audit_log enable row level security;

create policy audit_select on public.audit_log
for select to authenticated
using (
  public.is_member(clinic_id)
  and public.has_role(clinic_id, array['clinic_admin']::public.member_role[])
  and public.has_mfa()
);

-- Sin políticas de insert/update/delete: solo triggers y funciones definer escriben.
revoke insert, update, delete on public.audit_log from authenticated, anon;
```

#### Reglas adicionales

- Activar RLS en **todas** las tablas, incluidas las de catálogo. Una tabla sin RLS es una fuga.
- `anon` no tiene `SELECT` sobre ninguna tabla de negocio.
- `anon` solo ejecuta: `public_checkin_context`, `submit_checkin`, `public_availability`, `public_book`.
- Las vistas usan `security_invoker = true` para heredar RLS.
- Las funciones `security definer` se revisan una a una; nunca reciben SQL dinámico.
- Los `service_role` solo se usan en scripts administrativos y en la invitación de usuarios.

### 6.4 Protección de columnas para Recepción

RLS es por fila, no por columna. Para que Recepción vea el directorio pero no datos clínicos:

1. Los datos clínicos viven en tablas separadas (`anamnesis_versions`, `encounters`, `tooth_findings`, `treatment_plan_items`), sin política para Recepción.
2. En `patients` se aplican **grants por columna**:

```sql
revoke all on table public.patients from anon, authenticated;
grant select (
  id, clinic_id, full_name, phone_e164, birth_date, zone,
  primary_dentist_id, first_source, first_campaign_id, status, created_at
) on public.patients to authenticated;
grant insert (
  clinic_id, full_name, normalized_name, phone_e164, phone_raw, email,
  birth_date, sex, zone, address, primary_dentist_id, first_source,
  first_campaign_id, created_by
) on public.patients to authenticated;
grant update (
  full_name, normalized_name, phone_e164, phone_raw, email, birth_date,
  sex, zone, address, primary_dentist_id, status, updated_at
) on public.patients to authenticated;
```

> Consecuencia obligatoria: todas las consultas usan columnas explícitas. `select *` falla para Recepción (y eso es bueno).

### 6.5 Storage

| Bucket | Público | Contenido | Política |
|---|---|---|---|
| `clinical` | No | Radiografías, fotos, consentimientos firmados | `can_read_clinical(patient_id)`; escritura solo staff clínico |
| `clinic` | Sí (solo logo) | Logo, favicon | Lectura pública; escritura admin |
| `imports` | No | CSV originales de migración | Admin; retención 90 días |

Ruta obligatoria: `clinical/{clinic_id}/{patient_id}/{uuid}.{ext}`.

```sql
create policy clinical_read on storage.objects
for select to authenticated
using (
  bucket_id = 'clinical'
  and public.can_read_clinical(((storage.foldername(name))[2])::uuid)
);
```

- URL firmada de 60 segundos para visualizar; nunca URL pública.
- Validar MIME y tamaño (máx. 20 MB por archivo) en la Server Action.
- Calcular SHA-256 y guardarlo en `patient_files`.
- No se permite subir HTML/SVG ejecutable.

### 6.6 Auditoría

**Qué se audita (mínimo):**

- Login exitoso/fallido, MFA, logout, invitación aceptada.
- Alta/edición/archivado/merge de paciente.
- Apertura de ficha clínica, exportación, descarga de adjunto.
- Creación/reprogramación/cancelación/cambio de estado de cita.
- Emisión y uso de token de check-in.
- Envío de anamnesis y consentimiento.
- Inicio/cierre/addenda de encuentro; hallazgos y plan.
- Emisión de factura, pago, reverso, cierre de caja.
- Compra/ajuste/consumo de stock.
- Cambio de rol, desactivación de miembro, cambio de configuración.

**Cómo:**

- Trigger genérico en tablas críticas (`audit_row()`).
- Llamadas explícitas en acciones que no son un simple `INSERT/UPDATE` (login, exportación, descarga).
- `action` con formato `dominio.verbo` (`patient.create`, `encounter.finish`).
- `before/after` en JSONB, con campos sensibles completos (es una tabla restringida).
- `ip_hash` = SHA-256(IP + pepper), no IP en claro.
- Retención mínima: la de la historia clínica (10 años). No se borra por petición del paciente si colisiona con la retención legal.

### 6.7 Cabeceras, rate limiting y secretos

**Cabeceras (en `next.config.ts` o `proxy.ts`):**

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'
Cache-Control: no-store (rutas autenticadas y con PHI)
```

**Rate limiting (tabla Postgres `rate_limit_events`):**

| Endpoint | Límite |
|---|---|
| Login | 5 / 15 min por IP + 10 / hora por email |
| Check-in context | 30 / 10 min por IP |
| Check-in submit | 5 / 10 min por token + 20 / hora por IP |
| Reserva pública | 10 / hora por IP + 3 citas activas por teléfono |
| Descarga de archivo | 60 / hora por usuario |
| Exportación clínica | 5 / día por usuario |

- Turnstile obligatorio en reserva pública y check-in si hay señales de abuso.
- Limpieza diaria de eventos antiguos con `pg_cron`.

**Secretos:**

- Solo en Vercel/Supabase, nunca en el repo.
- `SUPABASE_SERVICE_ROLE_KEY` marcada como “sensitive”; módulo `server-only`.
- Rotación documentada; ningún secreto en logs ni en Sentry.
- `.env.example` con nombres, sin valores.

### 6.8 Modelo de amenazas

| Amenaza | Vector | Mitigación |
|---|---|---|
| IDOR a ficha clínica | Cambiar UUID en la URL | RLS + guard de servidor + `notFound()` |
| Enumeración de citas | IDs secuenciales en QR | Token opaco 256 bits, hash, caducidad, un uso |
| Escalada de rol | Modificar JWT o UI | Roles en tabla + RLS; nunca en `user_metadata` |
| Fuga por props | Enviar `DB` completo al cliente | DTOs + pruebas de payload RSC |
| PHI en localStorage | Reutilizar la demo | Prohibido por lint/test E2E |
| Doble cobro | Reintento/doble clic | Idempotency key + lock + estado |
| Doble reserva | Dos recepcionistas | Exclusión GiST + 409 con alternativas |
| Stock negativo | Cerrar con insumos faltantes | RPC bloquea y lista faltantes |
| Fuerza bruta | Login/check-in | Rate limit + Turnstile + tokens largos |
| XSS | Contenido de paciente/WhatsApp | Escape por React; CSP; sin `dangerouslySetInnerHTML` salvo QR generado |
| Fuga por backup | Copia mal protegida | Bucket privado, cifrado, acceso mínimo, prueba de restore |
| Insider | Personal con acceso amplio | Mínimo privilegio + auditoría + MFA |
| Pérdida de dispositivo | Sesión abierta | Expiración, logout remoto, revocación de sesiones |

### 6.9 Cumplimiento (Bolivia, octubre 2026)

> Esto no es asesoría legal. Antes del piloto, un abogado boliviano debe revisar los textos y el contrato.

- **No hay ley integral de protección de datos vigente** a la fecha. Hay un proyecto en curso; verificar la Gaceta antes del go-live.
- **Constitución Política del Estado, art. 21** y acción de protección de privacidad.
- **Ley 3131 (Ejercicio Profesional Médico):** secreto médico inviolable, historia clínica y consentimiento como documentos médicos, confidencialidad.
- **Norma Técnica del Expediente Clínico (RM 0090/2008):** conservación **10 años**; confirmar con el colegio/SEDES.
- **Telemedicina:** no regulada específicamente; no es parte de Fase 1.
- **Transferencia internacional:** Supabase (Brasil), Vercel (EE. UU./Brasil), Sentry (EE. UU.). Informarlo en el aviso de privacidad y firmar DPA.
- **WhatsApp:** opt-in explícito, registro de fecha/canal/texto, baja fácil. No usar listas compradas ni enviar PHI en plantillas.
- **SIAT:** obligatorio para facturación en línea; **no** se construye en Fase 1. Se emite comprobante interno y se integra con proveedor autorizado en Fase 2.

**Documentos a producir antes del piloto:**

1. Aviso de privacidad en español.
2. Consentimiento informado v1 con hash y versión.
3. Consentimiento de datos y de recordatorios por WhatsApp (separados).
4. Política de retención y acceso.
5. Registro de actividades de tratamiento (RAT) simple.
6. DPA con Supabase, Vercel, Sentry y Meta (Fase 2).
7. Procedimiento de brecha (notificación en 72 h contractual).
8. Política interna de accesos y confidencialidad para el equipo.

---

## 7. Reglas de negocio

### 7.1 Tiempo, horarios y slots

- `clinics.timezone = 'America/La_Paz'` (UTC−4, sin horario de verano).
- Se guarda `timestamptz` en UTC; se muestra con `Intl`/`date-fns-tz`.
- Horario base: `clinic_hours` por día. La demo usa Lun–Vie 08:30–19:30 y Sáb 09:00–13:00 `[ejemplo]`; **debe confirmarse**.
- Domingos y feriados: `clinic_holidays` + `is_closed`.
- Un slot es válido si:
  1. cae dentro de `clinic_hours` del día;
  2. no es feriado;
  3. el odontólogo tiene turno (`dentist_schedules`) y no está de vacaciones (`dentist_time_off`);
  4. el gabinete está activo;
  5. no solapa cita activa del odontólogo, gabinete ni paciente;
  6. respeta la granularidad de 15 minutos;
  7. no está en el pasado (salvo backfill de admin con motivo).
- Duración: la del tratamiento, ajustable por el odontólogo entre 15 y 240 min.
- Zona horaria del navegador **no** decide nada: todo cálculo de negocio es server-side.

### 7.2 Máquina de estados de la cita

```
scheduled ──confirm──► confirmed ──check-in──► checked_in ──start──► in_progress ──finish──► completed
    │                      │                        │
    ├────cancel────────────┼────────────────────────┘
    └────no_show───────────┘
```

| Transición | Quién | Condición | Efecto |
|---|---|---|---|
| `scheduled → confirmed` | recepción/admin | — | evento + audit |
| `scheduled/confirmed → checked_in` | paciente (token) o recepción | token válido o acción manual | anamnesis + consentimiento + notificación |
| `checked_in → in_progress` | odontólogo/admin | encuentro creado | `started_at` |
| `in_progress → completed` | odontólogo/admin | RPC de cierre OK | factura + pago + stock + encuentro |
| `scheduled/confirmed/checked_in → cancelled` | recepción/admin | motivo obligatorio | libera slot |
| `scheduled/confirmed → no_show` | recepción/admin | pasada la hora + tolerancia | libera slot; métrica |
| `completed → *` | nadie | — | inmutable; corrección por addenda/reverso |
| `cancelled/no_show → *` | admin | motivo + audit | reapertura excepcional |

**Eliminar** el selector libre de estado del modal actual (`src/components/appointment-modal.tsx:154-160`). El estado se cambia con acciones explícitas, no con un `<select>`.

### 7.3 Check-in

1. Recepción (o admin) emite token para una cita `scheduled/confirmed`.
2. El sistema invalida tokens anteriores de esa cita (`revoked_at = now()`).
3. QR = `https://<dominio>/c/<token>`.
4. El paciente abre el enlace:
   - si el token no existe, expiró, fue usado o revocado → página genérica “Este enlace ya no está disponible. Pide uno nuevo en recepción.” (410).
   - si es válido → muestra nombre de pila, fecha, hora, tratamiento y odontólogo; **nunca** historia clínica.
5. Formulario en 3 pasos: identidad, salud, consentimiento + firma.
6. `submit_checkin` valida en una transacción:
   - token válido y no usado;
   - cita en estado correcto y fecha ±2 h;
   - payload Zod;
   - versión de consentimiento activa;
   - crea `anamnesis_version` (n+1), `patient_consent`, `checkin_submission`, marca token usado, cita → `checked_in`, notifica al odontólogo y a recepción, audita.
7. Reintento con el mismo token → 410, salvo que sea la misma submission (idempotencia por `token_id`).
8. Recepción ve “en sala de espera” y alergias **no**. El odontólogo ve la alerta con alergias.

**Firma:** nombre completo + trazo en canvas (PNG en Storage) + hash SHA-256 del payload canónico (nombre, timestamp, versión, token de cita). Guardar `signature_path` y `evidence`.

### 7.4 Encuentro clínico y cierre

**Inicio:** solo desde `checked_in`. Crea `encounter` (`in_progress`), copia el motivo de la anamnesis y pasa la cita a `in_progress`.

**Durante:** el odontólogo agrega hallazgos por pieza/superficie y arma el plan. Todo se guarda en servidor con autosave explícito (“Guardar”), no solo en memoria. El plan puede incluir ítems para hoy y para próximas sesiones.

**Cierre (`finish_encounter`):** una sola transacción.

```
1. Autenticar + MFA + permiso (dentista dueño o admin).
2. SELECT appointment FOR UPDATE; validar status = in_progress.
3. Si existe idempotency_key → devolver respuesta guardada.
4. SELECT encounter FOR UPDATE; validar status = in_progress.
5. Validar ítems “hoy”: pertenecen al paciente y al encuentro; precios congelados.
6. Calcular total; emitir factura (contador por clínica/año) + ítems.
7. Expandir receta de insumos; asignar lotes FEFO; si falta stock →
   RAISE EXCEPTION 'STOCK_SHORTAGE' con detalle; rollback total.
8. Insertar stock_movements negativos.
9. Insertar payment (total o parcial) + transaction (ingreso).
10. Marcar plan items “done”; insertar hallazgos; encounter → finished;
    appointment → completed; completed_at.
11. Insertar audit_log.
12. Guardar idempotency_key + response. COMMIT.
```

**Reglas:**

- No se puede cerrar sin al menos un ítem “hoy”.
- No se puede cerrar dos veces.
- Un pago parcial deja saldo; la factura queda `partially_paid`.
- Si el paciente no paga todo, se permite cerrar con saldo (política de la clínica) pero se registra.
- Si faltan insumos, **no** se cierra: se muestra la lista y se sugiere ajustar stock o el plan.
- El precio se congela al agregar el ítem; cambios posteriores de tarifa no alteran facturas pasadas.

### 7.5 Dinero y caja

- Precios en centavos; `formatBs` solo en presentación.
- Factura interna (no fiscal). Numeración `ALQ-YYYY-000001` por clínica.
- Métodos: efectivo, QR, transferencia, tarjeta (si la clínica lo acepta).
- Pago parcial permitido. `balance = total − sum(pagos confirmados)`.
- Reverso de pago: solo admin, motivo obligatorio, crea movimiento negativo y auditoría. No se borra.
- Descuento: solo admin, motivo, auditado; se refleja en la factura.
- **Sesión de caja:**
  - Se abre con fondo inicial (puede ser 0).
  - Solo una abierta por clínica.
  - Si llega un pago en efectivo sin sesión, se auto-abre con fondo 0 y se notifica a admin (decisión de Fase 1; documentar).
  - Al cerrar: `expected = fondo + ingresos efectivo − egresos efectivo`; se ingresa `counted`; `difference = counted − expected`; motivo obligatorio si ≠ 0.
  - El cierre es inmutable; corrección por reapertura admin auditada (Fase 1.5).
- **No** se integra SIAT ni conciliación bancaria en Fase 1.
- **No** se aceptan pagos en línea.

### 7.6 Inventario

- La receta se define por tratamiento (`treatment_supplies`).
- Al cerrar, se descuenta `qty × cantidad de ítems del plan`.
- Se usa FEFO: primero vence primero.
- Cada movimiento guarda `unit_cost_cents` del lote para poder calcular costo real después.
- Compra/ingreso: admin, lote, vencimiento, proveedor, costo.
- Ajuste: admin, motivo obligatorio; puede ser positivo o negativo.
- Merma: motivo y auditoría.
- Stock bajo: `qty_on_hand <= min_stock`; notificación al admin y a inventario.
- No se permite consumo que deje un lote negativo.
- Productos sin lote (`track_lots = false`) usan un lote interno “sin lote” con vencimiento nulo.

### 7.7 Atribución y campañas

- `patients.first_source` y `first_campaign_id` se fijan en la primera creación y **no se sobrescriben**.
- Cada cita guarda `source` y `campaign_id`.
- El portal público captura `utm_source/medium/campaign/content/term`, `referrer` y `landing_path` en `attribution_touches`.
- Recepción puede corregir el origen con motivo (auditado).
- Campañas: nombre, canal, `utm_campaign`, fechas, presupuesto. La inversión real se carga manual en Fase 1; Meta/TikTok en Fase 2.
- **Prohibido** mostrar alcance, clics o retorno inventados. Si no hay dato, se muestra “—”.

### 7.8 Notificaciones

- Al check-in: al odontólogo asignado y a recepción.
- Al crear/reprogramar/cancelar: al odontólogo.
- Stock bajo: a admin.
- Pago/cierre: a admin.
- Se guardan en `notifications`; el badge se marca leído por usuario.
- En Fase 1 no se envía WhatsApp ni email al paciente; solo notificaciones internas. Los recordatorios automáticos son Fase 2.

### 7.9 Validaciones

| Campo | Regla |
|---|---|
| Nombre | 3–120 caracteres, al menos 2 palabras para pacientes |
| Teléfono | `+591` + 8 dígitos que empiezan en 6 o 7; aceptar espacios/guiones al ingresar; normalizar a E.164 |
| Email | Formato válido; opcional |
| Fecha de nacimiento | No futura; edad ≤ 120 |
| Cita | Inicio/fin múltiplo de 15 min; duración 15–240; no pasada (salvo admin) |
| Anamnesis | Alergias: al menos una opción o “Ninguna”; antecedentes: al menos uno o “Ninguno”; motivo ≥ 3 caracteres; contacto de emergencia obligatorio |
| Consentimiento | Versión activa; checkbox obligatorio; firma ≥ 5 caracteres + trazo |
| Pago | > 0; ≤ saldo; método válido |
| Stock | > 0; unidad coherente; lote no vencido para consumo |
| Token | 32 bytes; hash único; no expirado; no usado |

### 7.10 Concurrencia e idempotencia

- **Agenda:** constraints de exclusión; la acción captura `23P01` y devuelve `SLOT_TAKEN` con 3 alternativas.
- **Edición:** `expected_updated_at`; si cambió, 409 y recarga.
- **Cierre:** `SELECT ... FOR UPDATE` + idempotency key.
- **Check-in:** token único + `unique (token_id)` en submissions.
- **Reserva pública:** exclusión + límite de citas activas por teléfono.
- **Caja:** único abierto; cierre con lock.

### 7.11 Retención y borrado

- Paciente: archivar, no borrar. Un borrado legal se evalúa con abogado; la historia se conserva 10 años.
- Citas: no se borran; se cancelan.
- Facturas/pagos: no se borran; se reversan.
- Stock: ledger inmutable.
- Auditoría: inmutable, retención ≥ 10 años.
- Archivos: si se reemplaza una radiografía, se conserva la anterior (versionado por `sha256`).

---

## 8. Contratos de servidor

### 8.1 Forma de resultado

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fields?: Record<string, string> } }

type ErrorCode =
  | 'UNAUTHENTICATED' | 'MFA_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'VALIDATION' | 'CONFLICT' | 'SLOT_TAKEN' | 'STOCK_SHORTAGE'
  | 'IMMUTABLE' | 'RATE_LIMITED' | 'INTERNAL'
```

- Mensajes en español, accionables, sin filtrar datos de otros pacientes.
- `fields` para errores de formulario.
- Los errores inesperados se loguean en Sentry con `requestId`; al usuario se le da un mensaje genérico.

### 8.2 Server Actions y RPC

| Dominio | Acción | Entrada | Salida | Permiso | Notas |
|---|---|---|---|---|---|
| Auth | `signIn` | email, password | `{ mfaRequired }` | público | Rate limit |
| Auth | `verifyMfa` | code | `{ ok }` | sesión aal1 | |
| Auth | `signOut` | — | `{ ok }` | sesión | |
| Auth | `inviteMember` | email, role, fullName | `{ inviteId }` | admin | service_role server-only |
| Auth | `acceptInvite` | token, password, fullName | `{ ok }` | público | |
| Pacientes | `searchPatients` | q, status, source, cursor | `PatientDirectoryPage` | staff | Server Component |
| Pacientes | `getPatient` | id | `PatientDetail` | según rol | DTO distinto por rol |
| Pacientes | `createPatient` | datos | `{ id }` | staff | Dedupe por teléfono |
| Pacientes | `updatePatient` | id, datos, expectedUpdatedAt | `{ ok }` | staff | 409 si cambió |
| Pacientes | `archivePatient` | id, reason | `{ ok }` | admin | Audit |
| Agenda | `getDayBoard` | date | `DayBoard` | staff | Server Component |
| Agenda | `getAvailability` | treatmentId, dentistId, from, to | `Slot[]` | staff/público | RPC |
| Agenda | `createAppointment` | patientId, dentistId, cabinetId, treatmentId, startsAt, source | `{ id }` | staff | `SLOT_TAKEN` |
| Agenda | `rescheduleAppointment` | id, startsAt, cabinetId, expectedUpdatedAt | `{ ok }` | staff | |
| Agenda | `changeAppointmentStatus` | id, to, reason | `{ ok }` | según transición | Audit |
| Check-in | `issueCheckinToken` | appointmentId | `{ url, expiresAt }` | recepción/admin | Revoca anteriores |
| Check-in | `getCheckinContext` | token | `CheckinContext` | público | RPC, sin PHI clínica |
| Check-in | `submitCheckin` | token, payload | `{ ok }` | público | RPC transaccional |
| Check-in | `reviewAnamnesis` | patientId, versionId | `{ ok }` | dentist/admin | Marca revisada |
| Consulta | `startEncounter` | appointmentId | `{ encounterId }` | dentist/admin | |
| Consulta | `getEncounter` | id | `EncounterView` | dentist/admin | |
| Consulta | `saveFindings` | encounterId, findings[] | `{ ok }` | dentist/admin | Reemplaza set del encuentro |
| Consulta | `savePlan` | encounterId, items[] | `{ ok }` | dentist/admin | Precios congelados |
| Consulta | `finishEncounter` | encounterId, payment, idempotencyKey | `FinishResult` | dentist/admin | RPC atómica |
| Consulta | `addAddendum` | encounterId, reason, notes | `{ id }` | dentist/admin | |
| Inventario | `listInventory` | q, lowOnly | `InventoryPage` | staff | Reception sin costos |
| Inventario | `receiveStock` | itemId, lot, expires, qty, cost, supplier | `{ ok }` | admin | |
| Inventario | `adjustStock` | itemId, lotId, delta, reason, note | `{ ok }` | admin | |
| Caja | `getCashDay` | date | `CashDay` | admin/recepción | |
| Caja | `openCashSession` | openingFloat | `{ id }` | admin/recepción | |
| Caja | `closeCashSession` | sessionId, counted, note | `{ difference }` | admin/recepción | |
| Caja | `registerPayment` | invoiceId, amount, method, reference | `{ id }` | admin/recepción | |
| Caja | `voidPayment` | paymentId, reason | `{ ok }` | admin | |
| Público | `getPublicAvailability` | treatmentId, from, to | `Slot[]` | anon | RPC, sin datos |
| Público | `createPublicBooking` | treatmentId, startsAt, name, phone, consent, utm | `{ code }` | anon | RPC, rate limit |
| Admin | `updateClinic` | datos | `{ ok }` | admin | |
| Admin | `upsertCabinet` | datos | `{ id }` | admin | No desactivar con citas |
| Admin | `upsertTreatment` | datos | `{ id }` | admin | |
| Admin | `setMemberRole` | memberId, role | `{ ok }` | admin | Audit |
| Admin | `deactivateMember` | memberId, reason | `{ ok }` | admin | Revoca sesiones |
| Admin | `searchAudit` | filtros | `AuditPage` | admin | |
| Admin | `exportPatient` | patientId, format | `{ url }` | admin/dentist | Audit |

### 8.3 Route Handlers

| Ruta | Método | Uso |
|---|---|---|
| `/api/auth/callback` | GET | Intercambio de código de Supabase |
| `/api/health` | GET | `{ status, db, version }` sin datos sensibles |
| `/api/files/[id]` | GET | Redirección a URL firmada (60 s), con permiso |
| `/api/webhooks/whatsapp` | POST | **Fase 2**; firma `X-Hub-Signature-256` |

> Todo lo demás son Server Actions o RPC. No se crea una API REST paralela.

### 8.4 DTOs

```ts
type PatientDirectoryItem = {
  id: string; fullName: string; phone: string; birthDate: string | null
  zone: string | null; status: PatientStatus; firstSource: AppointmentSource
  primaryDentistName: string | null; nextAppointmentAt: string | null
}

type PatientClinicalDetail = PatientDirectoryItem & {
  anamnesis: CurrentAnamnesis | null
  consents: ConsentSummary[]
  findings: ToothFinding[]
  plan: PlanItem[]
  encounters: EncounterSummary[]
  invoices: InvoiceSummary[]
}

type AppointmentCard = {
  id: string; startsAt: string; endsAt: string; status: AppointmentStatus
  patient: { id: string; fullName: string }
  dentist: { id: string; fullName: string }
  cabinet: { id: string; name: string }
  treatment: { id: string; name: string } | null
  source: AppointmentSource
  campaignName: string | null
}
```

> Ningún DTO incluye `allergies`, `conditions`, `medications` ni firma salvo `PatientClinicalDetail`, y ese DTO solo se construye tras `can_read_clinical`.

---

## 9. Migración de la demo, pantalla por pantalla

| Pantalla actual | Archivo | Decisión | Destino | Notas |
|---|---|---|---|---|
| Entrada / selector de rol | `src/app/page.tsx` | **Reescribir** | `/login` + redirect a `/inicio` | El selector y la demo guiada quedan en `demo-v1` |
| Inicio | `src/app/(app)/inicio/page.tsx` | **Conservar diseño, reescribir datos** | `/inicio` | RSC + DTO; corregir cola LIFO y ocupación |
| Agenda | `src/app/(app)/agenda/page.tsx` | **Reescribir** | `/agenda` | Server + client; teclado; sin `setCabinetCount` |
| Check-in recepción | `src/app/(app)/recepcion/page.tsx` | **Reescribir** | `/recepcion` | Token real; sin iframe ni celular simulado |
| Check-in paciente | `src/app/check-in/page.tsx` | **Reescribir** | `/c/[token]` | Público, RSC, sin picker de pacientes |
| Pacientes | `src/app/(app)/pacientes/page.tsx` | **Conservar + completar** | `/pacientes` | Alta/edición, paginación, dedupe |
| Ficha de paciente | `src/app/(app)/pacientes/[id]/page.tsx` | **Reescribir** | `/pacientes/[id]` | Tabs: datos, clínica, plan, pagos, archivos |
| Consulta (cola) | `src/app/(app)/consulta/page.tsx` | **Conservar** | `/consulta` | RSC |
| Consulta activa | `src/app/(app)/consulta/[id]/page.tsx` | **Reescribir** | `/consulta/[id]` | Encuentro persistente, hallazgos, plan, cierre |
| Inventario | `src/app/(app)/inventario/page.tsx` | **Conservar + ampliar** | `/inventario` | Lotes, movimientos, proveedores |
| Caja | `src/app/(app)/caja/page.tsx` | **Conservar + ampliar** | `/caja` + `/caja/cierre` | Sesión, arqueo, pagos parciales |
| WhatsApp | `src/app/(app)/whatsapp/page.tsx` | **Ocultar** | Fase 2 | Quitar del menú; conservar en demo |
| Analítica | `src/app/(app)/analitica/page.tsx` | **Ocultar** | Fase 2 | No mostrar cifras inventadas en producción |
| Ingesta OCR | `src/app/(app)/ingesta/page.tsx` | **Eliminar de prod** | `/configuracion/importar` | CSV real en Fase 1; OCR en Fase 2 |
| Equipo | `src/app/(app)/equipo/page.tsx` | **Reescribir** | `/equipo` | CRUD real de miembros e invitaciones |
| Ruta 25 días | `src/app/(app)/ruta/page.tsx` | **Eliminar de prod** | Documento comercial | No es producto |
| Portal público | `src/app/agendar-cita/page.tsx` | **Reescribir** | `/reservar` | RSC, slots reales, sin especialidades hardcodeadas |
| — | — | **Nuevo** | `/configuracion` | Clínica, gabinetes, horarios, tratamientos, recetas, consentimientos |
| — | — | **Nuevo** | `/auditoria` | Solo admin |
| — | — | **Nuevo** | `/mfa`, `/invitacion/[token]`, `/recuperar` | Auth |
| — | — | **Nuevo** | `/privacidad`, `/consentimiento` | Legal |

### 9.1 Qué se conserva tal cual

- `src/app/globals.css` y tokens visuales (con ajustes de rendimiento).
- `src/components/ui.tsx`: `Modal`, `Field`, `Stat`, `Avatar`, `Bar`, `Wordmark`, `NoAccess` (renombrar a `Forbidden`).
- `src/components/odontogram.tsx` (2D) y `odontogram3d.tsx` (opcional).
- `src/lib/teeth.ts`.
- Estructura de rutas `(app)` y `(public)`.

### 9.2 Qué se elimina o reemplaza

| Elemento | Acción |
|---|---|
| `src/lib/data.ts` | Reemplazar por `src/server/*` y `src/lib/domain/*` |
| `src/lib/seed.ts` | Mover a `supabase/seed.dev.sql` |
| `useDB`, `DB`, `useHydrated` | Eliminar |
| `setSession`, `setDemo`, `resetDemo`, `setCabinetCount` | Eliminar |
| `DEMO_APPT`, `DEMO_PATIENT`, `demo-guide.tsx` | Mover a rama demo |
| `PERMS`, `can()` | Reemplazar por `permissions.ts` server-side |
| `PHONE_RE` en componente | Mover a `lib/domain/phone.ts` |
| `Card.as` sin uso | Eliminar |
| `Module 'clinico'` sin pantalla | Eliminar; los permisos son capacidades |
| Import muerto `toMin` | Eliminar |
| `background-attachment: fixed`, blur excesivo en móvil | Ajustar |

### 9.3 Estrategia de refactor

1. **Congelar la demo** (tag + rama + deploy).
2. **Crear el esqueleto nuevo** en `main` sin borrar pantallas viejas.
3. **Migrar por verticales**: auth → pacientes → agenda → check-in → consulta → caja/inventario → portal.
4. Cada vertical: schema + RLS + queries + actions + pantalla + tests + gate.
5. Al terminar cada vertical, borrar la pantalla vieja y su código muerto.
6. No hacer un “big bang” de todas las pantallas a la vez.

---

## 10. UX, accesibilidad y rendimiento

### 10.1 Lo que se conserva

- Paleta, tipografía, vidrio, jerarquía y tono.
- La narrativa de “un solo flujo conectado”.
- El odontograma como pieza central de la consulta.
- La barra lateral/bottom nav.

### 10.2 Correcciones obligatorias

| # | Problema | Evidencia | Corrección |
|---|---|---|---|
| 1 | Horarios contradictorios | `data.ts:108`, `agenda:10-11`, `agendar:41-42` | Una sola fuente: `clinic_hours`; validar en servidor |
| 2 | Cola LIFO | `inicio:18` | Orden por `checked_in_at` ascendente (primero llegó, primero) |
| 3 | Cambiar gabinetes oculta citas | `data.ts:279-281` | Activar/desactivar; bloquear si hay citas futuras |
| 4 | Agenda no operable por teclado | `agenda:91-98` | Grid con flechas, Enter para crear, Tab a citas |
| 5 | Tablist sin flechas | `agenda:113-126` | Implementar patrón ARIA tabs completo |
| 6 | 3D inoperable por teclado | `odontogram:74-89` | 2D por defecto; selector de pieza siempre visible |
| 7 | Check-in expone nombres | `check-in:180-198` | Eliminar picker; solo token |
| 8 | QR sin caducidad | `recepcion:27` | Token 256 bits, 1 uso, expiración |
| 9 | Cita “atendida” sin cobro | `appointment-modal:154-160` | Quitar selector de estado; transiciones explícitas |
| 10 | Stock se recorta a 0 en silencio | `data.ts:391-393` | Bloquear cierre y listar faltantes |
| 11 | Histórico no se puede quitar | `consulta/[id]:125-133` | Hallazgos por encuentro; no editar histórico |
| 12 | Recepción ve tratamientos y pagos | `pacientes/[id]:54,66` | DTO sin datos clínicos ni montos si no corresponde |
| 13 | Feedback de conflicto sin alternativas | `appointment-modal:161` | Devolver 3 horarios libres |
| 14 | Fechas pasadas permitidas | `appointment-modal:124-129` | Validación server-side |
| 15 | Textos de demo en producto | `[ejemplo]`, `(demo)` | Reemplazar por datos reales o “—”; quitar en prod |
| 16 | Modal no bloquea scroll | `ui.tsx:94-124` | `overflow: hidden` en `body` al abrir |
| 17 | Blur y `background-attachment` | `globals.css:29-33,42` | Reducir en móvil; probar gama baja |
| 18 | Sin `loading/error/not-found` | `src/app` | Añadir por segmento |

### 10.3 Agenda: modelo de interacción

- Vista día por gabinete (desktop) y por gabinete seleccionado (móvil).
- Clic en espacio libre → modal con fecha/hora/gabinete precargados.
- Clic en cita → panel lateral con datos, acciones y vínculo a consulta.
- Arrastrar para mover: **Fase 1.5**; en Fase 1, “Reprogramar” en el panel.
- Teclado:
  - `Tab` entra a la grilla; flechas mueven entre celdas de 30 min;
  - `Enter` crea en la celda; `Esc` cierra;
  - `Ctrl/Cmd + ←/→` cambia de día.
- Estados con texto y color; no depender del color.
- Cabecera: fecha, “Hoy”, filtro por odontólogo, botón “Nueva cita”.

### 10.4 Consulta

- Dos columnas: paciente (alergias, antecedentes, historia) + trabajo clínico.
- Odontograma 2D por defecto; botón “Vista 3D” opcional.
- Panel de pieza: condición, superficies, hallazgo vs tratamiento.
- Plan: ítems, precio, “Hoy” / “Próxima sesión”, total.
- Cierre: resumen, método de pago, monto (total o parcial), confirmación.
- Todo guardado en servidor; indicador “Guardado hace X”.
- Si otro usuario modifica el encuentro, aviso y recarga.

### 10.5 Recepción

- Lista de llegadas del día con estados.
- Botón “Mostrar QR” por cita; el QR se genera server-side y expira.
- Al escanear, la pantalla se actualiza (Realtime o polling 10 s).
- Recepción ve “en sala de espera”, hora y odontólogo; **no** alergias.
- Sin celular simulado; el paciente usa su propio teléfono.

### 10.6 Portal público

- SSR real con metadata, OG y `robots`.
- Pasos: tratamiento → día/hora → datos → confirmación.
- Slots reales; si se ocupa, mensaje y alternativas.
- Consentimiento de datos y de recordatorios (checkbox separado).
- `utm_*` capturados y persistidos.
- Turnstile invisible.
- Confirmación con código de cita y enlace de check-in (token de un solo uso).
- Páginas legales enlazadas.

### 10.7 Accesibilidad (WCAG 2.2 AA)

- Contraste mínimo 4.5:1 en texto; revisar `--color-muted` sobre vidrio.
- Foco visible en todos los interactivos; no eliminar outlines.
- Formularios con `<label>`, `aria-describedby`, `aria-invalid`, errores `role="alert"`.
- Tablas con `<caption>`, `scope`, y navegación.
- Modales con `<dialog>`, foco atrapado, `Esc`, retorno de foco.
- No transmitir información solo por color.
- `prefers-reduced-motion` respetado.
- Zoom 200 % sin pérdida de contenido.
- Pruebas con VoiceOver y teclado en los 5 flujos críticos.

### 10.8 Rendimiento

- Presupuesto: JS inicial < 250 KB gz para el shell; 3D en chunk aparte.
- `next/dynamic` para 3D; `ssr: false`.
- Eliminar `background-attachment: fixed`; limitar `backdrop-filter` a desktop.
- Paginación server-side en pacientes (25/página) y búsqueda con debounce.
- Índices en todas las consultas de lista.
- Imágenes con `next/image` y tamaños explícitos.
- Evitar N+1: una query por pantalla, no una por fila.
- Realtime solo en agenda y notificaciones; el resto, revalidate on demand.

---

## 11. Plan de ejecución

### 11.1 Resumen

| Sprint | Días | Foco | Gate |
|---|---:|---|---|
| 0. Preparación | 2 | Repo, entornos, CI, dependencias, decisiones | G0: base reproducible |
| 1. Fundación segura | 5 | Schema base, auth, RLS, auditoría | G1: nadie ve lo que no debe |
| 2. Pacientes y agenda | 5 | CRM, agenda multi-gabinete, concurrencia | G2: reserva sin choques |
| 3. Check-in y portal | 4 | Token, anamnesis, consentimiento, reserva pública | G3: paciente real sin papel |
| 4. Consulta, caja e inventario | 6 | Encuentro, factura, pago, stock, cierre | G4: flujo completo |
| 5. Endurecimiento y piloto | 3 | Seguridad, backups, performance, UAT | G5: listo para producción |
| **Total** | **25** | | |

> Los días son de desarrollo efectivo de un equipo pequeño asistido por agente. No incluyen esperas de terceros (Meta, abogado, datos de la clínica). Esas esperas corren en paralelo y pueden mover el calendario.

### 11.2 Tareas detalladas

#### Sprint 0 — Preparación (2 días)

| ID | Tarea | Depende | Est. | Aceptación |
|---|---|---|---:|---|
| F1-001 | `git init`, commit inicial, tag `demo-v1`, rama `demo` congelada, `main` para producción | — | 0,5 | `git log` limpio; demo desplegable desde su rama |
| F1-002 | Crear proyectos Supabase `alquimia-prod` y `alquimia-staging` en `sa-east-1`; instalar CLI; `supabase init` | — | 0,5 | `supabase db reset` funciona en local |
| F1-003 | Crear proyectos Vercel (prod/staging), dominio, variables de entorno; región `gru1` | — | 0,5 | Deploy vacío con `/api/health` OK |
| F1-004 | Añadir dependencias: `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `react-hook-form`, `@hookform/resolvers`, `date-fns`, `@date-fns/tz`, `libphonenumber-js`, `signature_pad`, `@sentry/nextjs`; dev: `vitest`, `@testing-library/react`, `playwright`, `eslint`, `prettier` | F1-001 | 0,5 | `npm run typecheck` y `npm run lint` pasan |
| F1-005 | Scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `test`, `test:e2e`, `db:reset`, `db:types`, `db:lint` | F1-004 | 0,5 | Todos ejecutan sin error |
| F1-006 | CI en GitHub Actions: install, typecheck, lint, unit, build; branch protection en `main` | F1-004 | 0,5 | PR falla si algo falla |
| F1-007 | `docs/arquitectura.md`, `docs/seguridad.md`, `.env.example`; Sentry con PII scrubbing | F1-003 | 0,5 | Documentación revisable |
| F1-008 | Taller con la clínica: matriz de permisos, horarios, gabinetes, precios, consentimiento, política de stock y caja | — | 1 | Acta firmada o correo de confirmación |

**Gate G0:** `supabase db reset` + `npm run build` + CI verde + decisiones de negocio documentadas.

#### Sprint 1 — Fundación segura (5 días)

| ID | Tarea | Depende | Est. | Aceptación |
|---|---|---|---:|---|
| F1-010 | Migración `0001_extensions_enums.sql`: `pgcrypto`, `btree_gist`, `citext`, `pg_trgm`, enums, `set_updated_at()` | F1-002 | 0,5 | `db reset` limpio |
| F1-011 | Migración `0002_clinic_identity.sql`: `clinics`, `profiles`, `clinic_members`, `member_invites`; trigger de perfil desde `auth.users` | F1-010 | 0,5 | Invitación crea perfil y miembro |
| F1-012 | Migración `0003_schedule.sql`: `clinic_hours`, `clinic_holidays`, `cabinets`, `dentist_schedules`, `dentist_time_off` | F1-011 | 0,5 | Se puede configurar una semana |
| F1-013 | Migración `0004_catalog.sql`: `treatment_categories`, `treatments`, `supply_items`, `suppliers`, `treatment_supplies` | F1-011 | 0,5 | Receta por tratamiento consultable |
| F1-014 | Migración `0005_rls_core.sql`: helpers `is_member`, `has_role`, `has_mfa`, `is_patient_dentist`, `can_read_clinical`; RLS en tablas base | F1-011 | 1 | Tests RLS base pasan |
| F1-015 | Grants por columna para `patients`; revocar `anon`; políticas de catálogo | F1-014 | 0,5 | Recepción no puede `select *` |
| F1-016 | Buckets `clinical`, `clinic`, `imports` + políticas de Storage | F1-014 | 0,5 | Recepción no descarga un consentimiento |
| F1-017 | Auth: `/login`, `/mfa`, `/recuperar`, `/invitacion/[token]`; Server Actions `signIn`, `verifyMfa`, `signOut`, `inviteMember`, `acceptInvite` | F1-011 | 1 | Login + MFA + invitación E2E |
| F1-018 | `proxy.ts` (refresh de sesión, headers, redirect), guards `requireMember`, `requireRole`, `requireMfa`; página `/forbidden` | F1-017 | 0,5 | URL directa sin sesión → login; sin permiso → 403 |
| F1-019 | `audit_log` + `audit_row()` + triggers en tablas críticas; visor `/auditoria` (admin) | F1-014 | 1 | Cada cambio deja fila con actor y hora |
| F1-020 | `seed.dev.sql` con clínica ficticia, 3 roles, 3 gabinetes, 10 tratamientos, 8 insumos, 12 pacientes; tipos generados | F1-013 | 0,5 | `db reset` + seed reproducible |
| F1-021 | Suite RLS: anon, recepción, dentista A, dentista B, admin; matriz completa | F1-015 | 1 | 100 % de casos esperados |
| F1-022 | CI con Supabase local: `db reset`, `db lint`, tests RLS | F1-021 | 0,5 | Pipeline < 10 min |
| F1-023 | Pantalla `/equipo` real: listar, invitar, cambiar rol, desactivar | F1-017 | 0,5 | Admin gestiona sin tocar la DB |

**Gate G1 (seguridad):**

- `anon` no lee ninguna tabla de negocio.
- Recepción no lee `anamnesis_versions`, `encounters`, `tooth_findings`, `treatment_plan_items`, `patient_files` clínicos.
- Dentista A no lee pacientes de dentista B.
- Admin lee todo.
- Sin MFA no hay acceso a PHI.
- `audit_log` registra las escrituras.
- Test de URL directa y de petición directa a PostgREST.

**No avanzar si G1 falla.**

#### Sprint 2 — Pacientes y agenda (5 días)

| ID | Tarea | Depende | Est. | Aceptación |
|---|---|---|---:|---|
| F1-030 | Migración `0006_patients.sql`: tabla, dedupe, índices, contador de versión de anamnesis, políticas | F1-014 | 0,5 | Alta repetida con mismo teléfono devuelve conflicto |
| F1-031 | Migración `0007_appointments.sql`: tabla, enums, exclusiones GiST, `appointment_events` | F1-030 | 0,5 | Constraints probados |
| F1-032 | Servicio de disponibilidad: horas, feriados, turnos, time off, solapes; tests unitarios | F1-031 | 1 | Slots correctos en 20 casos |
| F1-033 | Queries/actions de pacientes + DTOs por rol; búsqueda paginada y normalizada | F1-030 | 1 | Recepción no recibe campos clínicos |
| F1-034 | Pantalla `/pacientes` y `/pacientes/[id]` (datos, próxima cita, origen) | F1-033 | 1 | Alta, edición, archivo, búsqueda |
| F1-035 | Actions de agenda: crear, reprogramar, cancelar, cambiar estado; `SLOT_TAKEN` con alternativas | F1-031 | 1 | 20 reservas concurrentes → 1 éxito, 19 conflictos |
| F1-036 | Pantalla `/agenda`: día por gabinete, teclado, panel de cita, filtros | F1-035 | 1 | Crear/mover/cancelar sin choques |
| F1-037 | `/recepcion`: lista de llegadas, estados, emisión de token (sin QR aún) | F1-035 | 0,5 | Recepción ve el día y cambia estados |
| F1-038 | Notificaciones internas + Realtime/polling; campana funcional | F1-036 | 0,5 | Check-in y cambios aparecen en < 10 s |
| F1-039 | Tests E2E: crear paciente, agendar, conflicto, reprogramar, permisos | F1-036 | 1 | 5 escenarios verdes |

**Gate G2:** dos recepcionistas no pueden reservar el mismo sillón; el odontólogo solo ve su agenda; la agenda es operable con teclado.

#### Sprint 3 — Check-in y portal público (4 días)

| ID | Tarea | Depende | Est. | Aceptación |
|---|---|---|---:|---|
| F1-040 | Migración `0008_checkin.sql`: `checkin_tokens`, `checkin_submissions`, `consent_versions`, `patient_consents` | F1-030 | 0,5 | Token único y hash |
| F1-041 | RPC `public_checkin_context(token)` y `submit_checkin(token, payload)`: validación, transacción, auditoría, rate limit | F1-040 | 1 | Reuso/expirado → 410; válido → cita en espera |
| F1-042 | Pantalla pública `/c/[token]`: 3 pasos, consentimiento, firma canvas, éxito; SSR y metadata | F1-041 | 1 | Funciona en celular real, sin sesión |
| F1-043 | Revisión de anamnesis en ficha clínica; alerta de alergias; versión actual | F1-041 | 0,5 | Odontólogo ve y marca revisada |
| F1-044 | Portal `/reservar`: tratamientos, días, slots reales, datos, consentimiento, UTM | F1-031 | 1 | Reserva aparece en agenda con origen |
| F1-045 | RPC `public_availability` y `public_book`; Turnstile; límite por teléfono/IP; sin enumeración | F1-044 | 1 | No filtra datos; no duplica |
| F1-046 | Páginas `/privacidad`, `/consentimiento`; versiones de texto con hash | F1-040 | 0,5 | Texto versionado y enlazado |
| F1-047 | E2E: token bueno/malo/expirado/reusado, check-in en otro dispositivo, reserva pública | F1-042 | 1 | 6 escenarios verdes |

**Gate G3:** un paciente puede reservar desde su celular y hacer check-in sin papel; recepción no ve alergias; odontólogo sí; el token no se reutiliza.

#### Sprint 4 — Consulta, caja e inventario (6 días)

| ID | Tarea | Depende | Est. | Aceptación |
|---|---|---|---:|---|
| F1-050 | Migración `0009_clinical.sql`: `encounters`, `tooth_findings`, `treatment_plan_items`, `encounter_addenda` | F1-031 | 0,5 | RLS clínica |
| F1-051 | Migración `0010_inventory.sql`: `supply_lots`, `stock_movements`, triggers, FEFO | F1-013 | 0,5 | Stock nunca negativo |
| F1-052 | Migración `0011_billing.sql`: `invoices`, `invoice_items`, `payments`, `invoice_counters`, `cash_sessions`, `transactions` | F1-050 | 0,5 | Numeración y saldos correctos |
| F1-053 | Pantalla de consulta: inicio, hallazgos, plan, totales, guardado | F1-050 | 1 | Todo persiste al recargar |
| F1-054 | RPC `finish_encounter`: factura, pago, stock, encuentro, cita, auditoría, idempotencia | F1-051, F1-052 | 1,5 | Reintento no duplica; falta stock bloquea |
| F1-055 | UI de cierre: resumen, método, pago total/parcial, resultado | F1-054 | 0,5 | Cobro visible en caja |
| F1-056 | `/inventario`: stock, mínimos, lotes, receta, ingreso, ajuste, alertas | F1-051 | 1 | Admin repone; dentista solo lee |
| F1-057 | `/caja` + `/caja/cierre`: día, métodos, movimientos, apertura, arqueo, diferencia | F1-052 | 1 | Cierre cuadra o explica diferencia |
| F1-058 | Reverso de pago, descuento y addenda con motivo + auditoría | F1-054 | 0,5 | Admin revierte sin borrar |
| F1-059 | Tests: unitarios de dinero/stock, RLS clínica, idempotencia, E2E flujo completo | F1-054 | 1 | 100 % de reglas críticas |
| F1-060 | Optimización de consultas e índices; revisión de N+1 | F1-053 | 0,5 | Agenda y ficha < 300 ms server |

**Gate G4 (flujo completo):**

- Check-in → inicio → hallazgos → plan → cierre → factura → pago → stock → caja → auditoría.
- Doble cierre bloqueado.
- Pago parcial deja saldo.
- Falta de stock bloquea con lista.
- Cierre de caja con diferencia explicada.

#### Sprint 5 — Endurecimiento y piloto (3 días)

| ID | Tarea | Depende | Est. | Aceptación |
|---|---|---|---:|---|
| F1-070 | CSP, headers, `no-store`, rate limits, Turnstile, scrubbing de Sentry | F1-018 | 0,5 | Escaneo básico sin hallazgos críticos |
| F1-071 | Backups: daily de Supabase + `pg_dump` nocturno a B2 + sync de Storage; simulacro de restore | F1-002 | 0,5 | RTO/RPO documentados y probados |
| F1-072 | Runbooks: incidente, rollback, restore, rotación de claves, alta/baja de usuario | F1-071 | 0,5 | Otro técnico puede ejecutarlos |
| F1-073 | Performance y accesibilidad: Lighthouse, axe, teclado, VoiceOver, móvil gama baja | F1-053 | 0,5 | LCP < 2,5 s; 0 críticos axe |
| F1-074 | Importador CSV: plantilla, staging, validación, dedupe, vista previa, aprobación, auditoría | F1-033 | 0,5 | 100 pacientes de prueba sin duplicados |
| F1-075 | UAT con la clínica: guion de 10 casos, correcciones, acta | G4 | 0,5 | Acta firmada |
| F1-076 | Capacitación por rol + guías de 1 página | F1-075 | 0,25 | Recepción y odontólogo operan solos |
| F1-077 | Deploy a producción, monitoreo, alertas, primer paciente real | F1-076 | 0,25 | Flujo real completado |

**Gate G5 (producción):** backups probados, UAT firmada, accesos reales creados, WhatsApp/OCR/SIAT explícitamente fuera, plan de soporte activo.

### 11.3 Pista paralela de negocio (no bloquea código)

| Semana | Acción | Responsable |
|---|---|---|
| 1 | Pedir a la clínica: precios, horarios, gabinetes, logo, WhatsApp, equipo, consentimiento | Lumen + Doc |
| 1 | Iniciar verificación del negocio en Meta y revisión del número histórico | Lumen |
| 1 | Abogado: aviso de privacidad, consentimiento, DPA | Clínica + Lumen |
| 2 | Confirmar que el número está en WhatsApp Business app (coexistencia) o personal | Clínica |
| 2 | Decidir facturación/SIAT con contador | Clínica |
| 3 | Preparar CSV de pacientes y digitalizar fichas priorizadas | Recepción |
| 4 | UAT y capacitación | Lumen + equipo |
| 5 | Piloto con pacientes reales | Clínica |

### 11.4 Lo que el agente NO debe hacer en Fase 1

- No implementar WhatsApp, OCR, SIAT, analítica avanzada ni pagos en línea.
- No reescribir el diseño visual “porque sí”.
- No añadir un ORM sobre Supabase ni una API REST paralela.
- No usar `service_role` en el cliente.
- No crear endpoints públicos sin rate limit.
- No borrar la demo ni sus datos.
- No hacer migraciones destructivas sin backup y ventana.
- No mezclar datos reales con seeds.
- No “arreglar” la UI con `!important` ni ocultar errores.

---

## 12. Testing y QA

### 12.1 Pirámide

| Nivel | Herramienta | Qué cubre | Cobertura objetivo |
|---|---|---|---|
| Unitario | Vitest | Dinero, slots, estados, permisos, teléfono, edad, FEFO | 90 % de `lib/domain` y `server/actions` |
| Integración DB | Vitest + Supabase local / pgTAP | Constraints, triggers, RPC, RLS | 100 % de reglas críticas |
| E2E | Playwright | 10 flujos, desktop + móvil | 100 % de flujos críticos |
| Accesibilidad | axe + manual | WCAG 2.2 AA | 0 críticos |
| Performance | Lighthouse + Profiler | LCP, interacción, bundle | Presupuestos de 10.8 |
| Seguridad | Tests propios + revisión | IDOR, RLS, rate limit, headers | 0 hallazgos altos |
| UAT | Guion con la clínica | Operación real | Acta firmada |

### 12.2 Matriz RLS esperada

| Tabla | anon | reception | dentist (propio) | dentist (ajeno) | admin |
|---|---|---|---|---|---|
| `patients` | 0 | lectura columnas básicas | lectura/edición | 0 | total |
| `anamnesis_versions` | 0 | 0 | lectura/inserción | 0 | total |
| `patient_consents` | 0 | 0 | lectura | 0 | total |
| `appointments` | 0 | total | solo su agenda | 0 | total |
| `encounters` | 0 | 0 | lectura/escritura | 0 | total |
| `tooth_findings` | 0 | 0 | lectura/escritura | 0 | total |
| `treatment_plan_items` | 0 | 0 | lectura/escritura | 0 | total |
| `invoices` | 0 | lectura | lectura propia | 0 | total |
| `payments` | 0 | inserción/lectura | lectura propia | 0 | total |
| `transactions` | 0 | lectura/inserción | 0 | 0 | total |
| `supply_items` | 0 | lectura sin costo | lectura | lectura | total |
| `stock_movements` | 0 | 0 | lectura | lectura | total |
| `audit_log` | 0 | 0 | 0 | 0 | lectura |
| `checkin_tokens` | 0 | inserción/lectura | 0 | 0 | total |
| `notifications` | 0 | propias | propias | propias | propias |

> “0” significa 0 filas, no un error visible. La UI debe mostrar 403/404 sin filtrar la existencia del recurso.

### 12.3 Escenarios E2E obligatorios

1. Admin invita a recepción; recepción activa cuenta, enrola MFA y entra.
2. Recepción crea paciente y cita; el odontólogo asignado la ve; otro odontólogo no.
3. Dos sesiones intentan reservar el mismo slot; una recibe alternativas.
4. Recepción emite QR; se abre en incógnito; check-in completo; recepción ve “en espera” sin alergias; odontólogo ve alergia.
5. Token reutilizado/expirado → 410; no se puede reabrir la cita.
6. Odontólogo inicia, marca caries y corona, arma plan, cierra con pago QR; factura, stock y caja cuadran.
7. Reintento de cierre con la misma idempotency key → sin duplicados.
8. Pago parcial + segundo pago + saldo 0; factura `paid`.
9. Cierre de caja con diferencia; motivo obligatorio; auditoría.
10. Reserva pública con `utm_campaign`; aparece en agenda con campaña; sin datos falsos.
11. Recepción intenta abrir `/pacientes/[id]` clínico y `/consulta/[id]` → 403 sin datos en el payload.
12. Restauración de backup en staging (manual, documentada).

### 12.4 Seguridad: pruebas específicas

- IDOR: cambiar UUID de paciente/cita/factura por otro de la misma clínica y de otra.
- Escalada: reception intenta `update` de rol; dentist intenta `void payment`.
- Fuga: buscar strings de alergias/nombres en el HTML/RSC payload de rutas de recepción.
- Almacenamiento: `localStorage`, `sessionStorage`, IndexedDB vacíos tras todo el flujo.
- Rate limit: 20 intentos de login y 20 de check-in.
- Headers: CSP, HSTS, `no-store`.
- Archivos: subir `.html`, `.svg`, `.exe`; verificar rechazo.
- Token: entropía, hash, expiración, un solo uso.

### 12.5 CI/CD

```
PR → install → typecheck → lint → unit → supabase db reset → db lint → RLS tests → build → e2e (local) → preview
main → todo + deploy staging → smoke → aprobación → deploy prod
```

- Migraciones se aplican con `supabase db push` desde CI, nunca a mano.
- Un PR que toca `supabase/migrations` requiere revisión adicional.
- El deploy a producción es manual y con ventana.

---

## 13. Infraestructura, operación y costos

### 13.1 Costos mensuales estimados (USD)

| Concepto | Costo |
|---|---:|
| Supabase Pro (Micro, `sa-east-1`) | 25 |
| Vercel Pro (1 asiento) | 20 |
| Dominio (`.bo` o `.com`) | 1–2 |
| Resend (invitaciones/recuperación) | 0–20 |
| Sentry (free/Team) | 0–26 |
| Backblaze B2 (50 GB) | 1–5 |
| WhatsApp (Fase 2: ~1.500 utility + 1.000 service) | 0 en Fase 1; 17–25 después |
| **Total Fase 1** | **~47–98** |
| PITR opcional | +100 |
| Revisión legal/DPA (one-time) | 300–800 |

> No incluye mano de obra. No incluye SIAT, OCR ni BSP de WhatsApp.

### 13.2 Backups y recuperación

- Supabase Pro: backup diario, 7 días.
- `pg_dump` nocturno a B2 con retención 30 días (script + GitHub Action).
- Sync de Storage clínico a B2 (semanal).
- **Simulacro de restore trimestral** en staging; documentar tiempo real.
- RPO objetivo: 24 h. RTO objetivo: 4 h.
- PITR: recomendado después del piloto si el presupuesto lo permite.

### 13.3 Monitoreo y alertas

- Sentry: errores de servidor/cliente, sin PII.
- `/api/health`: DB, versión, latencia.
- Alertas: 5xx > 1 %, latencia p95 > 2 s, fallo de backup, cola de jobs atascada, stock bajo crítico.
- Logs estructurados con `requestId`, `clinicId`, `userId` (nunca nombre/teléfono).
- Panel de Supabase: conexiones, CPU, disco, slow queries.

### 13.4 Runbooks mínimos

1. **Incidente de seguridad:** contener, rotar claves, revocar sesiones, evaluar notificación, post-mortem.
2. **Restore de base:** detener escrituras, restaurar, verificar integridad, reabrir.
3. **Rollback de deploy:** Vercel “Promote previous”, verificar migraciones compatibles.
4. **Alta/baja de usuario:** invitar, asignar rol, revocar sesiones, auditar.
5. **Migración fallida:** backup previo, transacción, restaurar, comunicar.
6. **Stock inconsistente:** identificar movimientos, ajuste admin con motivo, auditar.

### 13.5 Escalabilidad

- Una clínica, 3–5 gabinetes, 1–5 usuarios concurrentes: sobra con Micro.
- Índices y paginación desde el día 1 para no reescribir a los 5.000 pacientes.
- Realtime limitado a agenda/notificaciones.
- Storage: radiografías ~5 MB × 20/día ≈ 3 GB/mes; planificar a 12 meses.
- Si entra el spa o una segunda sede, el modelo ya tiene `clinic_id`; falta UI de selección y políticas multi-clínica.

---

## 14. Migración de datos de la clínica

### 14.1 Fuentes

| Fuente | Formato | Volumen estimado | Prioridad |
|---|---|---|---|
| Excel de pacientes | `.xlsx` / `.csv` | 500–5.000 filas | Alta |
| Excel de citas históricas | `.xlsx` | 1.000–10.000 | Media |
| Fichas en papel | Papel / foto / PDF | 500–3.000 | Media |
| Inventario actual | Excel | 50–200 ítems | Alta |
| Precios y tratamientos | Lista / Excel | 20–80 | Alta |

### 14.2 Plantilla CSV de pacientes

```csv
nombre_completo,telefono,fecha_nacimiento,zona,email,odontologo,ultima_visita,notas
Juan Carlos Quispe Mamani,+59171234567,1990-04-12,Achumani,,Doc,2026-09-20,
```

Reglas:
- Teléfono obligatorio; si falta, la fila va a revisión, no se descarta.
- Fecha `YYYY-MM-DD`; si viene `DD/MM/YYYY`, se normaliza y se marca.
- Nombre obligatorio; dedupe por teléfono.
- Odontólogo se mapea por nombre; si no existe, queda sin asignar.
- Notas van a un campo administrativo, no a la historia clínica.

### 14.3 Proceso

1. **Inventario de fuentes** y responsable por archivo.
2. **Carga a staging** (`import_batches`, `import_rows`) con hash por fila.
3. **Validación** automática: campos, formato, duplicados, fechas imposibles.
4. **Vista previa** con errores por fila y confianza.
5. **Revisión humana obligatoria**; nada se guarda sin aprobar.
6. **Importación** transaccional por lote; si falla, rollback del lote.
7. **Auditoría** de quién importó y qué.
8. **Reporte** de importados, omitidos y duplicados.
9. **Cutover:** congelar Excel, importar, verificar conteos, comunicar.
10. **Convivencia:** 2–4 semanas con Excel en paralelo solo para control, no para operar.

### 14.4 Fichas en papel

- Fase 1: **no OCR**. Se escanean y se adjuntan al paciente (`patient_files`), con índice manual.
- Se priorizan pacientes activos y con tratamiento en curso.
- El contenido clínico histórico se transcribe solo si el Doc lo considera necesario; si no, queda como adjunto consultable.
- Fase 2: OCR con revisión humana, confianza por campo y firma de “revisado por”.

### 14.5 Criterios de aceptación de la migración

- 0 pacientes duplicados por teléfono.
- 100 % de filas con error tienen motivo y responsable.
- Conteo importado = conteo aprobado.
- Cada paciente importado tiene origen `historical`.
- El Doc valida una muestra aleatoria de 20 fichas.
- Existe backup previo y posibilidad de revertir el lote.

---

## 15. Checklist legal y operativo antes del piloto

- [ ] Aviso de privacidad publicado en `/privacidad`.
- [ ] Consentimiento informado v1 aprobado por la clínica y el abogado.
- [ ] Consentimiento de datos y de WhatsApp separados.
- [ ] DPA firmado con Supabase, Vercel, Sentry (y Meta en Fase 2).
- [ ] Política de retención (10 años) y acceso.
- [ ] Procedimiento de brecha y contacto responsable.
- [ ] Registro de actividades de tratamiento.
- [ ] Confidencialidad firmada por el equipo.
- [ ] Roles y accesos revisados; cuentas genéricas eliminadas.
- [ ] MFA activo en todas las cuentas.
- [ ] Backups y restore probados.
- [ ] Dominio, correo y certificados listos.
- [ ] Equipos de recepción y gabinetes con navegador actualizado.
- [ ] Internet estable y plan B (hotspot) documentado.
- [ ] Facturación: decisión tomada (interna ahora, SIAT después).
- [ ] WhatsApp: opt-in y plantillas planificadas (Fase 2).
- [ ] Capacitación por rol completada.
- [ ] Responsable interno designado (Doc o recepción líder).

---

## 16. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| El cliente no entrega precios/horarios/consentimiento | Alta | Alto | Defaults documentados + fecha límite; sin datos reales no hay piloto |
| Verificación de Meta tarda | Alta | Medio | Iniciar semana 1; WhatsApp fuera de Fase 1; plan B manual |
| Datos de Excel sucios | Alta | Alto | Staging + revisión humana + dedupe + muestra validada |
| Adopción del equipo | Media | Alto | Capacitación, responsable interno, convivencia con Excel |
| Scope creep (spa, facturación, IA) | Alta | Alto | Este documento como contrato; cambios por escrito y con fecha |
| Fuga de PHI | Baja | Crítico | RLS, DTOs, MFA, auditoría, tests, CSP |
| Doble reserva/cobro | Media | Alto | Exclusiones, locks, idempotencia, tests concurrentes |
| Pérdida de datos | Baja | Crítico | Backups + restore probado + migraciones revisadas |
| Latencia Bolivia–São Paulo | Media | Medio | Región `sa-east1`/`gru1`, cache, paginación, medición real |
| Costos de Supabase/Vercel | Baja | Medio | Plan Pro, alertas de uso, revisión mensual |
| Dependencia de una persona | Media | Alto | Documentación, runbooks, CI, código simple |
| Regulación cambia | Media | Medio | Revisión legal trimestral; estándar GDPR-like |
| Falta de tests | Alta si se acelera | Alto | Gates y CI obligatorios; no merge sin verde |
| 3D rompe en equipos viejos | Media | Bajo | 2D por defecto; fallback y detección WebGL |

---

## 17. Decisiones abiertas y preguntas para la clínica

> Si no hay respuesta antes del Sprint 1, se usa el **default** y se marca como supuesto en la UI/configuración.

| # | Pregunta | Default Fase 1 | Impacto |
|---|---|---|---|
| 1 | ¿Cuántos gabinetes reales? | 3 | Agenda y ocupación |
| 2 | ¿Horarios exactos, sábados y feriados? | Lun–Vie 08:30–19:30; Sáb 09:00–13:00 | Slots |
| 3 | ¿Lista oficial de tratamientos y precios en Bs.? | La de la demo, marcada `draft` | Facturación |
| 4 | ¿Duración real por tratamiento? | La de la demo | Agenda |
| 5 | ¿Qué odontólogo atiende qué especialidad? | Todos hacen todo | Asignación |
| 6 | ¿Un odontólogo ve solo sus pacientes o todos? | Solo los suyos | RLS |
| 7 | ¿Recepción puede ver precios/tratamientos? | Sí, pero no diagnósticos | DTOs |
| 8 | ¿Recepción puede ver montos pagados? | Sí, para cobrar | DTOs |
| 9 | ¿MFA obligatorio para recepción? | Sí | UX/login |
| 10 | ¿Política si falta stock al cerrar? | Bloquear el cierre | Operación |
| 11 | ¿Se permite pago parcial? | Sí | Facturación |
| 12 | ¿Horario de cierre de caja? | Al final del día | Operación |
| 13 | ¿Quién es el administrador real? | El Doc | Accesos |
| 14 | ¿Facturación electrónica ahora o después? | Después (Fase 2) | Alcance |
| 15 | ¿El spa entra en el sistema? | No en Fase 1 | Modelo |
| 16 | ¿Número histórico de WhatsApp? | Sin confirmar | Fase 2 |
| 17 | ¿Logo vectorial y colores oficiales? | Wordmark actual | Branding |
| 18 | ¿Texto oficial de consentimiento? | Borrador `draft` | Legal |
| 19 | ¿Retención de historia clínica? | 10 años | Legal |
| 20 | ¿Dominio y correo? | `alquimia.dental` o similar | Deploy |
| 21 | ¿Equipos y navegadores? | Chrome/Edge actualizado | Soporte |
| 22 | ¿Internet y plan B? | Hotspot 4G | Operación |
| 23 | ¿Volumen de pacientes/fichas a migrar? | < 2.000 | Migración |
| 24 | ¿Presupuesto mensual de infra? | USD 50–100 | Costos |

---

## 18. Anexos

### A. DDL mínimo de las tablas críticas

```sql
-- Extensiones
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- Timestamps
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Citas con exclusión
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  dentist_id uuid not null references public.profiles(id) on delete restrict,
  cabinet_id uuid not null references public.cabinets(id) on delete restrict,
  treatment_id uuid references public.treatments(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  source public.appointment_source not null default 'phone',
  campaign_id uuid references public.campaigns(id) on delete set null,
  notes text,
  cancellation_reason text,
  checked_in_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_valid check (ends_at > starts_at),
  constraint appointments_dentist_no_overlap exclude using gist (
    dentist_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show')),
  constraint appointments_cabinet_no_overlap exclude using gist (
    cabinet_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show')),
  constraint appointments_patient_no_overlap exclude using gist (
    patient_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show'))
);

create index appointments_clinic_day_idx on public.appointments (clinic_id, starts_at);
create index appointments_dentist_day_idx on public.appointments (dentist_id, starts_at);
create index appointments_patient_idx on public.appointments (patient_id, starts_at desc);

-- Check-in
create table public.checkin_tokens (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Facturación
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  encounter_id uuid unique references public.encounters(id) on delete restrict,
  number text not null,
  status public.invoice_status not null default 'draft',
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  total_cents integer not null default 0,
  issued_at timestamptz,
  due_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (clinic_id, number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  method public.payment_method not null,
  reference text,
  status public.payment_status not null default 'confirmed',
  received_at timestamptz not null default now(),
  received_by uuid not null references public.profiles(id),
  idempotency_key text unique,
  voided_at timestamptz,
  void_reason text
);

-- Auditoría
create table public.audit_log (
  id bigint generated always as identity primary key,
  clinic_id uuid not null,
  actor_id uuid,
  actor_role public.member_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  patient_id uuid,
  before jsonb,
  after jsonb,
  ip_hash text,
  user_agent text,
  at timestamptz not null default now()
);

create index audit_clinic_at_idx on public.audit_log (clinic_id, at desc);
create index audit_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_patient_idx on public.audit_log (patient_id, at desc);
```

### B. Firma de las RPC críticas

```sql
create or replace function public.submit_checkin(
  p_token text,
  p_payload jsonb
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$ ... $$;

create or replace function public.public_availability(
  p_clinic_slug text,
  p_treatment_id uuid,
  p_from date,
  p_to date
) returns table (slot_start timestamptz) ...;

create or replace function public.public_book(
  p_clinic_slug text,
  p_treatment_id uuid,
  p_starts_at timestamptz,
  p_name text,
  p_phone text,
  p_consent boolean,
  p_utm jsonb
) returns jsonb ...;

create or replace function public.finish_encounter(
  p_encounter_id uuid,
  p_idempotency_key text,
  p_payment_method public.payment_method,
  p_payment_amount_cents integer
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$ ... $$;
```

> Todas validan `auth.uid()` (excepto las públicas), permiso, estado, y escriben auditoría. Las públicas validan token/rate limit y no devuelven PII.

### C. Variables de entorno

```bash
# Públicas
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=

# Servidor (nunca NEXT_PUBLIC)
SUPABASE_SERVICE_ROLE_KEY=
SENTRY_AUTH_TOKEN=
TURNSTILE_SECRET_KEY=
RESEND_API_KEY=
IP_HASH_PEPPER=
CRON_SECRET=            # Fase 2
WHATSAPP_VERIFY_TOKEN=  # Fase 2
WHATSAPP_APP_SECRET=    # Fase 2
```

### D. Plantilla CSV de importación

```csv
nombre_completo,telefono,fecha_nacimiento,zona,email,odontologo,ultima_visita,notas
```

- `telefono`: obligatorio, se normaliza a E.164.
- `fecha_nacimiento`: `YYYY-MM-DD`.
- `odontologo`: nombre exacto del miembro; vacío = sin asignar.
- `ultima_visita`: informativa; no crea historia clínica.
- `notas`: campo administrativo.

### E. Prompt operativo para Opus 5.5

> Trabajas en el repo de Alquimia Dental. Debes ejecutar la Fase 1 descrita en este documento.
>
> 1. Lee el documento completo y `docs/arquitectura.md` antes de tocar código.
> 2. Trabaja **una tarea F1-xxx a la vez**, en orden de dependencia. No adelantes tareas de Fase 2.
> 3. Antes de cada tarea, escribe en el PR: objetivo, archivos, migración, tests y criterio de aceptación.
> 4. Empieza por migraciones y RLS; nunca por la UI.
> 5. Después de cada migración: `supabase db reset`, `db lint`, tests RLS.
> 6. Después de cada pantalla: `typecheck`, `lint`, test unitario y E2E si aplica.
> 7. No inventes datos de la clínica; usa `seed.dev.sql` y marca `draft`.
> 8. No uses `service_role` en cliente ni en componentes.
> 9. No cambies el sistema visual; corrige usabilidad y accesibilidad.
> 10. Detente en cada gate y reporta: qué pasó, qué falló, qué decisión necesitas.
> 11. Si un requisito es ambiguo, elige el default de la sección 17 y déjalo escrito.
> 12. Al final de cada sprint, actualiza `docs/operacion.md` y el changelog.
>
> Criterio de éxito: un paciente real completa reserva → check-in → consulta → cobro, sin papel, sin fuga de datos y con auditoría.

### F. Checklist de eliminación de la demo en `main`

- [ ] `src/lib/data.ts`
- [ ] `src/lib/seed.ts`
- [ ] `src/components/demo-guide.tsx`
- [ ] `src/app/page.tsx` (selector de rol)
- [ ] `src/app/(app)/ruta/page.tsx`
- [ ] `src/app/(app)/ingesta/page.tsx`
- [ ] `src/app/(app)/whatsapp/page.tsx` (mover a Fase 2)
- [ ] `src/app/(app)/analitica/page.tsx` (mover a Fase 2)
- [ ] `src/app/check-in/page.tsx` (reemplazado por `/c/[token]`)
- [ ] `src/app/agendar-cita/page.tsx` (reemplazado por `/reservar`)
- [ ] `DEMO_APPT`, `DEMO_PATIENT`
- [ ] `setSession`, `setDemo`, `resetDemo`, `setCabinetCount`
- [ ] Textos `[ejemplo]`, `(demo)`, “sin pagos reales”
- [ ] `Card.as`, `PHONE_RE` en componente, import muerto `toMin`

### G. Glosario

| Término | Significado |
|---|---|
| RLS | Row Level Security de Postgres: filtra filas por usuario |
| RPC | Función de Postgres expuesta por Supabase |
| DTO | Objeto de transferencia con solo los campos que la pantalla necesita |
| PHI | Información de salud protegida/sensible |
| FEFO | First Expired, First Out: consumir primero lo que vence antes |
| Idempotencia | Repetir una operación no duplica el efecto |
| AAL2 | Nivel de autenticación con segundo factor verificado |
| Gate | Punto de control obligatorio antes de avanzar |
| UAT | Pruebas de aceptación con el usuario real |

---

## 19. Cierre: qué debe existir al final de Fase 1

1. Un usuario real por persona, con MFA y rol correcto.
2. Una base de datos con RLS probada y auditoría.
3. Pacientes con ficha digital, anamnesis versionada y consentimiento.
4. Agenda multi-gabinete sin dobles reservas.
5. Check-in por QR con token de un solo uso.
6. Consulta con hallazgos, plan persistente y cierre transaccional.
7. Factura interna, pagos totales/parciales y caja con arqueo.
8. Inventario por receta con lotes y movimientos.
9. Portal público de reserva con atribución UTM.
10. Importación CSV y plan de migración de papel.
11. Staging, CI, backups probados y monitoreo.
12. Documentación de operación, seguridad y runbooks.
13. Un paciente real atendido y cobrado de punta a punta.

**Lo que no debe existir:** datos clínicos en el navegador, selector de rol, demo guiada en producción, cifras inventadas, OCR falso, “modo demo” en una URL pública, ni un botón que diga “Finalizar” sin cobrar y descontar stock de verdad.

---

*Documento de trabajo de Lumen Labs para la construcción de la Fase 1. Los datos de la clínica, precios, horarios y textos legales deben validarse antes del piloto.*


