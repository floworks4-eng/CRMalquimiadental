# Continuación del render dental de Alquimia Dental

> Actualización 2026-11-01: el flujo simplificado ya está integrado en consulta e historial. La guía vigente es [docs/render-dental.md](docs/render-dental.md). La investigación y propuestas posteriores de este handoff se conservan como referencia; varias ya están implementadas.

Este documento es un handoff para continuar el trabajo en el repositorio de Alquimia Dental. El objetivo es convertir la vista 3D actual en una herramienta visual clara para que el odontólogo explique la anatomía y los hallazgos al paciente, con una interacción sencilla durante la consulta.

## Objetivo de producto

Crear una vista dental interactiva que:

- Se vea anatómicamente más realista y permita explorar dientes, coronas, raíces, encía y hueso.
- Muestre arterias y, si el modelo fuente permite distinguirlas con respaldo anatómico, nervios y otras estructuras. Las capas deben poder activarse y desactivarse para que la vista no se vuelva confusa.
- Permita al odontólogo seleccionar un diente y explicarlo con palabras simples: nombre, ubicación, superficies y hallazgos registrados.
- Sincronice la selección entre la vista 3D y el odontograma clínico.
- Sea utilizable con mouse, teclado y tacto en escritorio, tablet y celular.
- Mantenga la interfaz lo bastante sencilla para usarla frente al paciente sin explicar primero cómo funciona la pantalla.

El modelo sirve para comunicación visual y educación del paciente. No debe presentarse como reconstrucción individual del paciente ni como herramienta diagnóstica. No se debe inventar o inferir anatomía vascular a partir de geometría que no la contiene.

## Qué hay implementado ahora

- `src/components/dental-workspace.tsx`: componente compartido para consulta, historial y preview; selección controlada, marcación directa al tocar dientes, cambio de dentición y presentación al paciente.
- `src/components/dental-finding-editor.tsx`: selector visual de hallazgos con guardado, errores, caras opcionales y quitar marca de hoy.
- `src/components/dental-tooth.tsx`: SVG de cuatro familias de dientes y nueve hallazgos, usado en mapa y selector.
- `src/components/dental-render.tsx`: tres vistas preparadas, detalles opcionales, zoom, ángulos, explicaciones de hallazgos y alternativa ante fallos.
- `src/lib/dental-scene.ts`: motor Three.js con APIs públicas, carga al mostrarse, selección directa y limpieza de recursos. `@google/model-viewer` se retiró.
- `src/components/odontogram.tsx`: cuatro zonas responsive sin desplazamiento horizontal, nombres comunes, FDI secundario y botones táctiles.
- `src/components/consulta/consulta-view.tsx` y `src/components/patients/patient-clinical.tsx`: integrados con los registros y acciones clínicas existentes.
- `src/app/preview/dental/page.tsx`: demo local con datos ficticios.
- `public/models/teeth.glb`: modelo de 2 118 424 bytes con coronas y raíces separadas, hueso, encía, arterias, venas y nervios. `manifest.json` y `ATTRIBUTION.md` documentan la procedencia.

## Cobertura actual del atlas

- 28 piezas permanentes 3D. Las cuatro muelas del juicio y las 20 piezas infantiles se consultan y registran en el mapa clínico.
- Vasos del lado derecho del atlas y nervios bilaterales. No se espejó ni inventó anatomía.
- El color señala la pieza con un registro; no representa una lesión o tratamiento con precisión geométrica.
- La vista inicia pausada. Las capas detalladas y la información técnica se despliegan solo si se solicitan.
- La carga 3D puede reintentarse y el mapa sigue disponible si WebGL o el modelo fallan.

## Propuestas de la investigación original

Las siguientes secciones conservan el contexto de diseño y las fuentes investigadas. Antes de cambiar el proyecto, consultar la implementación y la guía vigente para evitar repetir trabajo ya terminado.

## Simplificar FDI y selección de dientes

No retirar FDI del registro clínico: ya es el sistema de numeración usado por la aplicación. Hacer que la capa visual explique los números sin exigir que el usuario los memorice.

Propuesta:

