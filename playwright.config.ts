import { defineConfig, devices } from "@playwright/test";

/**
 * Configuración de Playwright para tests end-to-end
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "src/test/e2e",

  // Tiempo máximo para cada test
  timeout: 30 * 1000,

  // Configuración de expect timeout
  expect: {
    timeout: 5000,
  },

  // Ejecutar tests en paralelo
  fullyParallel: true,

  // Fallar el build si dejas test.only en el código
  forbidOnly: !!process.env.CI,

  // Reintentos en CI
  retries: process.env.CI ? 2 : 0,

  // Workers en paralelo
  workers: process.env.CI ? 1 : undefined,

  // Reportero
  reporter: "html",

  // Configuración compartida para todos los proyectos
  use: {
    // URL base para usar en navegación
    baseURL: "http://localhost:4321",

    // Traza en el primer reintento de un test fallido
    trace: "on-first-retry",

    // Screenshot solo cuando falla
    screenshot: "only-on-failure",
  },

  // Configurar proyectos para navegadores principales
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    // Descomentados cuando instales los navegadores con: pnpm exec playwright install
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    // Tests en mobile viewports
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  // Ejecutar servidor de desarrollo antes de los tests
  webServer: {
    command: "pnpm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
