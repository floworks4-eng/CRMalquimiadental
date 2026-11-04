# Rendimiento del sistema — 3 de noviembre de 2026

La optimización conserva agenda (día/semana/mes/lista), pacientes, historias, archivos, importaciones, permisos, configuración, caja, inventario, marcación dental y las capas 3D. La carga de funciones secundarias se difiere hasta que se usan; no se eliminan registros ni se recortan resultados para mejorar cifras.

## Comparación reproducible de JavaScript

Se reconstruyó `e6c14f2` y la versión optimizada en el mismo directorio temporal y con las mismas dependencias, Node 26.3.1, Next 16.4.3 y webpack. Ambas compilaciones de comparación excluyen `.env.local`. El reporte suma los chunks asociados a las referencias cliente de entrada de cada ruta y el runtime común, comprimidos individualmente con gzip. No equivale a medir el tiempo de carga en internet ni incluye los chunks asincrónicos antes de abrirlos.

| Ruta | Antes (gzip, bytes) | Después (gzip, bytes) | Reducción |
|---|---:|---:|---:|
| Pacientes | 197 926 | 155 278 | 21,5 % |
| Ficha del paciente | 223 642 | 176 877 | 20,9 % |
| Configuración | 168 089 | 152 399 | 9,3 % |
| Agenda | 169 221 | 161 288 | 4,7 % |
| Consulta individual | 176 840 | 170 963 | 3,3 % |
| Inicio | 156 256 | 150 372 | 3,8 % |
| Acceso | 195 765 | 189 881 | 3,0 % |

Los JSON completos están en [performance/before.json](performance/before.json) y [performance/after.json](performance/after.json). Para medir una nueva compilación:

```sh
npm run build -- --webpack
npm run performance:report -- /tmp/alquimia-performance.json
```

## Descargas verificadas en Chromium y producción local

- Fuentes de la preview en una carga sin caché: **4 archivos / 171 096 bytes → 2 archivos / 71 348 bytes**, una reducción del **58,3 %**. Inter y Fraunces 500 italic mantienen sus usos actuales; se retiraron JetBrains y Fraunces normal, que el CSS no utilizaba.
- El mapa inicial no solicita el motor ni el modelo 3D. La interfaz 3D también se importa al abrirla y conserva su estado al regresar al mapa.
- El modelo baja de **2 118 424 bytes a 1 449 461 con Brotli** (31,6 %) o 1 637 120 con gzip. La descompresión conserva exactamente el SHA-256 del original, todos los materiales, vértices y capas.
- URL del modelo con versión de contenido; `Cache-Control: public, max-age=31536000, immutable`, `Vary: Accept-Encoding`, ETag y HEAD/304. En la segunda apertura del modo paciente, Chromium registró **0 bytes transferidos** para el modelo.
- Las variantes comprimidas están incluidas en el trazado de archivos del despliegue. `npm run assets:dental` verifica procedencia/hash y las genera; `prebuild` lo ejecuta automáticamente.

La caché pública anterior corresponde exclusivamente al atlas educativo. No se aplica a sesiones, fichas clínicas, archivos de pacientes ni cobros.

## Esperas de servidor eliminadas

| Lectura | Antes | Después |
|---|---|---|
| Datos de sesión | Perfil y membresía, después clínica | Perfil y membresía con clínica embebida, en paralelo |
| Dashboard admin | 4 etapas: agenda, caja, stock, puesta en marcha | Los cuatro bloques en paralelo, con el mismo total de consultas |
| Consulta | Esperar cita antes de encuentro y catálogo | Encuentro y catálogo empiezan junto con la cita |
| Ficha de contacto | Datos y después citas | Ambas lecturas en paralelo; se conserva `null` para fichas no visibles |
| Historial y adjuntos | Una firma HTTP por archivo | Lotes de 100, conservando orden, metadatos, permisos y TTL |
| Configuración | 11 lecturas en cada pestaña | Clínica 1; horarios 3; tratamientos 4; equipo 4; importar 0 |

Los conteos excluyen autenticación y reintentos. Con 101 adjuntos se realizan dos solicitudes de firma, en lugar de 101. Los errores por archivo siguen produciendo `url: null` sin afectar los demás archivos.

La cabecera y la ficha usan `Suspense`: las notificaciones y el historial pueden llegar después del contenido principal. La separación clínica por rol sigue en el servidor. `React.cache` deduplica lectores durante un render; no se añadió una caché compartida de pacientes entre usuarios.

El calendario agrupa las citas por día/consultorio una vez por actualización, en lugar de recorrer la lista completa para cada casilla. Los formateadores `Intl` se reutilizan; las conversiones IANA y los formatos de Bolivia se conservan. Las notificaciones mantienen el intervalo de 15 segundos, esperan a que termine una lectura lenta y pausan el trabajo al ocultar la pestaña.

## Verificación y límites de las cifras

- 367 pruebas correctas: contratos clínicos, permisos, concurrencia, lotes de firmas, pestañas, fechas, formularios, errores y recuperación de la vista dental.
- TypeScript, ESLint y build de producción correctos.
- Navegador: mapa, selección y marcas, capas 3D, modo paciente, descarga comprimida, reutilización de caché y fallback. Las mediciones de red se tomaron en la preview con datos ficticios.
- Supabase real: solo consultas de metadatos para comprobar la relación membresía/clínica y que RLS sigue habilitado; ninguna migración ni escritura de datos reales.
- No se afirma un porcentaje de mejora de latencia total de las pantallas autenticadas: requiere medirlas con una sesión y datos representativos en el despliegue. Los porcentajes anteriores corresponden a bytes o conteos concretos, no a tiempos universales.

Referencias de implementación: guías de Next incluidas con la versión instalada (`lazy-loading`, `server-and-client-boundary`, `output`), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs), [firma múltiple de archivos](https://supabase.com/docs/reference/javascript/storage-from-createsignedurls).
