# Alquimia Dental · Qué se construyó y qué necesita la clínica

Documento de trabajo de Lumen Labs. Resume la demo front-end entregada y lo que una clínica como Alquimia Dental necesita para pasar de demo a sistema real.

- Fecha: 23/10/2026
- Demo: `npm install && npm run dev` → http://localhost:3000
- Investigación de base: [`clinica.md`](clinica.md)
- Todos los datos de la demo son ficticios. Lo marcado `[ejemplo]` debe validarse con la clínica.

---

## 1. Resumen

Alquimia Dental se mudó a un local más grande con varios gabinetes. El costo fijo subió y hay sillones vacíos. Hoy la clínica trabaja con fichas en papel, agenda/caja/inventario en Excel y un WhatsApp que no responde fuera de horario. Además, no puede saber qué anuncio trajo a qué paciente que pagó.

La demo muestra, con un solo flujo conectado, cómo se resuelve eso: un paciente llega por WhatsApp o web, se agenda, hace check-in por QR con su anamnesis digital, el doctor lo atiende con odontograma 3D, se descuentan insumos, se cobra en caja y la analítica muestra de qué anuncio vino.

La demo es solo front-end: sin backend, sin base de datos y sin integraciones reales.

## 2. Situación y problemas de la clínica

| Problema de hoy | Consecuencia | Cómo lo aborda la solución |
|---|---|---|
| Fichas médicas en papel | Datos clínicos dispersos, difíciles de buscar, riesgo de pérdida | Ficha digital, anamnesis por QR, ingesta de historiales con revisión humana |
| Agenda, caja e inventario en Excel | Errores, doble reserva, sin visión del día | Agenda por gabinete con control de choques, caja y stock conectados a la consulta |
| No saben qué insumo gasta cada tratamiento | Costo real desconocido, quiebres de stock | «Receta» de insumos por procedimiento con descuento automático |
| WhatsApp sin respuesta fuera de horario | Pacientes perdidos | Asistente 24/7 con el mismo número de la clínica, con toma de chat por el equipo |
| Marketing sin trazabilidad | No se sabe qué anuncio genera pacientes que pagan | Origen en cada cita (WhatsApp, Web, Campaña) y embudo Atraer → Cobrar |
| Capacidad ociosa (sillones vacíos) | Costo fijo sin retorno | Ocupación por gabinete y captación de pacientes por campañas |

Activo clave: el número de WhatsApp de más de 20 años. Se conserva; el sistema se conecta a él.

## 3. Lo construido (demo)

Stack: Next.js (App Router), TypeScript, Tailwind CSS, three.js con React Three Fiber, `lucide-react`, `qrcode`. Sin variables de entorno.

### 3.1 Pantallas

| Pantalla | Ruta | Qué muestra | Roles |
|---|---|---|---|
| Entrada y selector de rol | `/` | Wordmark, 3 tarjetas de rol, botón de demo guiada, accesos a las páginas públicas | Todos |
| Inicio | `/inicio` | Saludo, notificaciones, citas por gabinete, estado de caja, próxima cita activa y botón INICIAR ATENCIÓN MÉDICA | Todos (contenido según rol) |
| Agenda y gabinetes | `/agenda` | Vista del día por sillón (2 a 5 gabinetes), chip de origen en cada cita, crear/mover cita con validación y detección de choques | Admin, Odontólogo (solo lo suyo), Recepción |
| Check-in QR (recepción) | `/recepcion` | QR por cita, lista de llegadas y celular simulado del paciente | Admin, Recepción |
| Check-in QR (paciente) | `/check-in` | Anamnesis en 3 pasos: datos, salud (alergias/antecedentes), consentimiento y firma | Público |
| Pacientes (CRM) | `/pacientes`, `/pacientes/[id]` | Búsqueda, filtros por origen y estado, ficha con anamnesis, historial, origen de captación, pagos | Admin, Odontólogo (solo sus pacientes), Recepción (sin datos clínicos) |
| Consulta activa | `/consulta`, `/consulta/[id]` | Datos y alergias, odontograma 3D/2D, plan de tratamiento con precios, insumos, finalizar atención | Admin, Odontólogo |
| Inventario | `/inventario` | Stock, mínimos, alertas, «receta» por procedimiento, registro de ingresos | Admin; Odontólogo en lectura |
| Finanzas y caja | `/caja` | Movimientos del día, método de pago (QR, transferencia, efectivo), cobros que llegan desde la consulta | Admin, Recepción |
| Asistente de WhatsApp (simulado) | `/whatsapp` | Teléfono con 3 chats de ejemplo, reproducción paso a paso, «Tomar el chat», recordatorios de 48 h y 24 h | Admin, Recepción |
| Portal público | `/agendar-cita` | Elección de tratamiento, día y hora con disponibilidad real según la agenda; crea la cita con origen Web o Campaña (`?utm_campaign=`) | Público |
| Analítica | `/analitica` | Ocupación, citas por origen, costo por cita, embudo, tabla de campañas y recorrido del paciente de la demo | Admin |
| Ingesta de historiales (OCR simulado) | `/ingesta` | Foto o Excel → lectura animada → borrador con campos de baja confianza marcados → aprobación obligatoria | Admin, Odontólogo |
| Equipo y roles | `/equipo` | Equipo y matriz de permisos por módulo | Admin |
| Ruta de implementación | `/ruta` | Línea de 25 días, 5 fases y el hito del primer paciente real | Admin |

