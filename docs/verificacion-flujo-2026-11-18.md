# Verificación del flujo existente — fase 2

Referencia: `36984103a9a0138a685b7282e4c6432e5955e2e7`. Revisión del 18/11/2026.
Alcance: lectura de código, migraciones, metadatos del proyecto CRMdoc y pruebas locales con datos ficticios. No se modificaron datos clínicos, funciones ni políticas remotas. No se realizó una prueba manual autenticada en un teléfono real ni una auditoría exhaustiva.

## Lo que ya resuelve el flujo nuevo

- Agenda y Atención usan `startCare`/`finishCare` (`src/server/actions/workflow.ts`).
- `start_care` llama a `start_encounter` y crea/reutiliza la sesión mediante la unicidad de `clinical_sessions.encounter_id`. El servidor fija la fecha según la zona de la clínica.
- `finish_care` verifica al administrador o al odontólogo de la cita y encuentro, cierra la sesión vinculada y los estados de atención en una transacción. Los reintentos con la misma clave recuperan el recibo; otra clave sobre una atención cerrada no vuelve a facturar.
- Notas y adjuntos tienen paciente y sesión. El disparador de escritura rechaza asociaciones cruzadas y nuevos mensajes/archivos en sesiones cerradas. El cuerpo de los mensajes confirmados no se modifica; su visibilidad sí puede cambiar.
- Existen sesiones manuales sin encuentro y puede haber más de una sesión del paciente en una misma fecha. El cierre de una atención no cierra sesiones manuales independientes.
- La ficha separa anamnesis declarada, evaluación profesional versionada, diario y odontograma. No existe aún formulario público.

## Diferencias con el flujo acordado

### 1. Dos circuitos de inicio/cierre siguen accesibles — prioridad alta

`src/components/consulta/consulta-view.tsx` sigue usando `startEncounter` y `finishEncounter`; el tablero nuevo usa `startCare` y `finishCare`.

El inicio antiguo no crea por sí solo la sesión del diario. El cierre antiguo no cierra `clinical_sessions`, exige tratamientos y puede bloquearse por faltantes de inventario. Además calcula ítems en curso por paciente, mientras el nuevo los restringe al encuentro. Su definición remota consultada también conserva ese alcance y no referencia las sesiones.

Riesgo: el resultado depende de la pantalla utilizada. Un inicio antiguo puede recuperarse luego mediante el flujo nuevo, pero eso no elimina la diferencia entre circuitos. Propuesta: unificar la operación de atención y revisar la transición del cobro por separado, conservando compatibilidad y pruebas.

### 2. El odontograma de la ficha no está ligado a una sesión — prioridad alta

`patient-clinical.tsx` muestra el diario y debajo un odontograma; sus marcas llaman a `savePatientToothState`, cuyos parámetros no incluyen sesión/encuentro. El estado vigente queda en `patient_tooth_states` y su auditoría registra cambios, pero no identifica la sesión clínica que los originó.

La consulta individual sí registra `tooth_findings` asociados a un encuentro. Son dos caminos distintos de escritura.

La historia de cambios directos se consulta desde `audit_log` únicamente para administradores. El odontólogo puede ver los hallazgos por encuentro y el estado vigente, pero no todas las sustituciones directas históricas mediante esa fuente.

Propuesta: al registrar observaciones, asociar las notas y cambios dentales a la atención activa; conservar estado vigente y eventos/versiones clínicos accesibles según permisos. La auditoría administrativa no debe ser la única fuente del historial clínico por sesión. No basta con mover el componente 3D debajo de las notas.

### 3. Guardado independiente y conflictos — prioridad alta

Notas, evaluación y cada marca dental se guardan mediante operaciones separadas. No hay un único guardado transaccional de «observaciones + odontograma». `save_patient_tooth_state` realiza upsert sin comparar una versión esperada: una escritura concurrente posterior puede reemplazar la anterior. Debemos decidir guardado conjunto o guardado progresivo explícito y detección de conflictos.

