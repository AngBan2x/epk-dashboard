import { test, expect } from "@playwright/test";

/**
 * Las dos rutas de esta lista ya no son las que eran cuando se escribió el spec:
 *
 *   - `/` es la **landing pública**, no una redirección a `/dashboard`. El spec
 *     hacía `pageDef.path === "/" ? "/dashboard" : ...` y por eso el test "home"
 *     fallaba esperando una redirección que no ocurre.
 *   - `/track/<id>` es un **shim de 301** a `/releases/<id>` desde P8. Un single
 *     ES fila de `tracks` y cabecera de release con el mismo id, así que las dos
 *     fichas que se recorren aquí terminan en `/releases/`.
 *
 * Se guarda la ruta "pedida" y la "final": son distintas por diseño, y por eso
 * el `toHaveURL` compara contra la segunda.
 */
const PAGES = [
  { path: "/", final: "/", name: "home" },
  { path: "/dashboard", final: "/dashboard", name: "dashboard" },
  { path: "/login", final: "/login", name: "login" },
  { path: "/register", final: "/register", name: "register" },
  { path: "/artists", final: "/artists", name: "artists" },
  { path: "/track/trk-001", final: "/releases/trk-001", name: "track-detail" },
  { path: "/track/trk-002", final: "/releases/trk-002", name: "track-detail-2" },
];

test.describe("N3: Explore all pages - Light Mode", () => {
  for (const pageDef of PAGES) {
    test(`${pageDef.name} loads correctly`, async ({ page }) => {
      await page.goto(pageDef.path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${pageDef.final}$`));

      // Screenshot
      await page.screenshot({
        path: `screenshots/light/${pageDef.name}.png`,
        fullPage: true,
      });

      // Check headings
      const headings = await page.locator("h1, h2, h3").allTextContents();
      console.log(`[${pageDef.name}] Headings:`, headings.slice(0, 5));

      // Check no JS errors in console
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      console.log(`[${pageDef.name}] Console errors:`, errors.length);
    });
  }
});

test.describe("N3: Explore all pages - Dark Mode", () => {
  for (const pageDef of PAGES) {
    test(`${pageDef.name} dark mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(pageDef.path, {
        waitUntil: "domcontentloaded",
      });

      await page.screenshot({
        path: `screenshots/dark/${pageDef.name}.png`,
        fullPage: true,
      });

      // Check dark mode background
      const bgColor = await page.evaluate(() => {
        return getComputedStyle(document.body).backgroundColor;
      });
      console.log(`[${pageDef.name}] Dark bg:`, bgColor);
    });
  }
});

test.describe("N3: Explore all pages - Mobile", () => {
  for (const pageDef of PAGES) {
    test(`${pageDef.name} mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(pageDef.path, {
        waitUntil: "domcontentloaded",
      });

      await page.screenshot({
        path: `screenshots/mobile/${pageDef.name}.png`,
        fullPage: true,
      });
    });
  }
});

test.describe("N3: DOM Structure & Accessibility", () => {
  test("dashboard has proper heading hierarchy", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    
    // Wait for loading to finish - the dashboard loads data async
    await page.waitForFunction(() => {
      const loadingText = document.querySelector("main")?.textContent;
      return loadingText && !loadingText.includes("Cargando...");
    }, { timeout: 10000 });

    // After loading, check for h1 (guest view shows "PressPlay" as h1)
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBeGreaterThanOrEqual(1);

    const h1Text = await page.locator("h1").first().textContent();
    console.log("H1 text:", h1Text);

    // Check ARIA landmarks
    const main = await page.locator("main").count();
    expect(main).toBeGreaterThanOrEqual(1);
  });

  test("login page has proper form structure", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test("register page has proper form structure", async ({ page }) => {
    await page.goto("/register", { waitUntil: "domcontentloaded" });

    const nameInput = page.locator('input#name');
    await expect(nameInput).toBeVisible();

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    const passwordInputs = page.locator('input[type="password"]');
    expect(await passwordInputs.count()).toBe(2);
  });

  test("artists page loads", async ({ page }) => {
    await page.goto("/artists", { waitUntil: "domcontentloaded" });

    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test("track detail page loads", async ({ page }) => {
    await page.goto("/track/trk-001", { waitUntil: "domcontentloaded" });

    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });
});
