# Historial clínico por sesiones

Guía de alcance y aceptación; investigación consultada el 16 de noviembre de 2026. Describe una propuesta, no funcionalidades ya terminadas.

## Punto de partida

- La ficha clínica ya muestra una cronología con atenciones, notas, anamnesis y cambios dentales. La migración `0017_historial_clinico.sql` guarda `clinical_notes` del equipo o importadas: una vez incorporadas no se editan ni borran; las correcciones son notas nuevas.
- La importación existente lleva antecedentes a versiones de anamnesis y texto histórico a `clinical_notes` con origen `import`. Si no se indicó fecha del historial, hoy se usa la fecha de importación; no debe presentarse como fecha cierta de atención. La importación puede fallar parcialmente: conservar y conciliar resultados existentes antes de reintentar.
- Existen atenciones (`encounters`) y metadatos de archivos clínicos en el esquema; eso no demuestra que estén implementadas todas las funciones propuestas aquí. Verificar la interfaz y políticas efectivas antes de integrar.
- La migración `0013_staff_only.sql` eliminó el acceso del paciente, el check-in y el circuito de consentimientos firmados en línea. No hay que asumir portal ni firma electrónica existentes. También cambió `has_mfa()` para requerir sesión, no segundo factor; cualquier requisito adicional debe implementarse y verificarse.

## Flujo propuesto

Una sesión representa una atención de un paciente, con fecha y profesional responsable; puede vincularse a una cita existente o crearse sin ella. Una cronología de mensajes, visualmente familiar como WhatsApp, sirve para que el profesional escriba notas, adjunte archivos y dicte: es una interfaz interna, no una conversación con el paciente ni un envío por WhatsApp. Mostrar fecha, autor, tipo y estado de cada entrada. Evitar sesiones o mensajes duplicados ante reintentos.

El texto nuevo puede prepararse como borrador editable. Al confirmarlo, registrar autor y fecha y protegerlo frente a edición o borrado silenciosos; una corrección posterior se agrega como entrada vinculada, sin ocultar el original. Diferenciar fecha de atención de fecha de registro. Las sesiones antiguas, notas importadas, anamnesis y odontograma deben seguir visibles con su procedencia, incluso cuando no puedan asociarse con seguridad a una sesión. No inventar autores, fechas ni dividir registros históricos arbitrariamente.

## Audio y transcripción

