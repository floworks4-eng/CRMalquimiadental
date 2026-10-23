import { test, expect } from '@playwright/test'

// Sin Supabase real: cubre lo que se decide en el servidor sin sesion (redirecciones, validacion, enlaces invalidos).
test.describe('acceso sin sesion', () => {
  for (const path of ['/cuenta', '/mfa', '/auditoria']) {
    test(`${path} manda a /login`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible()
    })
  }

  test('el formulario valida antes de enviar', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.getByText('Escribe un correo válido.')).toBeVisible()
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible()
  })

  test('un enlace de invitacion mal formado no revela nada', async ({ page }) => {
    await page.goto('/invitacion/token-malo')
    await expect(page.getByRole('heading', { name: 'Enlace no disponible' })).toBeVisible()
  })

  test('las paginas de acceso no se indexan', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('/api/auth/callback sin codigo vuelve a /login con aviso', async ({ page }) => {
    await page.goto('/api/auth/callback?next=https://evil.example')
    await expect(page).toHaveURL(/\/login\?error=link$/)
    await expect(page.getByText('Ese enlace ya no es válido')).toBeVisible()
  })

  test('la demo sigue funcionando en paralelo', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /con qué rol entras/i })).toBeVisible()
  })
})
