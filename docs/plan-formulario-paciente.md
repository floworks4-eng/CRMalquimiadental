# Plan de ejecución — formulario de pacientes

Plan actualizado con las decisiones del 24 de noviembre de 2026. Referencia inicial de Leo:
`36984103a9a0138a685b7282e4c6432e5955e2e7`.

## Tareas acordadas

1. Confirmar versión, conciliar el historial de migraciones y preparar una base local reproducible con datos ficticios.
2. Definir estados y contratos de datos del paciente, formulario, solicitud QR y sesión; transiciones, cancelación, reprogramación y reintentos.
3. Migraciones de ficha inicial y solicitud QR: datos aprobados, cita/paciente, respuestas versionadas, aceptación y revisión profesional.
4. Recepción segura: envío atómico e idempotente, permisos mínimos, vencimiento/revocación, límites de abuso y conflictos de actualización.
5. Sesión y evolución dental: cambios por atención, estado vigente, historia y concurrencia.
6. Unificar inicio/cierre: preparar evaluación no abre sesión; iniciar primera sesión sí. Mantener reglas acordadas de cobro e inventario.
7. Interfaz del Doc: paciente nuevo destacado, QR, espera/reconexión y apertura de ficha inicial recibida.
8. Formulario móvil: preguntas aprobadas, condiciones, revisión y aceptación; desplazamiento y teclado sin pérdida de datos.
9. Interfaz clínica: sesión activa explícita, notas dictadas con teclado, odontograma 3D, estado de guardado y cierre.
10. Seguimiento: recomendación, cotización versionada y cita futura con disponibilidad; sin generar deuda automáticamente.
11. Validación completa en dos dispositivos, permisos, regresiones, revisión con el Doc y publicación coordinada con Leo.

Cada tarea tiene pruebas y revisión antes de avanzar. La autorización actual es ejecutar la tarea 1; las restantes se realizarán paso a paso.

## Flujo y decisiones

- Solo se atiende en el sillón con cita. La cita ya tiene un paciente mínimo con estado nuevo; el formulario completa esa misma ficha sin crear otro paciente.
- El software genera el QR desde la cita, con una solicitud temporal y aleatoria vinculada al paciente y profesional. Esta decisión reemplaza el QR genérico fijo propuesto inicialmente.
- El Doc pulsa Preparar evaluación y muestra el QR/Esperando respuestas. Todavía no abre la sesión. El paciente recibe un formulario vacío sin poder consultar respuestas previas.
- El envío válido guarda respuestas y aceptación con fecha del servidor; el Doc solo recibe confirmación tras guardado completo. Se abre Ficha médica inicial dentro de la anamnesis, junto al odontograma y sesiones.
- Tras revisar, el Doc pulsa Iniciar primera sesión. Mostrar el QR o recibir el formulario no equivale a iniciar la atención clínica.
- El paciente aporta identificación, motivo, antecedentes y hábitos. Añadir nombres y apellidos separados, correo, documento, sexo y nacimiento; calcular edad y conservar contexto del envío.
- No habilitar lectura pública de pacientes, historias, archivos ni usuarios. El envío público debe tener permisos mínimos, validación en servidor, protección contra abuso e idempotencia.
- Conservar versión del formulario, respuestas originales y texto/evidencia de aceptación. No presentar botón o firma dibujada automáticamente como firma digital certificada.
- El odontólogo inicia la atención; se crea o reutiliza la sesión vinculada al encuentro. Registrar observaciones guarda en esa sesión, sin crear otra por cada guardado.
- Notas y odontograma 3D se usan desde teléfono/tablet. El paciente nunca completa el odontograma.
- Mantener estado dental vigente y trazabilidad de los cambios por atención, sin alterar las sesiones anteriores. Permitir distintas sesiones el mismo día.
- La cita determina al profesional autorizado. Mantener separado Nuevo de Ficha pendiente/recibida/revisada; formularios repetidos o un enlace filtrado no pueden reasignar pacientes.
- Aprovechar `patients`, `anamnesis_versions`, `clinical_sessions`, `clinical_messages`, `tooth_findings`, `patient_tooth_states` y `clinical_assessments`; verificar funciones y políticas reales antes de modificar.
- Los campos del formulario están aprobados por el usuario. Documentar redacciones exactas al definir los contratos; la validación jurídica del mecanismo/texto de aceptación sigue siendo requisito de publicación.
- Notas dictadas mediante el teclado del teléfono se guardan como texto revisado. No hace falta añadir una integración de transcripción para este flujo.
- Los antecedentes pueden actualizarse mediante nuevas versiones en visitas posteriores. Distinguir ausencia de respuesta de una respuesta negativa.

## Colaboración y límites

- Una rama por tarea; integrar mediante PR a la rama común acordada. No reescribir migraciones ya aplicadas.
- Las ramas Git no aíslan la base compartida: coordinar migraciones y probar con datos ficticios en una base independiente.
- No modificar el Supabase compartido durante la tarea 1. Los comandos locales no admiten URL remota ni proyecto enlazado.
- Proyecto Supabase de referencia: `hjebrcdkkvysmqcyvcpb` (CRMdoc). La conexión de lectura ya funciona. No se aplicaron cambios remotos.

## Próximo paso

La copia local se alineó con `36984103a9a0138a685b7282e4c6432e5955e2e7` y se recuperó el historial Git desde GitHub. Rama de trabajo: `feat/formulario-paciente` (todavía sin publicar).

Respaldo anterior a la actualización: `.local-backups/20261118-153328/antes-alinear.tar.gz`, excluido de Git mediante configuración local. Los dos documentos de contexto antiguos también se conservaron localmente y se excluyeron del estado de trabajo. El respaldo no incluye dependencias ni metadatos Git (no existían).

El diagnóstico inicial de TypeScript encontró módulos y declaraciones de Next.js ausentes en la instalación local. Se reinstalaron 531 paquetes con `npm ci` desde el lockfile. Después, `npm run typecheck` y `npm run lint` terminaron correctamente. `next.config.ts` coincide con la versión de Leo; no fue necesario añadir una corrección propia. La instalación informó un postinstall bloqueado para `unrs-resolver`; no se amplió la autorización de scripts y los controles citados pasaron.

Fase 2 revisada: ver [verificación del flujo](verificacion-flujo-2026-11-18.md). Pasaron 89 pruebas en 9 archivos, con un trabajador y hooks de 60 segundos. Se confirmó acceso de lectura a metadatos de Supabase. Quedan diferencias funcionales por acordar: dos circuitos de inicio/cierre, odontograma directo sin sesión, selección de sesión activa, asociación de paciente nuevo al odontólogo/cita y diferencias del historial de migraciones. No se aplicaron cambios a Supabase ni se implementó el formulario.

Tarea 1 del nuevo plan: GitHub sigue en `3698410`; se recuperaron las tres migraciones originales de OCR/retirada y se corrigió el nombre de versión de la función dental para coincidir con las 27 entradas del historial remoto, sin cambiarlo. Ver [entorno de desarrollo](desarrollo-base-datos.md).

Próximo paso: tarea 2, estados y contratos según el flujo aprobado. Las migraciones del formulario y la interfaz todavía no están implementadas.
