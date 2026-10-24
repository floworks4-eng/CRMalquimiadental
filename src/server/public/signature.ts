// La firma dibujada llega como data URL PNG. Se valida antes de tocar Storage: formato real, tamano y dimensiones razonables.
const MAX_BYTES = 150_000
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function decodePngDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!m) return null
  const buf = Buffer.from(m[1], 'base64')
  if (buf.length < 100 || buf.length > MAX_BYTES) return null
  if (!PNG.every((b, i) => buf[i] === b)) return null
  // IHDR: ancho y alto (4 bytes cada uno) en los bytes 16-23.
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  return w > 0 && w <= 2000 && h > 0 && h <= 1000 ? buf : null
}
