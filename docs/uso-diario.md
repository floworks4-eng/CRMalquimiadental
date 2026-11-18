# Uso diario

## Modelo dental

El administrador y los odontólogos abren **Modelo dental 3D** desde el menú. Pueden elegir una pieza en el mapa o el modelo y activar las vistas **Dentadura**, **Ver raíces** y **Nervios y vasos**. Para registrar estados, elige la fecha y la atención del paciente e inicia la atención desde esta misma pantalla. Toca una pieza para abrir la ventana de estados y elige Caries, Restaurado / curado, Sano, Roto / fracturado u otro estado. Cada opción se guarda inmediatamente. Pulsa «Listo · volver al modelo» para elegir otra pieza. Puedes continuar con otra pieza. Las caras son opcionales: selecciónalas antes de tocar el estado. «Quitar marca de hoy» elimina solo el registro de la atención actual y vuelve a mostrar el anterior; «Sano» registra una nueva valoración sana. Las atenciones cerradas son de solo lectura. Sin paciente seleccionado también se abre la ventana y permite probar los estados; sus marcas son temporales y el aviso «Prueba sin paciente» lo indica. La misma interacción está disponible dentro de Consulta.

## Nueva cita y paciente nuevo

En **Agenda → Nueva cita**, el selector muestra los 12 pacientes recientes. Al escribir dos letras o parte del celular, busca en las fichas existentes. Si la persona aún no tiene ficha, **Crear paciente nuevo** pide su nombre y, opcionalmente, celular; al crearla queda seleccionada en la cita. El origen elegido se registra como primera fuente de llegada. El resto de datos puede completarse en **Pacientes**. Una cita requiere un tratamiento activo configurado por el administrador.

## Estadísticas de pacientes

**Mi día** muestra pacientes registrados no archivados, su primera fuente de llegada, grupos de edad calculados con la fecha de nacimiento y los cinco tratamientos más agendados en citas vigentes o atendidas. Las canceladas y las ausencias no cuentan para tratamientos. El odontólogo solo ve sus pacientes y citas por las mismas políticas de acceso del sistema.

## Caja y control mensual

**Caja → Resumen mensual** separa:

- **Facturado interno:** total de atenciones emitidas en el mes. No equivale a cobros.
- **Cobrado por tratamientos:** pagos del mes menos anulaciones del mes.
- **Otros ingresos y gastos:** movimientos registrados en caja.
- **Flujo neto:** suma de todos los movimientos del mes por método.
- **Por cobrar hoy:** saldos abiertos actualmente, incluso de meses anteriores, con antigüedad y listado por paciente.

Los botones CSV exportan todos los movimientos del mes y todos los saldos actuales. Los importes se guardan como centavos de boliviano y no se truncan en el reporte. Los gastos se clasifican con categorías consistentes desde el formulario.

Este reporte sirve para control operativo. La numeración de `invoices` es interna; no emite documentos fiscales ni presenta declaraciones al SIN. La emisión fiscal en línea requiere un sistema autorizado y validación ante el SIN: [información oficial sobre factura electrónica](https://siatinfo.impuestos.gob.bo/index.php/facturacion-en-linea/factura-electronica).

## Llegadas y atención del día

**Recepción trabaja en Agenda.** El tablero superior reúne «Por llegar», «En espera», «En consulta» y «Atendidos». En la tarjeta, **Registrar llegada** mueve la cita a la espera y anota la hora. No hace falta arrastrar tarjetas con precisión. El servidor confirma el cambio; un rechazo conserva el estado y explica el problema.

**El odontólogo trabaja en Atención y la ficha del paciente.** Atención muestra sus consultas activas y su espera en orden de llegada. **Iniciar atención** abre el encuentro y crea una sola sesión de historial vinculada. El mismo control aparece sobre el historial del paciente. En tablet y celular, Atención está en la navegación principal. Las colas visibles se actualizan cada diez segundos.

Al terminar, **Finalizar atención → Confirmar cierre** cierra encuentro, cita y sesión vinculada, conservando las notas. Una evaluación sin tratamientos exige una nota clínica. Los tratamientos preparados para esa atención generan su documento de cobro; recepción cobra en Caja. Un reintento no duplica factura ni consumo de materiales. Si faltan insumos registrados, la atención puede cerrarse y administración recibe el pendiente para conciliarlo; no se inventan existencias ni se deja un lote negativo.

## Historia, fotos y documentos

En la ficha del paciente, **Ficha clínica** reúne motivo, enfermedad actual, antecedentes, exploración, pruebas, diagnóstico, pronóstico, plan e indicaciones. Cada revisión conserva la anterior. Un campo sin completar queda «No registrado». El profesional puede incluir o excluir su evaluación de la copia para el paciente.

El historial se organiza por sesiones. El clip permite elegir fotos, cámara o documentos. En computadora también se pueden soltar archivos sobre la conversación o pegar una imagen desde el portapapeles. La lista previa permite revisar, quitar, categorizar y elegir qué se incluye en la copia. **Enviar** confirma la nota y los adjuntos; las subidas fallidas se conservan para reintentar. El audio se revisa antes de enviar y queda interno. Se admite hasta 3 MB por archivo; en pantallas táctiles siempre se puede usar el selector sin depender de arrastrar.

**Exportar PDF** genera una historia clínica con identificación, anamnesis, evaluación publicada, odontograma, plan, evolución por fecha y adjuntos autorizados. Conserva los originales incrustados y agrega las páginas de los PDF aportados. Una copia combinada no sustituye ni valida firmas del original. No se exportan notas internas, borradores ni grabaciones de audio. Formularios públicos y firma del paciente se abordarán por separado.
