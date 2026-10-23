# Alquimia Dental · CRM/ERP clínico

> **Estado:** esta rama es la **versión real en construcción** (Fase 1, ver `docs/fase1-brief.md`). Requiere Supabase
> (`.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`; ver `.env.example`).
> Ya son reales: acceso con MFA, pacientes, agenda y recepción. El resto de pantallas (inicio, consulta, caja, inventario…)
> siguen siendo la demo con datos ficticios y se reemplazan en los próximos sprints. La demo comercial completa está en la rama `demo` (tag `demo-v1`).

Demo navegable **solo front-end** del sistema que Lumen Labs propone a Alquimia Dental (San Miguel, La Paz).
Todos los datos de la demo son ficticios. Investigación y supuestos: [`docs/clinica.md`](docs/clinica.md).

## Correr

```bash
npm install
npm run dev
```

Abrir http://localhost:3000. No necesita variables de entorno.
Verificar: `npm run typecheck` y `npm run build`.

## Desplegar en Vercel

```bash
npx vercel
```

O importar la carpeta en vercel.com → framework Next.js (detectado solo) → Deploy. Sin configuración extra.

## Cómo mostrarla (5 min)

En la pantalla de entrada, **DEMO GUIADA · 5 MIN** reinicia los datos, entra como Administrador y muestra una tarjeta con «Siguiente»:

1. **WhatsApp** → «Reproducir»: una paciente llega desde el anuncio, el asistente agenda y la cita aparece en la Agenda con origen WhatsApp.
2. **Check-in QR** → en el celular simulado (a la derecha) se llena la anamnesis → «En sala de espera» + alerta a la doctora (campana).
3. **Inicio** → INICIAR ATENCIÓN MÉDICA → odontograma 3D: marcar una caries y una corona; el plan se arma solo.
4. **Finalizar atención** → baja el inventario, entra el cobro a caja, la cita queda atendida.
5. **Analítica** → recorrido completo de la paciente: anuncio → WhatsApp → cita → atención → cobro.

Roles: Administrador (todo), Odontólogo (solo su agenda y pacientes), Recepción (sin datos clínicos). Se cambia desde la entrada o el avatar.

## Qué es simulado

- Sin backend: el estado vive en memoria + `localStorage` (por navegador). Las pestañas del mismo navegador se sincronizan (por eso el check-in en el celular simulado actualiza la recepción).
- WhatsApp, recordatorios, Meta/TikTok, OCR y pagos son simulados. No se envía nada.
- Escanear el QR con un celular real abre el formulario, pero ese celular no comparte datos con la laptop (sin backend).
- Precios, horarios, cantidades de insumos y cifras de campañas son `[ejemplo]`.

## Reiniciar la demo

Botón **Reiniciar demo** (barra lateral o «Más» en celular). Además, los datos se regeneran solos cada día.

## Estructura

- `src/lib/data.ts` — tipos, store y todas las acciones (única capa de datos; se reemplaza por Supabase sin tocar pantallas).
- `src/lib/seed.ts` — datos de ejemplo. `src/lib/teeth.ts` — numeración FDI.
- `src/components/odontogram3d.tsx` — odontograma 3D (three + R3F, carga diferida); `odontogram.tsx` — interruptor 2D/3D y respaldo SVG si no hay WebGL.
- `src/app/(app)/*` — pantallas internas. `src/app/check-in`, `src/app/agendar-cita` — páginas públicas.

Demo preparada por Lumen Labs.
