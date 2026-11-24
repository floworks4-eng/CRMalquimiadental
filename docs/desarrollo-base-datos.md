# Base de datos de desarrollo de Alquimia Dental

La rama `feat/formulario-paciente` parte de `36984103a9a0138a685b7282e4c6432e5955e2e7`, que sigue siendo la cabecera remota comprobada el 24 de noviembre de 2026. El entorno SQL local permite reconstruir las migraciones y probar reglas con datos ficticios sin enlazar el proyecto compartido CRMdoc.

## Historial conciliado

Las 27 versiones y nombres locales coinciden con el historial remoto de referencia, guardado en `supabase/migration-baseline.json`.

- Se recuperaron de `supabase_migrations.schema_migrations.statements` los archivos originales `20261031170420_ocr_review_dataset.sql`, `20261031170917_ocr_review_conflict_response.sql` y `20261031183325_remove_ocr_htr_schema.sql`.
- El archivo `20261104214229_save_patient_tooth_state_rpc.sql` se renombró a `20261104214305_save_patient_tooth_state_rpc.sql`, que es la versión realmente aplicada. Su SQL coincide con el original remoto, ignorando espacios finales.
- Las tres migraciones restauradas también coinciden con sus sentencias remotas, ignorando espacios finales. Se conserva su secuencia real: creación, corrección y retirada de OCR. La última deja el bucket histórico privado, como ocurrió en el proyecto compartido; no se inventó una migración vacía ni se reactivó OCR como funcionalidad.

No se ejecutaron `migration repair`, `db push`, cambios de esquema ni escrituras de datos contra CRMdoc. La coincidencia de versiones no certifica por sí sola igualdad completa de todos los objetos y configuraciones remotos; antes del despliegue habrá que revisar nuevas migraciones y cambios concurrentes de Leo. Los demás checkouts deben incorporar esta conciliación antes de generar nuevas migraciones.

## Entorno SQL aislado

Requiere Docker y la imagen ya instalada `public.ecr.aws/supabase/postgres:17.6.1.167` (PostgreSQL 17.6). El script usa `--pull=never`; en otro equipo deberá descargarse esa imagen primero. No usa el otro stack local `bioma`.

| Propiedad | Valor |
| --- | --- |
| Contenedor | `alquimia_formulario_sql_dev` |
| Base | `alquimia_dev` |
| Dirección | `127.0.0.1:55322` |
| Usuario | `postgres` |
| Contraseña exclusiva de desarrollo | `LocalOnly-Alquimia-2026!` |
| Datos | Memoria temporal del contenedor, máximo 384 MiB |
| Carga inicial | 27 migraciones, una clínica ficticia y 12 pacientes de `seed.dev.sql` |

Este entorno usa PostgreSQL real con el contrato mínimo de Auth/Storage de `supabase/tests/supabase-shim.sql`; **no proporciona Supabase Auth HTTP, PostgREST, Storage HTTP ni Realtime**. Sirve para SQL, integridad y permisos. Las pruebas completas entre navegador, login y API requerirán un stack Supabase completo o una base de desarrollo equivalente antes de validar esas tareas.

Al iniciar el stack completo se agotó el disco durante la descarga. Se canceló el intento y se retiraron exclusivamente las dos imágenes nuevas ya descargadas; no se eliminaron imágenes, volúmenes ni datos del otro proyecto. Tras la limpieza quedaron unos 309 MiB disponibles en el disco. Antes de preparar los servicios HTTP hay que liberar espacio suficiente. El entorno SQL usa memoria temporal para evitar nuevas descargas y crecimiento de datos en disco.

## Comandos

Para continuar en otro dispositivo, clonar la rama de trabajo e instalar las dependencias:

```bash
git clone --branch feat/formulario-paciente https://github.com/floworks4-eng/CRMalquimiadental.git
cd CRMalquimiadental
npm ci
docker pull public.ecr.aws/supabase/postgres:17.6.1.167
```

Luego iniciar y comprobar la base local con los comandos siguientes. Los datos ficticios se reconstruyen; no hay que trasladar el contenedor del equipo anterior. El plan vigente está en `docs/plan-formulario-paciente.md`; la siguiente tarea autorizable es definir estados y contratos. La interfaz del formulario todavía no está implementada.

```bash
npm run dev:db:start
npm run dev:db:status
npm run dev:db:migrations
npm run dev:db:check
npm run dev:db:reset
npm run dev:db:stop
```

`start` conserva la base si ya está corriendo. Tras detener el contenedor, sus datos temporales desaparecen y el siguiente `start` reconstruye todo. `reset` borra exclusivamente `alquimia_dev` dentro del contenedor identificado con la etiqueta de este proyecto y vuelve a cargar migraciones y seed. No admite conexiones, nombres ni argumentos adicionales. No guardar aquí trabajo irreemplazable; el esquema debe vivir en migraciones y los ejemplos en fixtures.

`check` comprueba el historial exacto de referencia, la clínica ficticia, ausencia de usuarios fuera de `@alquimia.test`, retirada de las tablas OCR, bucket histórico privado, RLS y ausencia de SELECT/INSERT de tabla para anónimos en `public`. El baseline se actualizará de forma explícita cuando se agreguen migraciones del formulario; no se modifica automáticamente para ocultar diferencias.

Para SQL manual, sin conexiones externas:

```bash
docker exec -it alquimia_formulario_sql_dev psql -h /tmp -U postgres -d alquimia_dev
```

El archivo original `supabase/config.toml` y las variables de la aplicación no se cambiaron. `npm run db:reset` sigue siendo el comando genérico anterior; durante este desarrollo usar `dev:db:reset`, que fija el destino local dedicado. El bootstrap reutiliza el shim de pruebas, no lo aplica al proyecto alojado.

## Verificación de la tarea 1

Reconstrucción inicial y control del historial completados. La reconstrucción repetida detectó que los roles PostgreSQL sobreviven a borrar una base; el script elimina únicamente sus tres roles de prueba en este contenedor dedicado antes de recrearlos.

Resultados al finalizar la tarea:

- Reconstrucción inicial y reconstrucción repetida correctas en PostgreSQL 17.6.
- `dev:db:check` correcto tras reconstruir: 27 migraciones, una clínica ficticia, 12 pacientes, cero usuarios fuera del dominio de pruebas, cero tablas públicas sin RLS y sin SELECT/INSERT anónimo sobre esas tablas.
- Rechazo de argumentos adicionales comprobado con `reset --linked`, sin ejecutar operaciones de base de datos.
- 177 pruebas aprobadas en los 11 archivos de `supabase/tests`, con un trabajador y hooks de 60 segundos. Las 59 pruebas seleccionadas previas también pasaron.
- TypeScript, ESLint y comprobación de espacios de Git correctos.

La tarea 1 deja lista la base SQL y conciliado el historial local. El stack HTTP completo queda pendiente por falta de espacio; esa comprobación será necesaria antes de validar integración con navegador. El entorno compartido de CRMdoc y el stack local del otro proyecto permanecen sin cambios de nuestra parte.

Para repetir las pruebas de migraciones y negocio con bases PGlite independientes:

```bash
npx vitest run --maxWorkers=1 --hookTimeout=60000 supabase/tests
npm run typecheck
npm run lint
```