### 3.2 Demo guiada de 5 minutos

El botón **DEMO GUIADA · 5 MIN** de la entrada reinicia los datos, entra como Administrador y muestra una tarjeta con «Siguiente». Probado de punta a punta:

1. **WhatsApp agenda la cita.** Una paciente llega desde el anuncio «Limpieza San Miguel», el asistente responde, propone horarios y agenda. La cita aparece en la Agenda con origen WhatsApp y su campaña.
2. **Check-in con QR.** La paciente llena la anamnesis en el celular simulado. El estado pasa a «En sala de espera» y el odontólogo recibe una alerta que incluye alergias.
3. **Iniciar atención y odontograma 3D.** Se marca una caries y una corona; el plan de tratamiento se arma solo.
4. **Finalizar atención.** Se descuentan los insumos, entra el cobro a caja y la cita queda «Atendida». Si un insumo llega a su mínimo, se notifica.
5. **Analítica.** El recorrido muestra: anuncio → WhatsApp → cita → atención → cobro.

### 3.3 Odontograma

- Dos arcadas en 3D con giro, zoom y selección por clic.
- Numeración FDI: permanente 11–48 y temporal 51–85 (se abre en temporal si el paciente tiene menos de 12 años).
- Marcas: caries, corona, endodoncia, ausente, con leyenda y etiquetas de texto (no depende solo del color).
- Interruptor 2D/3D. La vista 2D (SVG, accesible por teclado) es el respaldo si el equipo no tiene WebGL.
- El 3D se carga bajo demanda. No simula resultados clínicos (ortodoncia, implantes).

### 3.4 Control por roles (RBAC)

| Módulo | Administrador | Odontólogo | Recepción |
|---|---|---|---|
| Inicio | Total | Solo lo suyo | Operativo |
| Agenda | Total | Solo su agenda | Total |
| Check-in QR | Total | — | Total |
| Pacientes | Total | Solo sus pacientes | Sin datos clínicos |
| Datos clínicos y consulta | Total | Solo sus pacientes | — |
| Inventario | Total | Lectura | — |
| Finanzas y caja | Total | — | Registrar cobros |
| WhatsApp | Total | — | Total |
| Analítica, Equipo, Ruta | Total | — | — |
| Ingesta de historiales | Total | Revisar y aprobar | — |

Verificado entrando por URL directa a pantallas restringidas: Recepción no ve datos clínicos ni analítica; el odontólogo no ve pacientes de otro colega.

### 3.5 Arquitectura de la demo

- `src/lib/data.ts`: única capa de datos. Tipos (`users`, `patients`, `cabinets`, `appointments`, `anamnesis_data`, `clinical_records`, `odontogram_events`, `procedure_supplies`, `inventory_items`, `transactions`), estado en memoria con persistencia en `localStorage` y todas las acciones. Está pensada para reemplazarse por Supabase sin tocar las pantallas.
- `src/lib/seed.ts`: datos de ejemplo. Se regeneran solos cada día para que «hoy» siempre tenga citas.
- Botón **Reiniciar demo** en la barra lateral (en celular, en «Más»).
- Responsive: en laptop, barra lateral; en celular, una columna con barra inferior de 4 pestañas.
- Accesibilidad: foco visible, navegación por teclado, etiquetas en formularios, mensajes de error con `role="alert"`, `prefers-reduced-motion`, estados con texto además de color.
- Calidad: `npm run build` y `tsc --noEmit` pasan; consola sin errores ni avisos. No hay pruebas automáticas; la validación fue el recorrido manual completo.

## 4. Lo que necesita una clínica como Alquimia Dental

Para cada necesidad se indica si la demo ya la ilustra y qué falta para producción.

### 4.1 Operación diaria

