import { defineConfig, devices } from '@playwright/test'

// Usa el Chrome instalado (channel) para no descargar navegadores.
const PORT = 3100

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    // Contra el build de produccion: sin recargas por HMR, que hacian intermitentes las pruebas de formularios.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false, // siempre arranca con el entorno de abajo
    env: {
      // Valores de relleno: estas pruebas no llegan a la red. Las de flujo completo (login real) requieren Supabase local.
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-placeholder-anon-key',
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
    },
    timeout: 240_000,
  },
})