1. Reemplazar el encabezado “Simulación FDI” por “Elige un diente”.
2. Mostrar cuatro zonas etiquetadas con texto completo y orientación del paciente: **arriba derecha**, **arriba izquierda**, **abajo izquierda**, **abajo derecha**. Añadir una nota breve “derecha e izquierda del paciente”.
3. Cada diente debe tener un botón grande con número FDI y nombre común al seleccionarlo. Por ejemplo, para 16: “Primer molar superior derecho · pieza 16”. Verificar todos los nombres y cuadrantes con una fuente anatómica fiable antes de dar por buena la tabla.
4. Al seleccionar un diente, resaltar tanto el botón 2D como el diente 3D; mostrar una ficha breve con ubicación y hallazgos existentes. La terminología clínica detallada puede estar detrás de “Ver detalle”.
5. Añadir una leyenda de FDI plegable de una línea: primer dígito = cuadrante/dentición; segundo dígito = posición desde el centro. No desplegar tecnicismos hasta que el usuario los solicite.
6. En celular, permitir cambiar entre pestañas o paneles “Boca 3D” y “Dientes”, manteniendo visible la pieza seleccionada. Evitar que el odontograma desborde el viewport sin señal o control de desplazamiento.
7. La dentición temporal debe cambiar tanto el odontograma como la anatomía del modelo. Si no hay un modelo temporal compatible, decirlo en la UI y no simular dientes infantiles con el modelo permanente.

## Dirección visual para la próxima versión

- Apariencia limpia, clínica y realista: geometría anatómica con proporciones claras, materiales sobrios y encía/hueso diferenciables. Evitar que parezca un juguete o una boca caricaturesca.
- Vista inicial frontal y quieta. Controles simples siempre visibles: **Vista completa**, **Raíces**, **Hueso**, **Vasos** y **Girar**. Activar capas de forma independiente o con una jerarquía clara; no encender todo a la vez.
- Cuando se seleccione una pieza: destacar la corona y las raíces, atenuar el resto sin ocultar referencias espaciales, y mostrar una etiqueta anclada o conectada visualmente a esa pieza.
- Si la cámara se mueve libremente, conservar una acción para volver a la vista completa. Ofrecer presets sencillos: frente, lado derecho, lado izquierdo y vista de raíces.
- El color ayuda a distinguir estructuras, pero debe acompañarse de etiquetas/iconos y contraste accesible. No codificar diagnósticos solo por color.
- Respetar `prefers-reduced-motion`; desactivar rotación automática si está activo.
- Mantener el componente cargado bajo demanda en cliente, optimizar el peso inicial y tener una alternativa clara si WebGL/modelo no carga.

## Requisitos para elegir el siguiente modelo 3D

Antes de integrar otro asset:

- Verificar que el modelo contiene explícitamente dientes con raíces y las estructuras vasculares requeridas. Confirmar nombres de meshes y jerarquía, no basarse solo en la imagen promocional.
- Confirmar que vasos, nervios, huesos, encía y dientes puedan seleccionarse o mostrarse por capas. Si vienen como un mesh único, comprobar que se pueda separar sin alterar su anatomía.
- Revisar licencia del código y de cada modelo por separado, permitiendo el uso previsto por el producto. Registrar autoría, fuente, licencia, modificaciones, fecha y hash en el repositorio.
- Comprobar que la licencia permite redistribuir el GLB dentro de una aplicación de clínica. CC BY-SA requiere atribución y compartir adaptaciones del modelo bajo la misma licencia; CC BY-NC no permite uso comercial. No asumir que “open source” significa cualquier uso.
- Preferir un modelo educativo/documentado cuyo nivel de fidelidad y limitaciones sean explícitos. Hacer revisar la anatomía por un profesional dental antes de comunicarla como referencia clínica.
- Si no se encuentra un modelo completo con una licencia adecuada, lanzar una primera versión por capas con la anatomía que sí tiene fuente verificable; dejar arterias como ausentes y no dibujarlas de forma decorativa o inventada.

## Recurso actualmente integrado y licencias