| Necesidad | En la demo | Para producción |
|---|---|---|
| Agenda multi-gabinete sin choques | Sí (por gabinete y por profesional, con horario de atención) | Persistencia, bloqueos (vacaciones, feriados), listas de espera, reprogramación masiva |
| Recordatorios 48 h y 24 h y confirmación | Mensajes de ejemplo | Plantillas aprobadas por Meta, envío programado, respuesta 1/2 que actualice la cita |
| Check-in sin papel | Sí (QR + anamnesis) | QR firmado y con vencimiento, contacto de emergencia, firma válida del consentimiento |
| Gestión de no-shows | Estado «No asistió» | Reglas de reagendamiento automático y seguimiento |
| Atención de la recepción sin ver datos clínicos | Sí | Revisión de permisos por campo |

### 4.2 Clínica

| Necesidad | En la demo | Para producción |
|---|---|---|
| Historia clínica digital | Anamnesis, historial y odontograma por paciente | Evolución por visita, adjuntos (radiografías, fotos), recetas, presupuestos firmados |
| Odontograma por pieza (FDI) | Sí, con 4 diagnósticos | Más diagnósticos y superficies por pieza, historial de cambios por fecha |
| Plan de tratamiento con precios | Sí, con sesiones «hoy» y «próxima sesión» | Presupuesto aceptado, seguimiento de avance y saldo |
| Alertas de seguridad (alergias, antecedentes) | Alerta visible en inicio y consulta | Alertas por interacción medicamentosa, embarazo, anticoagulantes |
| Migración de fichas en papel y Excel | OCR simulado con revisión | OCR real, revisión humana siempre antes de guardar, registro de quién aprobó |

### 4.3 Insumos y costos

| Necesidad | En la demo | Para producción |
|---|---|---|
| Saber qué gasta cada tratamiento | «Receta» por procedimiento | Recetas validadas por el Doc, por material (A2/A3, tipo de lima) |
| Stock con mínimos y alertas | Sí | Lotes y vencimientos (anestésico, resinas), proveedores, órdenes de compra |
| Costo real por tratamiento y margen | No | Costo de insumos + tiempo de sillón vs. precio |

### 4.4 Caja y finanzas

| Necesidad | En la demo | Para producción |
|---|---|---|
| Cobro desde la consulta | Sí, entra a caja al finalizar | Pagos parciales y saldos, cierre de caja, arqueo |
| Métodos de pago locales | QR, transferencia, efectivo | Conciliación con el banco, comprobantes |
| Facturación | No | Definir con el contador si aplica integración con facturación electrónica |
| Egresos y gastos fijos | Registro simple | Categorías, informes mensuales, punto de equilibrio |

### 4.5 Captación y marketing

| Necesidad | En la demo | Para producción |
|---|---|---|
| Asistente de WhatsApp 24/7 con el número histórico | Simulado | WhatsApp Business API sobre el número actual (migración y verificación con Meta), flujos validados con el Doc |
| El equipo puede intervenir | «Tomar el chat» | Bandeja compartida con asignación y notas internas |
| Página pública de agendamiento | Sí, con disponibilidad real | Dominio propio, SEO y ficha de Google Business |
| Trazabilidad por campaña | Origen en cada cita, embudo y costo por cita con cifras `[ejemplo]` | Conexión con Meta Ads y TikTok (inversión real), parámetros `utm_campaign` en cada anuncio |
| Presencia en redes | — | Contenido orgánico de TikTok (463 seguidores, un video con 19,5 mil vistas), Instagram y Facebook sin confirmar; reseñas de Google |

### 4.6 Seguridad, datos y cumplimiento

Necesidades que la demo no cubre y que deben resolverse antes del piloto:

- **Autenticación real** por usuario, con permisos por rol aplicados en el servidor (en la demo el rol se elige libremente).
- **Cifrado** de datos de salud en tránsito y en reposo, copias de seguridad y plan de recuperación.
- **Registro de auditoría**: quién vio o cambió qué dato clínico y cuándo.
- **Consentimiento informado** con el texto oficial de la clínica y constancia de aceptación.
- **Normativa**: revisar con asesoría legal las obligaciones aplicables en Bolivia sobre historia clínica y datos de salud, y el uso de WhatsApp para comunicaciones.
- **Retención y acceso del paciente** a sus datos, y política de eliminación.

### 4.7 Equipo y cambio de hábitos

- Capacitación por rol (Fase 5) y guías breves de uso.
- Un responsable en la clínica para validar tratamientos, precios y recetas.
- Periodo de convivencia con el Excel y el papel mientras se confía en el sistema (piloto).
- Equipos: computadora o tableta en recepción y en cada gabinete, y celular de recepción para el WhatsApp.

