import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('@/server/env', () => ({ hasSupabaseEnv: () => true }))
vi.mock('@/server/supabase/proxy', () => ({ updateSession: mocks.update }))
import { proxy } from './proxy'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Proxy sin trabajo de sesión para recursos públicos', () => {
  it.each(['/preview/dental', '/models/ATTRIBUTION.md', '/models/manifest.json', '/api/health'])(
    'no inicia autenticación innecesaria en %s',
    async (path) => {
      const response = await proxy(new NextRequest(`http://localhost${path}`))
      expect(response.status).toBe(200)
      expect(mocks.update).not.toHaveBeenCalled()
    },
  )

  it('conserva protección, cookies y cabeceras privadas al redirigir una sesión vencida', async () => {
    const refreshed = NextResponse.next()
    refreshed.cookies.set('session', 'refreshed', { httpOnly: true })
    refreshed.headers.set('cache-control', 'private, no-store')
    refreshed.headers.set('expires', '0')
    mocks.update.mockResolvedValue({ claims: null, response: () => refreshed })
    const response = await proxy(new NextRequest('http://localhost/pacientes'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/login')
    expect(response.cookies.get('session')?.value).toBe('refreshed')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('expires')).toBe('0')
  })
})
