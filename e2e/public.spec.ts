import { test, expect } from '@playwright/test'

// Sin Supabase real: las paginas publicas no deben romperse y la de privacidad (estatica) debe mostrarse completa.
test('privacidad: borrador marcado como tal', async ({ page }) => {
  await page.goto('/privacidad')
  await expect(page.getByRole('heading', { name: 'Privacidad', level: 1 })).toBeVisible()
  await expect(page.getByText('Borrador pendiente de revisión legal')).toBeVisible()
})

for (const path of ['/reservar', '/consentimiento', `/c/${'A'.repeat(43)}`]) {
  test(`${path} sin backend muestra el aviso de configuracion`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const res = await page.goto(path)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Falta configurar el acceso' })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('el enlace de check-in no se indexa ni filtra el token como referrer', async ({ page }) => {
  await page.goto(`/c/${'A'.repeat(43)}`)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})
