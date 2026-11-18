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
| Cierre clásico: sin stock no se cierra. Nuevo flujo `finish_care`: descuenta solo existencias reales y registra faltantes sin duplicar factura ni consumo. | PGlite; esquema nuevo aplicado en Supabase |
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

## Revisión del flujo de atención e historia — 18/11/2026

`clinical_assessments` permite insertar revisiones a personal con acceso clínico al paciente. No permite actualizar ni borrar versiones. Exportar usa la revisión más reciente solo si fue publicada para la copia; no recupera automáticamente una revisión pública anterior si la actual es privada.

`start_care` usa los permisos del usuario y enlaza una sesión al encuentro. `finish_care` exige administrador o el odontólogo de cita y encuentro, bloquea las filas durante el cierre y factura/consume/actualiza estados en una transacción. Los recibos no tienen acceso directo para usuarios ni anónimos. Los avisos del asesor de Supabase sobre esas tablas sin políticas de lectura son esperados: solo sus funciones autorizadas acceden a ellas. Las funciones expuestas que elevan permisos necesitan conservar sus comprobaciones de clínica, paciente y rol.

La política de medios permite audio del almacenamiento privado y previsualizaciones locales; cámara y micrófono quedan restringidos al mismo sitio. Se desactivó el registro de argumentos de funciones de servidor en desarrollo para evitar registrar contraseñas o notas.

La consulta de dependencias detectó avisos transitivos de las herramientas de Sentry y de patrones de archivos. La actualización automática no concluyó por problemas de red; se restauró la instalación reproducible con el archivo de versiones. No se hizo una migración forzada de dependencias ni se certifica ausencia de vulnerabilidades. La comprobación posterior del servicio de auditoría también falló por `ECONNRESET`; repetirla con conectividad disponible.
