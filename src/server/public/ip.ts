import 'server-only'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'

/** Huella de la IP (SHA-256 con pepper): sirve para limitar abuso y auditar sin guardar la IP en claro. */
export async function ipHash() {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
  const pepper = process.env.IP_HASH_PEPPER
  if (!pepper && process.env.NODE_ENV === 'production') throw new Error('Falta IP_HASH_PEPPER')
  return createHash('sha256').update(`${pepper ?? 'dev-pepper'}:${ip}`).digest('hex')
}

export async function userAgent() {
  return ((await headers()).get('user-agent') ?? '').slice(0, 300)
}
