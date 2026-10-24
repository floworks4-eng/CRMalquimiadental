# Operación (runbooks)

Guías cortas para quien mantenga el sistema. Proyecto de Supabase: **CRMdoc** (`hjebrcdkkvysmqcyvcpb`).

## 1. Puesta en marcha (una sola vez)

1. Publicar la app (Vercel u otro) con las variables de `.env.example`. `NEXT_PUBLIC_SITE_URL` = la dirección pública (https).
2. En Supabase → Authentication → URL Configuration: *Site URL* = esa dirección y agregar `<sitio>/api/auth/callback` a
   *Redirect URLs*.
3. Entrar a `<sitio>/login`: con la base vacía lleva a **Configuración inicial**. El Doc crea la clínica y su cuenta.
4. En **Inicio → Primeros pasos**: horario y gabinetes, tratamientos y precios, insumos y stock, invitar al equipo, importar
   pacientes (Configuración → Importar pacientes, desde Excel guardado como CSV).

## 2. Alta y baja de personas

- **Alta:** Configuración → Equipo → *Invitar*. Se genera un enlace de un solo uso (72 h); enviarlo por WhatsApp o correo.
  La persona elige su contraseña.
- **Baja:** Configuración → Equipo → *Editar* → desmarcar *Activo*. Deja de entrar en el acto; su historial queda.
  Siempre debe quedar al menos un administrador activo (la base lo impide).
- **Olvidó su contraseña:** «Olvidé mi contraseña» en `/login` (llega un correo).

## 3. Respaldos

- **Plan Pro de Supabase:** respaldo diario automático (7 días). Recomendado apenas haya datos reales.
- **Respaldo manual (cualquier plan),** semanal como mínimo y antes de cada cambio de base de datos:

```bash
npx supabase db dump --linked -f respaldo-esquema.sql
npx supabase db dump --linked --data-only -f respaldo-datos.sql
```

  Guardar ambos archivos fuera de la computadora (disco externo cifrado o nube privada). Contienen datos de salud: nunca por
  WhatsApp ni correo.

## 4. Restaurar

1. Crear un proyecto de Supabase nuevo (no sobrescribir el dañado hasta comprobar el respaldo).
2. `npx supabase link --project-ref <nuevo>` y `npx supabase db push --linked` (crea el esquema desde las migraciones).
3. Cargar los datos: SQL Editor → pegar `respaldo-datos.sql` (o `psql` con la cadena de conexión del proyecto).
4. Probar el ingreso y una ficha. Recién entonces apuntar la app a las nuevas llaves.
5. Los usuarios de acceso (Auth) se restauran desde el respaldo del plan Pro; con respaldo manual hay que volver a invitarlos.

## 5. Cambios en la base de datos

1. Nueva migración en `supabase/migrations/00NN_descripcion.sql` (nunca editar una ya aplicada).
2. `npm test` (verifica permisos y reglas en PGlite).
3. Respaldo manual (punto 3).
4. `npx supabase db push --linked` y `npx supabase db lint --linked --level warning`.

## 6. Rotar llaves

Si una llave se expuso (chat, captura, repositorio):

1. Supabase → Project Settings → API Keys → crear una *secret key* nueva y **borrar** la anterior.
2. Reemplazarla en `.env.local` y en las variables del hosting; volver a publicar.
3. Tokens de acceso personales (`sbp_…`): Account → Access Tokens → revocar.
4. Revisar Auditoría (tabla `audit_log`) por actividad rara en las horas previas.

## 7. Incidentes

| Síntoma | Qué hacer |
|---|---|
| Nadie puede entrar | Estado de Supabase (status.supabase.com); variables de entorno del hosting; `/api/health` |
| «No alcanzan los insumos» al finalizar | Inventario → registrar el ingreso (o ajustar el conteo); o quitar del plan lo que no se hizo hoy |
| La caja no cuadra | El cierre exige motivo; queda registrado y avisa al administrador. Revisar movimientos del día en Caja |
| Cobro registrado por error | Admin: Caja → *Anular* con motivo (queda el rastro y la factura vuelve a tener saldo) |
| Error en una historia ya cerrada | Consulta → atención → *Agregar addenda* con el motivo (no se edita lo cerrado) |
| Sospecha de acceso indebido | Desactivar al usuario, rotar llaves (punto 6), revisar `audit_log` y avisar al Doc |

## 8. Correo de recuperación

El correo integrado de Supabase permite pocos envíos por hora. Para producción: Supabase → Authentication → SMTP Settings →
un proveedor propio (por ejemplo Resend) con el dominio de la clínica.