1. El profesional graba o adjunta audio a la sesión. Validar formato, tamaño y permisos; mostrar subida y errores, sin perder el archivo ante una falla de transcripción.
2. Si la clínica habilita el proveedor y la autorización aplicable, enviar desde el servidor. La clave queda en el servidor; nunca en navegador, repositorio ni registros. Presentar el resultado como **borrador automático**, con acceso al audio y edición antes de confirmar. El profesional comprueba nombres, dosis, piezas y negaciones. Un fallo permite reintentar o escribir manualmente.
3. La [guía oficial de transcripción](https://developers.openai.com/api/docs/guides/speech-to-text) indica archivos de hasta 25 MB y formatos `flac`, `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `ogg`, `wav` y `webm`; para archivos mayores plantea comprimir o dividir evitando cortar frases. Verificar el formato real de grabación del navegador y las restricciones del servidor antes de elegir límites propios.
4. La misma guía señala que **`whisper-1` está obsoleto y se retirará el 26 de febrero de 2027**. Si «Whisper» significa la experiencia de dictado, evaluar el flujo de transcripción vigente documentado por OpenAI antes de implementar; si se exige específicamente `whisper-1`, informar su fecha de retiro y acordar migración. No dar por garantizados disponibilidad, idioma, precisión ni costos sin probar la cuenta y el modelo elegidos.

## Radiografías y PDF

- Guardar el PDF original completo como adjunto privado, con paciente, sesión, nombre, fecha, autor, tamaño y tipo; permitir abrirlo y descargarlo según permisos. Comprobar tipo y tamaño en servidor, proteger contra acceso entre pacientes y clínicas y definir límites de almacenamiento. Conservarlo aunque falle la extracción.
- Un análisis opcional puede extraer texto y datos administrativos visibles como **borrador con referencia al PDF y página cuando sea posible**. El profesional contrasta con el original, corrige y decide qué incorporar. El borrador, el texto revisado y el archivo original son cosas distintas; nunca sustituir ni modificar el original con la extracción.
- Los modelos no deben diagnosticar radiografías automáticamente, afirmar hallazgos clínicos ni incorporarlos como hechos. La interpretación y sus conclusiones corresponden al profesional, que puede redactarlas en una nota propia. Los escaneos, mala resolución, orientación o letra pueden producir omisiones y errores.
- [OpenAI: entradas de archivos](https://developers.openai.com/api/docs/guides/file-inputs) explica que, para PDF en modelos con visión compatibles, se incluye texto extraído e imágenes de páginas en el contexto; esto consume tokens y puede aumentar el costo. La guía indica menos de 50 MB por archivo y 50 MB en total por solicitud. Estos son límites del proveedor, no garantía de que la aplicación admita ese tamaño ni de calidad diagnóstica.

## Contratos quirúrgicos y exportación

El profesional puede adjuntar a la sesión el contrato o consentimiento quirúrgico original, o preparar un documento a partir de una plantilla clínica aprobada. Identificar tipo, versión, paciente, procedimiento, fecha y estado real: borrador, pendiente o documento firmado externamente, según evidencia disponible. Un archivo adjunto o casilla interna no equivale por sí solo a una firma válida ni acredita aceptación. La clínica debe aprobar textos, procedimiento, retención y mecanismos de firma con asesoría competente; implementar una eventual firma o portal sería otro proyecto.

La exportación solicitada debe preparar para el paciente una copia legible, ordenada por fecha y sesión, con identificación, notas clínicas confirmadas, profesional, origen de registros importados y relación de adjuntos autorizados. Adjuntar originales cuando se soliciten y sea viable; si se entregan por separado, enumerarlos claramente. Excluir borradores, información técnica, claves, rutas privadas y datos de otros pacientes; distinguir información ausente de información negativa. La clínica debe definir contenido, destinatario, autorización, formato y medio seguro de entrega. Descargar desde una cuenta del personal autorizado no significa que exista portal del paciente. Registrar quién exportó, cuándo y qué alcance tuvo, sin copiar datos sensibles innecesarios al registro de auditoría.

## Seguridad y decisiones previas

Aplicar en servidor y almacenamiento privado los permisos clínicos efectivos por clínica y paciente; verificar que recepción no reciba contenido clínico y que acceso, adjuntos, extracción y exportación cumplan las mismas restricciones. Revisar auditoría, retención, respaldos, restauración, archivos huérfanos y caducidad de enlaces de descarga. No registrar audio, textos clínicos ni documentos en logs. Confirmar la base y evidencias de autorización/consentimiento para grabar y enviar datos de salud a proveedores, con la clínica y asesoría local, antes de activar funciones externas. Los consentimientos eliminados por `0013` no deben suponerse reutilizables.

Antes de usar OpenAI hacen falta cuenta, clave y modelo habilitados, presupuesto, contrato y configuración aceptados por la clínica. La [documentación oficial de controles de datos](https://developers.openai.com/api/docs/guides/your-data) distingue retención según endpoint y configuración: por ejemplo, archivos subidos mediante Files pueden persistir hasta su eliminación, y Responses puede guardar estado; no asumir retención cero ni residencia específica. Revisar controles disponibles y eliminación de recursos remotos para la cuenta real. Sin configuración o autorización, el registro manual y la conservación local del adjunto deben seguir disponibles.

## Lista de aceptación para implementación

- [ ] Crear y consultar sesiones de un paciente con fecha, profesional y vínculo opcional a cita; evitar duplicados y cruces entre pacientes.
- [ ] Escribir entradas en orden claro; conservar borradores hasta confirmación y registrar correcciones posteriores sin reescribir lo confirmado.
- [ ] Mostrar historia importada, anamnesis, atenciones y odontograma sin pérdida ni fechas o asociaciones inventadas; verificar importaciones parciales y reintentos.
- [ ] Adjuntar y recuperar originales de PDF y audio bajo autorización clínica; probar carga fallida, archivo inválido, límites y aislamiento entre pacientes y clínicas.
- [ ] Transcribir solo con proveedor configurado y autorización aplicable; probar error, reintento y revisión humana antes de confirmar; no depender de `whisper-1` sin plan de retiro.
- [ ] Si se activa extracción de PDF, mantener original y borrador separados, mostrar fuente y permitir revisión; no producir diagnósticos automáticos de radiografías.
- [ ] Registrar contratos con estado y evidencia reales; no mostrar como firmado ni prometer firma en línea sin implementación y validación específicas.
- [ ] Generar una exportación legible para el paciente con alcance explícito, documentos autorizados y auditoría, sin borradores ni datos de terceros; probar archivos faltantes y permisos.
- [ ] Verificar accesos de administrador, odontólogo asignado, recepción y otra clínica, incluidas descargas y exportación; comprobar registros de auditoría sin contenido clínico.
- [ ] Acordar con la clínica proveedor, clave, costos, consentimiento, retención, formatos, plantillas y entrega antes de habilitar el procesamiento o la distribución.

## Implementación del 16 de noviembre de 2026

Se implementaron tablas `clinical_sessions` y `clinical_messages`, relación de adjuntos con sesión y paciente, originales privados, categorías (radiografía, historia, contrato, imagen, documento, audio), publicación explícita de notas y protección de sesiones cerradas. Los registros anteriores se conservan en un archivo de consulta y no se reasignan inventando sesiones.

En la ficha hay un diario con aspecto de conversación, vista limpia del paciente y exportación PDF desde el servidor. La exportación filtra notas privadas y audios; incorpora documentos PDF como copia visual y conserva sus bytes originales como archivos incrustados. Una copia combinada no valida ni reemplaza las firmas del original. Los contratos adjuntos no se consideran firmados automáticamente. El acceso de pacientes por portal, el formulario público y la captura/verificación de firma digital no se reactivaron en este cambio.

La grabación usa el micrófono del navegador (inicio/detención, hasta un minuto). El audio queda privado. Whisper devuelve texto editable sin guardarlo automáticamente; la confirmación crea la nota con referencia al archivo fuente. El análisis opcional de PDF hace lo mismo, con indicación de página solicitada; no interpreta radiografías. Las solicitudes de procesamiento registran la declaración de autorización del profesional; esto no equivale a capturar una firma o consentimiento del paciente.

Configuración pendiente: `OPENAI_API_KEY` en el servidor/Vercel. `OPENAI_DOCUMENT_MODEL` permite configurar el modelo de lectura PDF (por defecto `gpt-4.1-mini`). Whisper usa `whisper-1` por petición del proyecto; revisar su retiro anunciado antes del 26/02/2027. Nunca usar prefijo `NEXT_PUBLIC_` para la clave. No se pudo realizar una prueba real del proveedor porque no hay clave local ni en Vercel; las pruebas automatizadas simulan sus respuestas y fallos.

Límites de esta versión: 3 MB por archivo para la nueva carga de sesiones; dividir o reducir documentos mayores. El exportador limita el total de adjuntos a 30 MB por operación. WEBP y audios no se incrustan visualmente en el PDF; los audios se conservan privados y se exporta su texto solo si fue revisado/publicado. Los errores de adjuntos protegidos o dañados se indican en la exportación.

Verificación de integración: 430 pruebas automatizadas aprobadas (incluyen RLS, relaciones sesión/paciente/archivo, notas inmutables, exclusión de notas privadas, borradores de IA y PDF). La revisión visual en escritorio y móvil de 390 px no detectó desbordamiento horizontal y confirmó que la vista paciente oculta notas internas. Se usaron datos de prueba interceptados en el navegador para evitar introducir información ficticia en expedientes reales. La API de lectura autenticada sí se comprobó contra Supabase. Next.js y su configuración de lint se actualizaron a 16.4.6 para corregir el aviso de seguridad detectado durante el build.

Build de producción y 42 pruebas de navegador aprobados en escritorio y móvil, con el navegador Chromium disponible en el equipo (Brave). TypeScript, ESLint y revisión de diferencias aprobados.

## Actualización del 18 de noviembre de 2026

El cierre de consulta ahora dispone de `start_care` / `finish_care`: crea una sesión enlazada de forma transaccional y al finalizar cierra solo esa sesión. Las sesiones manuales permanecen independientes. Los recibos de cierre hacen los reintentos seguros; el consumo FEFO solo descuenta existencias vigentes reales y conserva faltantes en `stock_consumption_deficits` para conciliación administrativa.

Se agregó `clinical_assessments`, una evaluación estructurada que conserva revisiones, con permisos clínicos por paciente y publicación explícita para su copia. PDF incluye identificación, antecedentes declarados, campos de evaluación profesional, odontograma, plan, evolución y adjuntos en un formato de expediente. Los campos ausentes no se convierten en resultados negativos. Fotos JPG/PNG/WEBP se representan en la copia y sus originales se conservan incrustados; los PDF también conservan su original sin modificar. Audio permanece privado.

El compositor admite selección múltiple, cámara, galería, arrastre, pegado de imágenes, revisión por archivo y reintento de errores sin perder adjuntos. La interfaz está adaptada a móvil, tablet y escritorio. La lectura de documentos y transcripción reales siguen dependiendo de configurar el proveedor y revisar sus resultados; no se validó una llamada real de IA en esta actualización.

Validación final de esta actualización: 474 pruebas automatizadas aprobadas, 42 pruebas de navegador en escritorio y móvil, TypeScript, ESLint y build de producción correctos. El PDF de demostración se renderizó y revisó visualmente. La API autenticada de exportación respondió PDF válido contra la base real, sin añadir notas ficticias a expedientes. Las interacciones de subida y fallos se verificaron con datos simulados; no se utilizó un dispositivo físico iOS o Android para certificar cámara/micrófono.
