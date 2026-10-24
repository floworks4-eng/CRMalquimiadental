import { test, expect } from '@playwright/test'

test('la entrada lleva al login sin errores de consola', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible()
  expect(errors).toEqual([])
  // Regla 1 del brief: ningún dato clínico en el navegador.
  const stored = await page.evaluate(() => localStorage.length + sessionStorage.length)
  expect(stored).toBe(0)
})

test('/api/health responde ok sin datos sensibles', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBe(true)
  expect(await res.json()).toEqual({ status: 'ok', version: expect.any(String) })
})

test('cabeceras de seguridad', async ({ request }) => {
  const h = (await request.get('/login')).headers()
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['content-security-policy']).toContain("connect-src 'self'")
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['x-robots-tag']).toContain('noindex')
  expect(h['x-powered-by']).toBeUndefined()
})