El GLB local procede de [OrganUI Teeth](https://github.com/organui/teeth-3d). El proyecto declara una selección de 33 mallas de BodyParts3D / Anatomography, incluidas 28 piezas permanentes y estructuras de boca/maxilares. El código de la app fuente usa MIT; los datos/modelo anatómico tienen licencia **CC BY-SA 2.1 Japan**, por separado. La atribución completa está en `public/models/ATTRIBUTION.md` y los detalles de mallas/hash en `public/models/manifest.json`.

El repositorio de [3Dentes](https://github.com/NateSaindon/3Dentes) es otra referencia de atlas interactivo con raíces y estructuras internas, pero su anatomía está bajo **CC BY-NC 4.0**. No copiar ese GLB a un producto comercial sin obtener permiso compatible; su código MIT no cambia la licencia de los datos anatómicos.

## Búsqueda ampliada: mejor base gratuita encontrada

La candidata más completa para investigar primero es [OMFAtlas](https://github.com/choxos/OMFAtlas), un atlas interactivo dedicado a anatomía oral y maxilofacial. Su descripción reporta 643 mallas BodyParts3D y 77 estructuras orales esquemáticas que incluyen nervios, vasos, glándulas, senos y articulación temporomandibular. El atlas también documenta vistas por capas para esmalte, dentina, pulpa/canales radiculares, cemento, ligamento periodontal, hueso alveolar y encía. Es una base de investigación mejor alineada con esta necesidad que el GLB pequeño actual, aunque no debe tratarse como una única descarga con una licencia única.

OMFAtlas documenta explícitamente estas diferencias entre los modelos dentales publicados:

| Recurso reportado | Qué aporta | Licencia reportada | Decisión inicial |
| --- | --- | --- | --- |
| Modelo sintético de mandíbula inferior de Díaz y molar inmaduro de Kang | Dientes, raíces, hueso alveolar y ligamento periodontal | CC BY 4.0 | Candidato preferido para una demo comercial, después de revisar atribuciones y archivos fuente |
| Open-Full-Jaw | Dos maxilares derivados de un paciente | CC BY-NC-SA 4.0 | No usar en el producto comercial sin permiso específico |
| ToothFairy3, caso F_026 | Escaneo dental de una persona, boca completa | CC BY-SA 4.0 | Puede permitir uso comercial con atribución y ShareAlike; evaluar privacidad, contexto de paciente y adecuación antes de integrar |

El código MIT de OMFAtlas no cambia las licencias de los modelos. Su repo también indica que la vasculatura oral/maxilofacial añadida es **esquemática**; puede servir para explicar recorridos anatómicos, pero la UI debe etiquetarla como esquemática y no hacerla pasar por una medición individual. La geometría dental, el cráneo, los vasos y cada conjunto publicado deben seguir su atribución y licencia propia. Verificar los archivos concretos y su `ATTRIBUTION.md` antes de copiar cualquier asset.

Otra ruta gratuita es obtener solo las mallas necesarias de [BodyParts3D 4.3 verificado](https://github.com/olivercase/body_parts_3d_api): su manifiesto incluye más de 3.000 mallas FMA etiquetadas, entre ellas huesos, vasos y nervios, bajo CC BY-SA 2.1 Japan. Se pueden ensamblar las estructuras dentales en una escena propia, pero el repositorio no es por sí solo una boca educativa ya montada y la licencia ShareAlike debe respetarse en las adaptaciones de esos modelos. Es más trabajo de integración y validación que usar OMFAtlas como punto de partida.

[3Dentes](https://github.com/NateSaindon/3Dentes) parece el candidato con la segmentación dental más detallada para raíces, pulpa, canales y nervios, derivada de un CBCT. Sin embargo, su licencia anatómica es **CC BY-NC 4.0** y su README indica que no incluye arterias ni venas. Puede servir para estudiar interacciones y experiencia de navegación, no para incorporar sus datos anatómicos a una app comercial sin autorización.

**Recomendación para Claude:** inspeccionar OMFAtlas primero como referencia funcional y de composición, y probar una combinación selectiva de la mandíbula sintética CC BY 4.0 con sus capas de vasos esquemáticos debidamente atribuidas. No incorporar datos NC. Comprobar en el checkout qué assets son realmente redistribuibles, cómo están agrupados y si se pueden exportar como GLB local modular. Si falta detalle dental suficiente o no se pueden separar las capas, pasar a una escena propia ensamblada con las mallas verificadas de BodyParts3D. No copiar el bundle completo ni inferir que todo el repo comparte MIT.

Fuentes consultadas:

- [OMFAtlas: repo, capas anatómicas y panorama de licencias](https://github.com/choxos/OMFAtlas)
- [OMFAtlas: atribución de los modelos dentales](https://github.com/choxos/OMFAtlas/blob/main/public/models/dental/ATTRIBUTION.md)
- [BodyParts3D 4.3: manifiesto de mallas y licencia](https://github.com/olivercase/body_parts_3d_api)
- [3Dentes: anatomía, capacidades y licencia CC BY-NC](https://github.com/NateSaindon/3Dentes)
- [Modelos dentales Dundee CC BY](https://github.com/sameralseedbth-Dental/dental-3d-models)

## Skills y guías recomendadas para continuar

En la iteración anterior se consultó la skill `sites:sites` para la previsualización local. El proyecto es una app Next.js de repositorio, así que esa skill solo aportó la pauta de preview local; no se usó para desplegar ni publicar el producto. También se obedeció el bloque de `AGENTS.md`: consultar la documentación instalada de Next.js 16 antes de modificar sus convenciones.

Skills disponibles que pueden ayudar en la siguiente iteración:

- **`playwright`** — útil para automatizar la comprobación de selección, interacción y tamaños de viewport. Ya existe una preview ficticia en `/preview/dental`; validar el móvil/tablet/escritorio desde ahí y no depender solo de la captura inicial.
- **`supabase:supabase`** — usar si la integración toca hallazgos, piezas, permisos, consultas, RLS o cualquier persistencia. Mantener la autorización en el servidor; la vista 3D solo refleja los datos que ya entrega la app.
- **`visualize:visualize`** — puede ayudar a prototipar una explicación interactiva de FDI/cuadrantes o comparar modos de visualización antes de fijar la UI.
- **`imagegen`** — solo para explorar un moodboard, fondo o póster ilustrativo. No generar con IA arterias, raíces ni piezas que vayan a presentarse como anatomía real.
- **`gsap-core` / `gsap-performance`** — opcionales si se agrega una transición de cámara o resaltado animado. Evitar animación decorativa en controles clínicos; respetar movimiento reducido y priorizar interacción fluida.
- **`skill-creator`** — opcional si se desea convertir esta guía en una skill reutilizable del proyecto, por ejemplo para buscar, licenciar, atribuir y validar modelos anatómicos.

No hay una skill especializada en anatomía dental, Blender o autoría de glTF en el catálogo disponible. Claude debe consultar la documentación oficial de Next.js instalada en `node_modules/next/dist/docs/`, las fuentes de licencia de cada dataset y la documentación oficial de la tecnología de render que elija. La skill `sites:sites` y los nombres anteriores pertenecen al entorno Codex; si Claude no los tiene instalados, seguir el flujo equivalente descrito aquí en vez de asumir que esos comandos existen.

## Límites clínicos y de comunicación

- Poner “modelo anatómico educativo” o equivalente cerca de la vista.
- No sugerir que el modelo representa el escaneo o la boca real de ese paciente.
- No pintar caries, lesiones o patologías genéricas en el modelo anatómico. Mostrar los hallazgos registrados como marcadores claramente etiquetados y sincronizados con la ficha.
- Diferenciar con claridad arterias, venas y nervios solo si el modelo fuente los diferencia y su mapeo está verificado.
- No usar el render para recomendar tratamiento ni sustituir el criterio clínico.
- No enviar datos clínicos a servicios externos. Cargar los assets desde el propio proyecto.

## Criterios de aceptación

- El odontólogo puede elegir un diente desde la vista 3D o el odontograma y ambas vistas reflejan la misma selección.
- La pieza seleccionada se identifica con número FDI y nombre/ubicación en lenguaje claro.
- Un usuario que no conozca FDI puede orientarse con las cuatro etiquetas de cuadrante sin una explicación verbal previa.
- Hay controles claros para ver dientes, raíces, hueso y vasos; cada capa corresponde a geometría real del modelo y se puede volver a la vista completa.
- El modelo no muestra arterias ni raíces cuando el asset no las contiene.
- La experiencia cabe y se puede operar con tacto en celular y tablet, con foco visible y controles accesibles por teclado.
- El modelo y el viewer funcionan en producción con SSR de Next, el GLB se sirve localmente y hay estado de carga/error.
- La licencia y atribución de cada asset están visibles en el producto y documentadas localmente.
- `/preview/dental` usa solo datos ficticios y sirve para revisar el trabajo sin iniciar sesión.

## Estado de validación del trabajo anterior

En la iteración anterior se verificaron 255 tests, `npm run typecheck`, `npm run lint` y un build de producción con `npx next build --webpack`. Turbopack tuvo un fallo de proceso auxiliar en el entorno; Webpack completó el build. Se revisó `/preview/dental` en viewport móvil y escritorio. El servidor se inició en los puertos 3000/3001 durante la sesión; si ya no corre, volver a ejecutar `npm run dev` desde la raíz del proyecto.

## Instrucción sugerida para continuar

> Continúa desde este handoff y revisa el código actual antes de editar. Primero investiga y compara modelos 3D anatómicos que incluyan raíces y vasculatura explícita, verificando meshes, procedencia y licencia para el uso de Alquimia Dental. Después implementa la alternativa compatible más sólida y convierte la selección FDI en una interacción obvia para el odontólogo y comprensible para el paciente, sincronizada entre el modelo y el odontograma. Conserva una preview con datos ficticios, mantén la anatomía clínicamente honesta y documenta licencias. No hagas commit, push ni PR. Ejecuta las verificaciones del proyecto y deja una preview utilizable.
