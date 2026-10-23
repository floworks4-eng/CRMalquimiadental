import { test, expect } from '@playwright/test'

test('la entrada carga sin errores de consola', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /con qué rol entras/i })).toBeVisible()
  expect(errors).toEqual([])
  // TODO(F1-017): al reemplazar data.ts, aserción obligatoria (regla 3 del brief):
  // localStorage, sessionStorage e IndexedDB vacíos tras el flujo.
})

test('/api/health responde ok sin datos sensibles', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBe(true)
  expect(await res.json()).toEqual({ status: 'ok', version: expect.any(String) })
})
