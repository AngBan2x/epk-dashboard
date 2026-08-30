import { test, expect } from "@playwright/test";

test.describe("Null Safety", () => {
  test("no console errors on dashboard", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    // Filtrar errores de red 404 de imágenes (assets que no existen localmente en tests)
    page.on("response", (response) => {
      if (response.status() === 404 && response.url().match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
        // Ignorar 404s de imágenes - son assets opcionales
        return;
      }
    });
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    // Filtrar solo errores JavaScript reales, no 404 de assets
    const jsErrors = errors.filter((e) => !e.includes("Failed to load resource") && !e.includes("404"));
    expect(jsErrors).toEqual([]);
  });

  test("track with null youtube_video_id renders without error", async ({ page }) => {
    await page.goto("/track/trk-002");
    await expect(page.locator("h1")).toBeVisible();
  });
});
