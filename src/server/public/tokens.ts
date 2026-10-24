import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/** 32 bytes aleatorios en base64url (43 caracteres). En la base solo vive su SHA-256. */
export const newToken = () => randomBytes(32).toString('base64url')
/** bytea en el formato que espera PostgREST. */
export const tokenHash = (token: string) => '\\x' + createHash('sha256').update(token).digest('hex')
