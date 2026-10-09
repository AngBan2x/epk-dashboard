import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("loads dashboard page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("PressPlay");
  });

  // Antes este test pedía que `/` redirigiera a `/dashboard`. Dejó de ser verdad
  // cuando `/` se convirtió en la landing pública, y fallaba con
  //   Expected: ".../dashboard"  Received: ".../"
  // que es el aspecto correcto de un redirect que ya no ocurre: `/` responde 200
  // y enseña la landing ("Donde la música se presenta"). Comprobar eso es más
  // útil que comprobar una redirección, porque además ata la landing a su texto.
  test("home is the public landing, not a redirect", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("h1")).toContainText("música se presenta", { timeout: 15_000 });
  });
});
