# Alquimia Dental · Sistema clínico

Sistema interno de Alquimia Dental (San Miguel, La Paz) para el Doc y su equipo. todo lo
maneja el personal de la clínica. Primera versión real, sobre Supabase (base de datos y acceso) y Next.js.

## Qué hace

| Módulo        | Quién                                 | Qué                                                                                                                                      |
| ------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Inicio        | todos                                 | Citas del día, sala de espera, ingresos y saldos (caja), stock bajo, primeros pasos de configuración                                     |
| Agenda        | todos (el odontólogo, solo la suya)   | Citas por gabinete, horarios libres reales, reprogramar, cancelar, sin doble reserva                                                     |
| Recepción     | admin, recepción                      | Llegadas del día: confirmar, «Llegó» (sala de espera + aviso al odontólogo)                                                              |
| Pacientes     | todos (el odontólogo, solo los suyos) | Directorio, alta, ficha, anamnesis versionada, odontograma acumulado, plan pendiente, atenciones y cuenta                                |
| Consulta      | admin, odontólogo                     | Iniciar atención, hallazgos por pieza y superficie, plan (hoy / próximas sesiones), notas, insumos, **finalizar y cobrar**               |
| Caja          | admin, recepción                      | Apertura, cobros y saldos, gastos, anulaciones (admin), arqueo y cierre con diferencia explicada                                         |
| Inventario    | todos leen; admin escribe             | Stock por lotes y vencimiento, ingresos, ajustes y mermas, movimientos                                                                   |
| Configuración | admin                                 | Datos de la clínica, horario, feriados, gabinetes, tratamientos y precios, recetas de insumos, equipo y turnos, importar pacientes (CSV) |


## Documentación

- [`docs/arquitectura.md`](docs/arquitectura.md): capas, migraciones y decisiones.
- [`docs/seguridad.md`](docs/seguridad.md): reglas, permisos por rol y estado verificado.
- [`docs/operacion.md`](docs/operacion.md): puesta en marcha, respaldos, altas y bajas, rotación de llaves, incidentes.
- [`docs/fase1-brief.md`](docs/fase1-brief.md): brief original de la Fase 1.

Preparado por Lumen Labs.
