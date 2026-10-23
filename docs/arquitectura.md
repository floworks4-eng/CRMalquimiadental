# Arquitectura (Fase 1)

Resumen operativo. El detalle y los criterios de aceptación están en [`fase1-brief.md`](fase1-brief.md) (secciones 4, 5 y 8).

## Ramas y entornos

| Rama / tag | Uso |
|---|---|
| `demo-v1` (tag) y `demo` (rama) | Demo comercial congelada: datos ficticios en `localStorage`. Se sigue desplegando desde aquí para ventas |
| `main` | Producción (Fase 1). Protegida: solo por PR con CI verde |
| `staging` | Pruebas y UAT con datos ficticios o anonimizados |
| `feat/F1-xx-*` | Una tarea o grupo de tareas del brief |

Nunca se copian datos de producción a staging sin anonimizar ni se prueba con datos reales en local.

## Capas

- **Servidor primero:** lecturas en Server Components, escrituras en Server Actions o RPC de Postgres.
- **RLS como defensa principal**; las acciones revalidan permiso y reglas.
- **DTOs explícitos** por pantalla y rol. El navegador nunca recibe un registro clínico completo.
- **Una transacción por caso de uso** (check-in, reserva pública, cierre de atención, cierre de caja), idempotente.
- Fechas en UTC (`timestamptz`), visualización en `America/La_Paz`. Dinero en centavos enteros (BOB).

## Estado actual (Sprint 0)

- Código de la demo intacto en `src/`; se reemplaza por vertical en los sprints 1–4.
- `supabase/` inicializado (sin migraciones). `supabase db reset` requiere Docker.
- Calidad: `npm run typecheck`, `lint`, `test` (Vitest), `test:e2e` (Playwright con Chrome instalado), `build`.
