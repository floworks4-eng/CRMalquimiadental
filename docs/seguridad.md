# Seguridad

Reglas del brief ([`fase1-brief.md`](fase1-brief.md), secciones 0.1 y 6), ajustadas a las decisiones de la clínica del 24/10/2026.

1. **Solo personal.** No hay ninguna página para pacientes. Todo el sitio exige sesión; sin sesión, todo lleva a `/login`.
2. Ningún dato clínico en el navegador: sin `localStorage`, `sessionStorage` ni IndexedDB, ni datos personales en URLs.
3. La autorización vive en el servidor (RLS + Server Actions + RPC). `can()` en React es solo cosmético.
4. `SUPABASE_SERVICE_ROLE_KEY` nunca llega al navegador: solo en módulos `server-only`.
5. Toda escritura clínica, de dinero o de stock queda en `audit_log` en la misma transacción. El registro no se edita ni se borra.
6. Cada persona tiene su usuario (por invitación); no hay cuentas compartidas ni registro público.
7. Secretos solo en el servidor (Vercel / Supabase). `.env.example` lista nombres sin valores.

## Decisión: sin verificación en dos pasos

La clínica pidió un acceso simple (correo y contraseña). Se desactivó el segundo factor (`has_mfa()` en la migración 0013).
**Riesgo aceptado:** quien obtenga la contraseña de un odontólogo o del administrador ve historias clínicas. Mitigaciones:
contraseñas de 12+ caracteres, límite de intentos de Supabase Auth, cada persona con su usuario, desactivar al que se va
(Configuración → Equipo), auditoría de todo. Reactivarlo es un cambio pequeño (ver `arquitectura.md`); se recomienda al menos
para el administrador cuando la clínica esté operando.

## Quién ve qué

| | Administrador | Odontólogo | Recepción |
|---|---|---|---|
| Agenda | toda | la suya | toda |
| Pacientes (contacto) | todos | los suyos* | todos |
| Anamnesis, odontograma, notas, plan | todo | de sus pacientes | **nunca** (ni llega al navegador) |
| Iniciar / finalizar atención | sí | las suyas | no |
| Facturas y saldos | todo | de sus pacientes | todo |
| Caja (movimientos, apertura, cierre) | sí | no | sí |
| Descuentos, anular cobros | sí | no | no |
| Inventario | lee y escribe | lee | lee |
| Configuración y equipo | sí | no | no |
| Auditoría | sí | no | no |

\* Sus pacientes: asignados a él o con alguna cita o atención suya. Por eso un odontólogo solo agenda a sus propios pacientes.

## Verificado

| Qué | Cómo |
|---|---|
| `anon` sin ningún permiso sobre tablas, vistas ni funciones | PGlite + Supabase real (`permission denied`) |
| Registro público apagado | Supabase real (`signup_disabled`) |
| Recepción sin acceso a datos clínicos; odontólogo A sin acceso a pacientes de B; aislamiento entre clínicas | PGlite (RLS) + Supabase real |
| Sin doble reserva (20 intentos simultáneos → 1) | PGlite |
| Cierre de atención: todo o nada, sin stock no se cierra, reintento sin doble cobro, doble cierre bloqueado | PGlite + Supabase real |
| Precio del plan fijado por la base, no por el navegador | PGlite + Supabase real |
| Pagos y facturas sin escritura directa; anulación solo admin con motivo | PGlite |
| Lote de stock nunca negativo; ajustes con motivo; solo admin repone | PGlite + Supabase real |
| Caja: una abierta, esperado correcto, diferencia con motivo | PGlite + Supabase real |
| Configuración inicial solo una vez y solo desde el servidor | PGlite + Supabase real |
| Rutas privadas sin sesión → `/login`; cabeceras de seguridad (CSP, frame, nosniff…) | Playwright (escritorio y celular) |
| `audit_log` append-only, incluso para superusuario | PGlite |

## Limitaciones conocidas

- Las filas hijas referencian a sus padres solo por `id`, sin llave compuesta `(clinic_id, id)`. Con una sola clínica es
  irrelevante; antes de habilitar varias hay que agregarlas.
- CSP con `'unsafe-inline'` en scripts (Next necesita scripts inline sin nonces). El resto de la política es estricta.
- Recuperar contraseña usa el correo por defecto de Supabase (pocos envíos por hora). Para producción: SMTP propio
  (ver `operacion.md`).
- Los respaldos diarios automáticos requieren el plan Pro de Supabase; en el plan gratuito, usar el respaldo manual de `operacion.md`.

## Pendiente de decisión legal

Política de privacidad interna, consentimiento informado en papel o escaneado, y plazos de conservación de historias clínicas:
deben revisarlos la clínica y un abogado boliviano.

## Datos de prueba

`supabase/seed.dev.sql` crea usuarios `@alquimia.test` con una contraseña escrita en el archivo. **Solo** para las pruebas
automáticas (PGlite) y desarrollo local; nunca se carga en el proyecto real.
