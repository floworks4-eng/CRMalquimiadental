import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DENTAL_MODEL_FILE, DENTAL_MODEL_HASH } from '@/lib/dental-model'

export const runtime = 'nodejs'

type Encoding = 'br' | 'gzip' | 'identity'
const files: Record<Encoding, string> = { br: 'teeth.glb.br', gzip: 'teeth.glb.gz', identity: 'teeth.glb' }
// Immutable, public anatomy only; never stores patient data or session responses.
const buffers = new Map<Encoding, Promise<Buffer>>()

function encodingFor(header: string | null): Encoding | undefined {
  if (!header) return 'identity'
  const weights = new Map(
    header
      .toLowerCase()
      .split(',')
      .map((part) => {
        const [name, ...params] = part.trim().split(';')
        const q = params.map((value) => value.trim()).find((value) => value.startsWith('q='))
        const weight = q ? Number(q.slice(2)) : 1
        return [name, Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0] as const
      }),
  )
  const weight = (encoding: Encoding) =>
    weights.get(encoding) ?? (encoding === 'identity' ? (weights.get('*') === 0 ? 0 : 1) : (weights.get('*') ?? 0))
  // Prefer compression when supported; retain identity for older clients.
  return (['br', 'gzip', 'identity'] as const).filter((value) => weight(value) > 0).sort((a, b) => weight(b) - weight(a))[0]
}

async function serve(request: Request, { params }: { params: Promise<{ file: string }> }) {
  if ((await params).file !== DENTAL_MODEL_FILE) return new Response(null, { status: 404 })
  const encoding = encodingFor(request.headers.get('accept-encoding'))
  if (!encoding) return new Response(null, { status: 406, headers: { Vary: 'Accept-Encoding' } })
  const etag = `"${DENTAL_MODEL_HASH}-${encoding}"`
  const headers = new Headers({
    'Content-Type': 'model/gltf-binary',
    'Cache-Control': 'public, max-age=31536000, immutable',
    Vary: 'Accept-Encoding',
    ETag: etag,
  })
  if (encoding !== 'identity') headers.set('Content-Encoding', encoding)
  const matches = request.headers
    .get('if-none-match')
    ?.split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
  if (matches?.includes(etag) || matches?.includes('*')) return new Response(null, { status: 304, headers })
  if (!buffers.has(encoding)) {
    buffers.set(
      encoding,
      readFile(join(process.cwd(), 'public/models', files[encoding])).catch((error) => {
        buffers.delete(encoding)
        throw error
      }),
    )
  }
  const bytes = await buffers.get(encoding)!
  headers.set('Content-Length', String(bytes.length))
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { headers })
}

export const GET = serve
export const HEAD = serve