### 4. Selección de sesión y evaluación — prioridad media

El diario conserva la sesión seleccionada al refrescar (`setSelected` mantiene el valor previo); iniciar una atención no garantiza cambiar automáticamente a su nueva sesión. Puede permanecer una sesión manual u otra anterior. Evita descartar borradores, pero necesita una selección explícita de la atención activa para el flujo acordado.

`clinical_assessments` conserva revisiones por paciente y autor, sin relación directa con sesión. `finish_care` acepta nota del encuentro o mensaje de su sesión para cerrar una evaluación sin tratamientos; una evaluación guardada únicamente en `clinical_assessments` no satisface ese requisito.

### 5. Entrada del paciente y odontólogo responsable — decisión necesaria

El circuito de atención usa una cita existente (`encounters.appointment_id` obligatorio). El formulario público no creará por sí solo esa cita ni una asignación profesional. Definir atención sin cita previa y asignación autorizada antes de iniciar.

El acceso clínico es por paciente: odontólogo primario o con alguna cita/encuentro del paciente. Inicio/cierre exige profesional de esa atención o administrador; escribir en el diario y cerrar manualmente sesiones usa el permiso clínico del paciente, no pertenencia exclusiva a esa sesión. Confirmar si la colaboración entre odontólogos del mismo paciente es la regla deseada.

## Comprobación remota de Supabase

La conexión respondió a consultas de metadatos. Se confirmó:

- Migraciones `care_workflow`, `clinical_session_journal` y `clinical_assessment_record` registradas.
- RLS habilitado y sin SELECT/INSERT de tabla para `anon` en las siete tablas consultadas: pacientes, anamnesis, sesiones, mensajes, evaluaciones, estados dentales y hallazgos.
- `start_care`, `finish_care`, funciones antiguas de atención y `save_patient_tooth_state` no son ejecutables por `anon`.
- Políticas reales de diario y estados dentales basadas en `can_read_clinical`; auditoría restringida a administración.

Esto verifica esos metadatos, no todos los permisos por columna, endpoints, vistas, buckets ni escenarios de producción.

Hay diferencias en el historial de migraciones: Supabase registra tres migraciones históricas de OCR/retirada ausentes en esta rama y `save_patient_tooth_state_rpc` con versión `20261104214305`; el archivo local se llama `20261104214229_save_patient_tooth_state_rpc.sql`. La función consultada coincide en comportamiento con el archivo revisado. Conciliar historial y archivos con Leo antes de ejecutar un despliegue de migraciones; no aplicar a ciegas ni reparar el historial automáticamente.

El asesor de seguridad devolvió tres tablas con RLS sin políticas (recibos/contadores/resultados internos), 29 funciones SECURITY DEFINER ejecutables por autenticados y protección de contraseñas filtradas desactivada. Los dos primeros grupos requieren interpretar el diseño y comprobar privilegios/autorización; no equivalen automáticamente a filtración. No se modificaron para silenciar avisos.

Referencias de remediación del asesor:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Validación y siguiente paso

Resultado: **9 archivos de pruebas y 89 pruebas aprobadas**, en 70,96 segundos. Se cubrieron flujo de atención, diario, edición dental, RLS, evaluaciones, acciones del servidor, tablero, compositor y reglas de estado dental. El primer intento tuvo fallos de preparación de bases; el segundo limitó a un trabajador y amplió el tiempo de hooks a 60 segundos sin cambiar la configuración del proyecto. No se añadieron pruebas nuevas: los hallazgos de integración anteriores provienen de lectura del código y metadatos y no todos están cubiertos por estas suites.

Antes de implementar: acordar con el Doc/Leo el circuito único, asociación odontólogo/paciente/cita, sesión activa, historial dental y actualización de antecedentes. Después cerrar campos y diseñar migraciones compatibles en desarrollo. No implementar otro módulo independiente de historial.
