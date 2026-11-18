# Alquimia Dental

Sistema interno de la clínica: agenda, atención, historia clínica, cobros e inventario. Next.js y React para la aplicación; Supabase para autenticación, PostgreSQL y archivos privados.

## Trabajo diario

- **Recepción:** Agenda. Las citas avanzan de «Por llegar» a «En espera» desde el tablero del día.
- **Odontólogos:** Atención y ficha del paciente. Ven su sala de espera, abren la consulta y registran lo realizado.
- **Historia clínica:** evaluación estructurada, odontograma, sesiones, notas y adjuntos. Las notas internas no se incluyen en la copia del paciente.
- **Caja:** cobros, saldos, movimientos y cierre. Marcar una atención como terminada no significa que esté pagada.
- **Administración:** tratamientos, precios, recetas de insumos, equipo, horarios y reportes.

## Ejecutar el proyecto

Requiere Node.js, npm y un proyecto Supabase configurado.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Completar las variables de `.env.local` con las del entorno correspondiente. No subir claves ni archivos clínicos al repositorio. Las funciones de IA son opcionales y requieren una clave de servidor de OpenAI.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

El build prepara y verifica los archivos comprimidos del modelo dental. Las migraciones se encuentran en `supabase/migrations`; deben revisarse y aplicarse al entorno previsto antes de desplegar código que las utilice. Las pruebas de base de datos usan PGlite y datos ficticios.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/app` | Pantallas y rutas HTTP |
| `src/components` | Interfaz por módulo |
| `src/server` | Autorización, consultas y operaciones |
| `src/lib/domain` | Tipos, validaciones y reglas compartidas |
| `supabase` | Migraciones, datos de desarrollo y pruebas de permisos |
| `public/models` | Modelo dental y atribución de su licencia |
| `scripts` | Preparación de recursos y medición de rendimiento |
| `e2e` | Pruebas de navegador |
| `docs` | Operación, arquitectura y decisiones |
| `ads` y `assets/ads` | Anuncios conservados para su organización posterior |

## Documentación

- [Uso diario](docs/uso-diario.md)
- [Operación y despliegue](docs/operacion.md)
- [Arquitectura](docs/arquitectura.md)
- [Seguridad y permisos](docs/seguridad.md)
- [Historial por sesiones](docs/historial-por-sesiones.md)
- [Referencias de historia clínica](docs/referencias-historia-clinica.md)

`docs/archivo` conserva documentos de contexto y revisiones anteriores. Describen el estado de su fecha y no sustituyen la documentación actual.
