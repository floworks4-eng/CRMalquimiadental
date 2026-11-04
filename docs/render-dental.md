# Mapa dental y explicación 3D

## Uso en la clínica

1. Elegir **Adultos** o **Infantiles** y tocar el diente en una de las cuatro zonas. Las zonas siempre se refieren al lado del paciente.
2. Al tocar el diente en el mapa o en 3D, se abre un selector visual. Elegir **Caries**, **Fractura**, **Ausente** u otro hallazgo para guardarlo. Cada opción muestra un dibujo de la marca. Las caras del diente son opcionales dentro de ese selector.
3. Para explicar, abrir **Boca 3D** o **Mostrar al paciente**. Las vistas preparadas son **Dentadura**, **Ver raíces** y **Nervios y vasos**. No hace falta configurar capas.
4. **Empezar de nuevo** vuelve a la vista frontal, detiene el giro y quita la selección. El modo paciente se cierra con **Volver a la ficha** o Escape.

El mapa empieza con figuras de dientes, con raíces arriba o abajo según la arcada. Cada familia tiene una silueta distinta y los hallazgos se reconocen por símbolos y colores. El nombre completo aparece al tocar o pasar sobre la figura. En escritorio amplio se distribuyen 16 piezas por arcada; en celular se agrupan en cuatro zonas compactas. Los nombres comunes aparecen antes de la numeración FDI en la selección. La selección del mapa, del modelo y del modo paciente es la misma. Cambiar de dentición limpia la selección anterior.

## Integración

`src/components/dental-workspace.tsx` es la entrada compartida que ya usan consulta, historial clínico y preview. Recibe los registros del sistema; no consulta la base de datos ni guarda información por su cuenta.

```tsx
<DentalWorkspace
  marks={marks}
  selected={selected}
  onSelect={handleSelectTooth}
  dentition={dentition}
  onDentitionChange={setDentition}
  onMark={saveDentalFinding}
  onClear={clearDentalFinding}
  surfaces={surfaces}
  onSurfacesChange={setSurfaces}
/>
```

- `onSelect` acepta un número FDI o `undefined` para quitar la selección. El padre puede limpiar las superficies clínicas al cambiar de diente.
- `marks` mantiene el contrato `Record<number, { condition: ToothCondition; today: boolean }>`.
- `onMark(tooth, condition)` y `onClear(tooth)` son opcionales: devuelven `undefined` al guardar o un texto de error. Sin `onMark`, el componente permite consultar y seleccionar, sin editar.
- `surfaces` y `onSurfacesChange` son opcionales. Al abrir una pieza en consulta se recuperan las caras ya registradas en la atención para conservarlas al cambiar su hallazgo.
- La marca se refleja de inmediato con `useOptimistic`; si el servidor rechaza la operación, se revierte y el error permanece en el selector. Mientras se guarda, se bloquean nuevos envíos.
- El formulario de consulta conserva `addFinding`, `removeFinding` y la asignación de tratamientos. El historial conserva sus registros de solo lectura.
- La presentación al paciente permite explorar y seleccionar. Los formularios de edición quedan en la ficha de fondo.
- El mapa es la vista inicial en todos los tamaños y la boca 3D se abre al elegir su pestaña. En presentación al paciente, ambas vistas se muestran juntas cuando hay espacio. El layout se adapta incluso a una columna estrecha del sistema.

## Motor y carga

`src/lib/dental-scene.ts` usa las APIs públicas de Three.js, GLTFLoader y OrbitControls. Se retiró `@google/model-viewer` y el acceso a sus símbolos internos.

- Modelo local: `public/models/teeth.glb`, 2 118 424 bytes, con materiales separados para coronas, raíces y capas anatómicas.
- Descarga de producción: URL versionada por hash y negociación Brotli/gzip sin pérdida. Las variantes se generan/verifican con `npm run assets:dental` y se reutilizan desde caché. Detalles y mediciones en [rendimiento.md](rendimiento.md).
- La escena solo se inicia al mostrarse. Renderiza cuando cambia la vista o durante un giro; pausa fuera de pantalla y cuando la pestaña está oculta.
- Selección por raycasting de dientes visibles; encía, hueso y vasos no interceptan el clic. Las piezas registradas como ausentes permanecen ocultas aunque estén seleccionadas.
- Limpieza de eventos, observadores, geometrías, materiales y contexto WebGL al desmontar.
- Zoom con botones, ángulos preparados, giro pausado al inicio y respeto a movimiento reducido.
- Si falla WebGL, la descarga o tarda más de 20 segundos, se ofrece mapa dental y reintento. Los registros clínicos siguen disponibles.

Referencias del motor: [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader), [OrbitControls](https://threejs.org/docs/pages/OrbitControls), [Raycaster](https://threejs.org/docs/pages/Raycaster), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer).

## Cobertura anatómica

El asset es un atlas educativo de BodyParts3D / Anatomography 4.3, no un escaneo del paciente. La procedencia y licencia están en `public/models/manifest.json` y `public/models/ATTRIBUTION.md`.

- Hay 28 piezas permanentes en 3D, con coronas y raíces.
- Las cuatro muelas del juicio y las 20 piezas infantiles están disponibles en el mapa clínico. No se fabricó geometría adicional ni se usaron dientes adultos como anatomía infantil.
- Los vasos proceden del lado derecho del atlas; los nervios son bilaterales. Activar la vista vascular orienta la cámara al lado derecho.
- Los colores muestran registros existentes. No reproducen lesiones, perforaciones, implantes, prótesis ni resultados de tratamiento.
- Los detalles anatómicos describen anatomía de referencia, con variaciones entre pacientes.

## Comprobación

La preview `/preview/dental` permite probar las mismas marcas con datos ficticios: caries, corona, endodoncia, sellante, implante, fractura y pieza ausente. Sus cambios son locales a la página y se reinician al recargar. En consulta, el mismo selector usa las acciones del servidor para guardar en la historia clínica.

Las pruebas cubren orientación y selección del mapa, cambio de dentición sin selecciones antiguas, sincronización del componente compartido, vistas preparadas, actualización de callbacks, limpieza y recuperación de carga. La validación en navegador comprueba selección directa 3D, presentación y Escape, controles anatómicos, tamaños estrechos y alternativa ante fallo del modelo.

Skill utilizada para la revisión visual y funcional: `playwright` (`/Users/leo/.codex/skills/playwright/SKILL.md`).

Las pruebas de integración de consulta comprueban que la marcación envía la pieza, el paciente, la atención y las caras correctas; que un rechazo no anuncia guardado; y que quitar una marca afecta solo a la pieza elegida en la atención actual.
