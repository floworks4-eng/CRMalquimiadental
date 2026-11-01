# Alquimia Dental · Sistema clínico

Sistema interno de Alquimia Dental (San Miguel, La Paz) para el Doc y su equipo. **Los pacientes no entran nunca**: todo lo
maneja el personal de la clínica. Primera versión real, sobre Supabase (base de datos y acceso) y Next.js.

La demo comercial con datos ficticios quedó congelada en la rama `demo` (tag `demo-v1`).

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

Al **finalizar una atención**, en una sola operación: factura con número correlativo, pago total o parcial, descuento de
insumos (primero el lote que vence antes), cita «Atendida», plan actualizado y auditoría. Si faltan insumos no se cierra nada
y se muestra qué falta. Un reintento (doble clic, red caída) nunca cobra dos veces.

## Correr en local

```bash
npm install
cp .env.example .env.local   # completar con las llaves del proyecto de Supabase
npm run dev
```

Abrir http://localhost:3000. Con la base vacía, `/login` lleva a **Configuración inicial**: nombre de la clínica y la cuenta
del administrador (el Doc). Se hace una sola vez. Después, «Primeros pasos» en Inicio guía el resto.

## Base de datos

Migraciones en `supabase/migrations` (se aplican en orden). Contra el proyecto enlazado:

```bash
npx supabase db push --linked
```

`supabase/seed.dev.sql` son datos ficticios **solo para las pruebas automáticas**; nunca se cargan en el proyecto real.

## Verificar

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

- `npm test`: reglas de negocio y permisos (RLS) sobre Postgres en memoria (PGlite), más unitarias.
- `npm run test:e2e`: build de producción + Playwright (acceso sin sesión, cabeceras de seguridad).

## Documentación

- [`docs/arquitectura.md`](docs/arquitectura.md): capas, migraciones y decisiones.
- [`docs/seguridad.md`](docs/seguridad.md): reglas, permisos por rol y estado verificado.
- [`docs/operacion.md`](docs/operacion.md): puesta en marcha, respaldos, altas y bajas, rotación de llaves, incidentes.
- [`docs/fase1-brief.md`](docs/fase1-brief.md): brief original de la Fase 1.

Preparado por Lumen Labs.

## Interfaz de la clínica

La interfaz usa tonos plomo con dorado y paneles translúcidos. «Mi día» muestra un resumen y accesos rápidos; Agenda reúne calendario, llegadas y sala de espera. Las vistas Día, Semana, Mes y Lista leen las citas reales de Supabase y respetan los horarios, feriados y permisos existentes. `/consulta` y `/recepcion` conservan sus controles de acceso y llevan al apartado correspondiente de Agenda. La atención individual sigue disponible en `/consulta/[id]`.

El sistema completo se publica en la rama predeterminada `feat/F1-04-primera-version`. La rama `feat/ocr-historias` conserva la demostración anterior; no es la versión conectada a Supabase.
