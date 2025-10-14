import { test, expect } from "@playwright/test";

/**
 * Ejemplo de test end-to-end con Playwright
 * Estos tests simulan la interacción real del usuario con la web
 */

test.describe("Página principal", () => {
  test("debe cargar la página correctamente", async ({ page }) => {
    // Navegar a la página principal
    await page.goto("/");

    // Verificar que la página cargó (el título real tiene espacio: "Big Ibai")
    await expect(page).toHaveTitle(/Big\s*Ibai/i);
  });

  test("debe tener el logo visible", async ({ page }) => {
    await page.goto("/");

    // Buscar el logo principal (alt="bigibai logo")
    const logo = page.locator('img[alt="bigibai logo"]').first();

    // Verificar que está visible
    await expect(logo).toBeVisible();
  });

  test("debe poder navegar por la página", async ({ page }) => {
    await page.goto("/");

    // Ejemplo: hacer clic en un enlace (ajusta el selector)
    // await page.click('a[href="/sorteos"]');

    // Verificar que navegó correctamente
    // await expect(page).toHaveURL(/.*sorteos/);
  });
});

test.describe("Responsividad", () => {
  test("debe verse bien en mobile", async ({ page }) => {
    // Configurar viewport móvil
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Verificar que elementos clave están visibles
    await expect(page).toHaveTitle(/Big\s*Ibai/i);
  });
});

test.describe("Formularios", () => {
  test.skip("ejemplo de test de formulario", async ({ page }) => {
    // Usar .skip para tests que aún no están implementados
    await page.goto("/");

    // Llenar formulario
    await page.fill('input[name="email"]', "test@example.com");
    await page.click('button[type="submit"]');

    // Verificar resultado
    await expect(page.locator(".success-message")).toBeVisible();
  });
});
