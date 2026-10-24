# Seguridad (Fase 1)

Reglas no negociables del brief ([`fase1-brief.md`](fase1-brief.md), sección 0.1 y 6). Este archivo se completa en el Sprint 1.

1. Ningún dato clínico en el navegador: sin `localStorage`, `sessionStorage` ni IndexedDB, ni datos personales en URLs.
2. La autorización vive en el servidor (RLS + Server Actions). `can()` en React es solo cosmético.
3. `SUPABASE_SERVICE_ROLE_KEY` nunca llega al navegador: solo en módulos `server-only`.
4. Toda escritura clínica, financiera o de stock escribe `audit_log` en la misma transacción.
5. Cada persona tiene su usuario con MFA; no hay cuentas compartidas ni login por rol.
6. Secretos solo en Vercel/Supabase. `.env.example` lista nombres sin valores.

## Pendiente de decisión legal

Los textos legales (consentimiento, aviso de privacidad, retención) y las referencias normativas del brief no están verificadas
por un abogado boliviano. No usar en producción hasta esa revisión.

## Estado del Gate G1 (Sprint 1)

| Criterio | Estado |
|---|---|
| `anon` sin privilegios sobre tablas, vistas y funciones | ✅ probado (PGlite) |
| Recepcion sin acceso a anamnesis, encuentros, hallazgos, plan y archivos | ✅ probado |
| Odontologo A sin acceso a pacientes del odontologo B | ✅ probado |
| Sin MFA (aal1) no hay acceso a datos de salud ni auditoria | ✅ probado con claims `aal1` |
| Aislamiento entre clinicas | ✅ probado |
| `audit_log` registra escrituras y es append-only (incluso para superusuario) | ✅ probado |
| Doble reserva imposible (20 intentos concurrentes → 1) | ✅ probado |
| Verificacion contra Supabase real (`db reset`, `db lint`, GoTrue, PostgREST) | ⏳ pendiente: requiere Docker |
| Login + TOTP de punta a punta | ⏳ pendiente: codigo escrito y tipado, no ejecutado contra GoTrue |
| URL directa a ruta privada sin sesion → `/login` | ✅ probado (Playwright) |

Las pruebas se validaron tambien por mutacion: al debilitar a proposito las politicas (recepcion como clinica, MFA siempre verdadero) fallan 15 pruebas.

## Limitaciones conocidas

- Las filas hijas referencian a sus padres solo por `id`, sin llave compuesta `(clinic_id, id)`. Con una sola clinica es irrelevante; antes de
  habilitar varias clinicas hay que agregar llaves compuestas.
- `member_invites` no tiene trigger de auditoria; el servidor registra `member.invite` con `log_event` y `accept_invite` audita la aceptacion.
- Sin limite de intentos propio en el login (lo aplica Supabase Auth); la tabla de rate limit es del Sprint 5 (F1-070).
- El rol (`clinic_admin`/`dentist`/`reception`) vive solo en `clinic_members`, nunca en `user_metadata`.

## Usuarios de desarrollo

El seed crea `doc@`, `valeria@`, `sergio@` y `paola@alquimia.test` con la contrasena local indicada en `supabase/seed.dev.sql`
(solo local, nunca en produccion). Cada ingreso exige enrolar TOTP la primera vez.

## Gate G2 (Sprint 2)

| Criterio | Estado |
|---|---|
| 20 reservas simultaneas del mismo horario → 1 exito | ✅ probado (PGlite) |
| Odontologo solo ve su agenda y solo agenda a sus pacientes | ✅ probado |
| Disponibilidad correcta (horarios, feriados, ausencias, solapes, gabinetes) | ✅ 14 casos + coherencia "lo ofrecido se puede reservar" |
| Transiciones de estado: TS y SQL coinciden | ✅ 147 combinaciones |
| Agenda operable con teclado | ⏳ implementado (flechas/Enter, pestañas ARIA); sin verificar con lector de pantalla |
| Pantallas contra Supabase real | ⏳ pendiente: renderizadas solo con datos de prueba, nunca contra la base |

## Gate G3 (Sprint 3)

| Criterio | Estado |
|---|---|
| Token de check-in: 256 bits, solo hash en la base, un uso, vence, se revoca al emitir otro | ✅ probado (PGlite) |
| 5 envios simultaneos con el mismo enlace → 1 | ✅ probado |
| El contexto publico no expone apellido, telefono ni datos de salud | ✅ probado |
| Recepcion no ve alergias (ni en consentimientos ni en avisos); el odontologo si | ✅ probado |
| Sin texto legal aprobado no hay check-in ni reserva | ✅ probado |
| Reserva publica sin enumeracion (solo horas), dedupe por celular, limite de citas | ✅ probado |
| `anon` y `authenticated` no ejecutan ninguna RPC publica | ✅ probado |
| Firma: solo PNG real, ≤150 KB, dimensiones razonables; ruta atada al paciente del enlace | ✅ probado |
| Check-in desde un celular real contra Supabase real | ⏳ pendiente: pantallas revisadas solo con datos de prueba |
