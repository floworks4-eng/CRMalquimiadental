/** Para busquedas: sin acentos, minusculas, espacios colapsados. */
export const normalizeName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Deja solo letras, numeros, espacio y +: seguro para armar filtros de PostgREST sin escapar comas ni parentesis. */
export const searchTerm = (s: string) => normalizeName(s).replace(/[^\p{L}\p{N} +]/gu, '').slice(0, 60)
