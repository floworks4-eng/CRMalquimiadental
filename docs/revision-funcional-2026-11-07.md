# Revisión funcional — 7 de noviembre de 2026

## Cambios

- Colores distintos para los once estados dentales, compartidos entre mapa, selector y modelo 3D. Caries amarilla; restauración celeste; sano verde.
- El resaltado de selección conserva el color del hallazgo.
- Fractura con pérdida visible de parte de la corona; implante con raíz de aspecto roscado y material metálico. Cambiar de estado restaura la geometría original.
- Contorno tenue seleccionable para corregir una pieza marcada ausente.
- Encuadre centrado en la dentadura; botón Dentadura completa restablece capas y selección; leyenda compacta.
- Cambios en las caras del diente se guardan al cerrar el editor; ante rechazo permanece abierto con el error.
- Ficha, consulta y modelo usan el registro dental más reciente por fecha, incluyendo los cambios directos desde Pacientes.
- Lectura paginada de hallazgos, sin perder los más recientes por el límite de filas de la API.
- Administración puede consultar el historial auditado de cambios directos del odontograma, incluidos reemplazos y eliminaciones. Se mantienen los permisos existentes: el historial de auditoría administrativa no se entrega a odontólogos.
- Caja diaria, mensual y dashboard leen todos los movimientos y pendientes mediante paginación. Un fallo de lectura genera un error en vez de mostrar un total parcial o cero.
- Dashboard distingue el balance neto de los ingresos.
- Citas: recuperación ante fallos de red; reprogramar invalida el horario seleccionado al cambiar de fecha y descarta respuestas de solicitudes antiguas.

## Comprobaciones realizadas

- Suite automatizada: 409 pruebas aprobadas, con contratos de consultas, permisos, RLS y operaciones clínicas/contables en base aislada.
- TypeScript, ESLint y `git diff --check` aprobados.
- Build de producción y 42 pruebas Playwright aprobados en escritorio y móvil. Cubren acceso sin sesión, validación, rutas protegidas, callback, cabeceras y health.
- Navegador con sesión real: ingreso y carga de Inicio, Agenda, Pacientes, Modelo 3D, Caja, Inventario, Configuración y Cuenta. Respuestas HTTP 200 sin alertas de aplicación.
- Carga de las cinco secciones de Configuración, apertura del formulario de cita y creación rápida de paciente, sin guardar datos ficticios en producción.
- Modelo local: selección directa sobre el canvas abre el editor; aplicación de los once estados; caries y fractura inspeccionadas visualmente; pantalla completa y viewport móvil de 390 px sin desbordamiento horizontal.

## Alcance y configuración pendiente

En producción no hay tratamientos activos. Es necesario cargar los tratamientos y precios reales en Configuración → Tratamientos y precios para confirmar citas. La interfaz explica este requisito.

Las operaciones clínicas y de caja se comprobaron con pruebas aisladas; no se crearon cobros ni se modificó el diagnóstico de pacientes reales para probar. Esta revisión documenta cobertura y fallos reproducidos; no constituye una garantía de ausencia absoluta de errores ni de cada combinación posible de datos, permisos y conectividad.
