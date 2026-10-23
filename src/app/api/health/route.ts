// Sin datos sensibles. Sprint 1 agrega el estado de la base de datos (F1-007).
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok', version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev' }, { headers: { 'Cache-Control': 'no-store' } })
}