## 5. Simulado vs. real

| Elemento | En la demo | En producción |
|---|---|---|
| Datos | Ficticios, en `localStorage` del navegador | Base de datos (p. ej. Supabase) |
| Usuarios | Selector de rol | Autenticación real |
| WhatsApp y recordatorios | Guion animado | API oficial de WhatsApp Business |
| Meta Ads y TikTok | Cifras `[ejemplo]` | Conexión a las cuentas publicitarias |
| OCR | Datos prefabricados | Servicio de OCR con revisión humana |
| Pagos | Registro de movimientos | Registro + conciliación; sin cobro automático salvo que se acuerde |
| QR de check-in | Funciona entre pestañas del mismo navegador | Funciona entre cualquier dispositivo |
| Precios, horarios, insumos | `[ejemplo]` | Datos reales de la clínica |

Limitación para la reunión: si se escanea el QR con un celular real, el formulario abre pero no actualiza la laptop (no hay backend). Conviene usar el celular simulado de la pantalla de recepción.

## 6. Plan de implementación (25 días, 5 fases)

| Fase | Días | Foco |
|---|---|---|
| 1. Cimientos y migración | 1–5 | WhatsApp Business API con el número histórico, base de datos, roles, migración de Excel y fichas en papel |
| 2. Construcción | 6–12 | Agenda, check-in, ficha y odontograma, inventario y caja, asistente de WhatsApp y `/agendar-cita` |
| 3. Lanzamiento de campañas | 13–18 | Videos orgánicos de TikTok, Meta Ads geolocalizados, atribución por campaña, plantillas de recordatorio aprobadas |
| 4. Piloto | 19–22 | Operación real con el equipo. Hito: primer paciente real de campaña atendido y cobrado |
| 5. Capacitación y entrega | 23–25 | Capacitación por rol, guías y entrega |

La aprobación de plantillas y la verificación del número en Meta pueden tomar tiempo ajeno a nosotros; conviene iniciarlas en el primer día.

## 7. Pendiente de confirmar con la clínica

1. Número real de gabinetes (la demo usa 3, configurable de 2 a 5).
2. Lista oficial de tratamientos y precios en Bs. (los de la demo son de mercado, `[ejemplo]`).
3. Horarios de atención y de sábados (demo: Lun–Vie 08:30–19:30, Sáb 09:00–13:00 `[ejemplo]`).
4. Dirección exacta en San Miguel y ficha de Google.
5. Logo en vector y colores oficiales (la demo usa un wordmark de texto).
6. WhatsApp: confirmar si el 68158721 visto en un flyer de Alquimia Medical Spa es el histórico de 20 años.
7. Instagram y Facebook: usuarios y enlaces exactos (no se pudo verificar por requerir sesión).
8. Nombres y roles del equipo, y qué odontólogo atiende qué especialidad.
9. «Recetas» de insumos por tratamiento, validadas por el Doc.
10. Texto oficial del consentimiento informado.
11. Alcance de la marca: en TikTok aparece como «Alquimia Medical» (odontología + estética/spa) y en el letrero como «Alquimia Dental». Definir si el spa entra en el sistema.
12. Facturación: si se necesita y con qué contador/sistema.

## 8. Riesgos y consideraciones

- **Datos de salud**: son sensibles. No se debe pasar a producción sin autenticación real, cifrado y auditoría.
- **Dependencia de Meta**: la verificación del número, las plantillas y los límites de mensajería no los controlamos. Tener plan B (mensajes de recordatorio manuales).
- **Calidad de la migración**: las fichas en papel y los Excel suelen tener datos inconsistentes; la revisión humana es obligatoria y lleva tiempo.
- **Adopción del equipo**: sin capacitación y un responsable interno, el equipo vuelve al papel.
- **Expectativas sobre la analítica**: el costo por cita y el retorno dependen de que cada anuncio lleve su parámetro de campaña y de que la recepción registre el origen cuando el paciente llame por teléfono.
- **El 3D es un apoyo visual**, no un instrumento de diagnóstico.

## 9. Siguientes pasos

1. Mostrar la demo al Doc con la demo guiada y recoger su reacción.
2. Pedir los datos del punto 7 (sobre todo precios, gabinetes, WhatsApp y logo).
3. Iniciar en paralelo la verificación del número en Meta.
4. Cambiar la capa `data.ts` por Supabase con autenticación y permisos reales.
5. Desplegar en Vercel (`npx vercel`) una versión de demostración con enlace propio.

---

*Demo preparada por Lumen Labs. El modelo económico se omite deliberadamente de este documento.*
