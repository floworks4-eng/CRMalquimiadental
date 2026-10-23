# Seguridad (Fase 1)

Reglas no negociables del brief ([`fase1-brief.md`](fase1-brief.md), sección 0.1 y 6). Este archivo se completa en el Sprint 1.

1. Ningún dato clínico en el navegador: sin `localStorage`, `sessionStorage` ni IndexedDB, ni datos personales en URLs.
2. La autorización vive en el servidor (RLS + Server Actions). `can()` en React es solo cosmético.
3. `SUPABASE_SERVICE_ROLE_KEY` nunca llega al navegador: solo en módulos `server-only`.
4. Toda escritura clínica, financiera o de stock escribe `audit_log` en la misma transacción.
5. Cada persona tiene su usuario con MFA; no hay cuentas compartidas ni login por rol.
6. Secretos solo en Vercel/Supabase. `.env.example` lista nombres sin valores.

## Pendiente de decisión legal

Los textos legales (consentimiento, aviso de privacidad, retención) y las referencias normativas del brief no están verificadas
por un abogado boliviano. No usar en producción hasta esa revisión.
