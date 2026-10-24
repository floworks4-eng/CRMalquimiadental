import { test, expect } from '@playwright/test'

// Sin Supabase real: cubre lo que se decide en el servidor sin sesion (redirecciones, validacion, enlaces invalidos).
test.describe('acceso sin sesion', () => {
  const PRIVATE = [
    '/inicio', '/agenda', '/consulta', '/consulta/00000000-0000-4000-8000-000000000201', '/recepcion', '/pacientes',
    '/pacientes/00000000-0000-4000-8000-000000000101', '/caja', '/inventario', '/configuracion', '/cuenta',
    // Lo que antes era del paciente ya no existe: sin sesion tampoco se llega.
    '/reservar', '/c/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '/vista-previa',
  ]
  for (const path of PRIVATE) {
    test(`${path} manda a /login`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible()
    })
  }

  test('el formulario valida antes de enviar', async ({ page }) => {
    await page.goto('/login')
    // En desarrollo la pagina puede tardar en hidratar; un clic anterior seria un envio nativo del formulario.
    await expect(async () => {
      await page.getByRole('button', { name: 'Ingresar' }).click()
      await expect(page.getByText('Escribe un correo válido.')).toBeVisible({ timeout: 1500 })
    }).toPass({ timeout: 20_000 })
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible()
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

  test('el primer arranque no se abre si no se puede comprobar que la base esta vacia', async ({ page }) => {
    await page.goto('/configuracion-inicial')
    await expect(page).toHaveURL(/\/login$/)
  })
})
