import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { GET, HEAD } from './route'
import { DENTAL_MODEL_FILE, DENTAL_MODEL_HASH } from '@/lib/dental-model'

const context = { params: Promise.resolve({ file: DENTAL_MODEL_FILE }) }
const source = readFileSync('public/models/teeth.glb')
const request = (headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`http://localhost/models/${DENTAL_MODEL_FILE}`, { headers, method })

describe('Modelo 3D comprimido sin pérdida y versionado', () => {
  it.each([
    ['br, gzip', 'br'],
    ['gzip, br;q=0', 'gzip'],
    ['gzip;q=0, br;q=0', null],
    ['', null],
    ['br;q=0.5,gzip;q=1', 'gzip'],
    ['identity;q=1,br;q=0.5', null],
  ])('negocia %s y conserva todos los bytes de la geometría (%s)', async (accept, encoding) => {
    const response = await GET(request({ 'accept-encoding': accept }), context)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-encoding')).toBe(encoding)
    const body = Buffer.from(await response.arrayBuffer())
    const decoded = encoding === 'br' ? brotliDecompressSync(body) : encoding === 'gzip' ? gunzipSync(body) : body
    expect(decoded.equals(source)).toBe(true)
    expect(createHash('sha256').update(decoded).digest('hex')).toBe(DENTAL_MODEL_HASH)
    expect(response.headers.get('content-length')).toBe(String(body.length))
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('vary')).toBe('Accept-Encoding')
  })

  it('permite revalidación sin reenviar el modelo y HEAD sin cuerpo', async () => {
    const first = await GET(request({ 'accept-encoding': 'br' }), context)
    const cached = await GET(request({ 'accept-encoding': 'br', 'if-none-match': first.headers.get('etag')! }), context)
    expect(cached.status).toBe(304)
    expect((await cached.arrayBuffer()).byteLength).toBe(0)
    const head = await HEAD(request({ 'accept-encoding': 'br' }, 'HEAD'), context)
    expect(head.headers.get('content-length')).toBe(first.headers.get('content-length'))
    expect((await head.arrayBuffer()).byteLength).toBe(0)
  })

  it('rechaza versiones inexistentes y codificaciones prohibidas', async () => {
    expect((await GET(request(), { params: Promise.resolve({ file: 'another.glb' }) })).status).toBe(404)
    expect((await GET(request({ 'accept-encoding': '*;q=0' }), context)).status).toBe(406)
  })
})
