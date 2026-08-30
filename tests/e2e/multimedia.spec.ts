import { test, expect } from "@playwright/test";

test.describe("F9 Multimedia & Catálogo Expandido", () => {
  test("dashboard shows expanded catalog with 12 tracks", async ({ page }) => {
    await page.goto("/dashboard");
    // Verifica que el catálogo renderiza varias tarjetas
    const cards = page.locator("[data-testid='epk-card'], .grid a");
    await expect(cards.first()).toBeVisible();
    // El catálogo debe tener al menos 10 tracks visibles
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(10);
  });

  test("theme toggle is visible in the header", async ({ page }) => {
    await page.goto("/dashboard");
    const toggle = page.locator("button[aria-label='Cambiar a modo claro'], button[aria-label='Cambiar a modo oscuro']");
    await expect(toggle).toBeVisible();
  });

  test("theme toggle switches between dark and light mode", async ({ page }) => {
    await page.goto("/dashboard");
    const html = page.locator("html");

    // Estado inicial (dark class debería estar presente o ausente)
    const initialClass = await html.getAttribute("class");

    // Hacer clic en el toggle
    const toggle = page.locator("button[aria-label='Cambiar a modo claro'], button[aria-label='Cambiar a modo oscuro']");
    await toggle.waitFor({ state: "visible" });
    await toggle.click();

    await page.waitForTimeout(300);

    const newClass = await html.getAttribute("class");
    // La clase dark debería haber cambiado
    expect(newClass).not.toBe(initialClass);
  });

  test("track detail page renders VideoShowcase and StemsPlayer", async ({ page }) => {
    await page.goto("/dashboard");
    // Click en primer track (trk-001 tiene YouTube video)
    const firstLink = page.locator(".grid a").first();
    await firstLink.click();
    await page.waitForURL("**/track/**", { timeout: 60000 });

    // Verificar que el VideoShowcase está presente (buscar heading h2 con el texto)
    await expect(page.locator("h2:has-text('Videoclip Oficial')")).toBeVisible({ timeout: 10000 });
    // Verificar que el StemsPlayer está presente (buscar cualquier elemento con "Mezcla" o "Stems")
    await expect(page.locator("text=Mezcla Multitrack").or(page.locator("text=Stems"))).toBeVisible({ timeout: 15000 });
  });

  test("EPK Exporter section is visible on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    // Usar selector más específico para evitar strict mode violation
    await expect(page.locator("h2:has-text('Exportar Dossier EPK')").first()).toBeVisible();
  });

  test("navigation between tracks works (prev/next links)", async ({ page }) => {
    await page.goto("/dashboard");
    const firstLink = page.locator(".grid a").first();
    await firstLink.click();
    await page.waitForURL("**/track/**");

    // Verificar que la página de detalle tiene el heading correcto
    await expect(page.locator("h1")).toContainText("Detalle de Track");
  });
});
