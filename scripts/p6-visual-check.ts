import { chromium, devices } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = "screenshots/p6";

const routes = [
  { path: "/dashboard", name: "dashboard" },
  { path: "/shows", name: "shows" },
  { path: "/artists", name: "artists" },
];

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  const results: string[] = [];

  const browser = await chromium.launch();

  for (const vp of viewports) {
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({
        ...(vp.name === "mobile" ? devices["iPhone 13"] : devices["Desktop Chrome"]),
        viewport: { width: vp.width, height: vp.height },
        colorScheme: scheme,
        storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: "epk-theme", value: scheme }] }] },
      });
      const page = await context.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          errors.push(`[${vp.name}/${scheme}] ${msg.text().slice(0, 200)}`);
        }
      });
      page.on("pageerror", (err) => errors.push(`[${vp.name}/${scheme}] PAGEERROR ${err.message.slice(0, 200)}`));

      for (const route of routes) {
        const res = await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(2500);
        const status = res?.status() ?? 0;
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        results.push(`${vp.name}/${scheme} ${route.path} -> HTTP ${status} overflowX=${overflow}px`);
        await page.screenshot({ path: `${OUT}/${route.name}-${vp.name}-${scheme}.png`, fullPage: true });
      }
      await context.close();
    }
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

  const section = page.locator('section:has([aria-roledescription="carousel"])');
  const region = section.locator('[aria-roledescription="carousel"]');
  const carouselExists = (await region.count()) > 0;
  let carousel: Record<string, unknown> = { exists: carouselExists };
  if (carouselExists) {
    const slides = await region.locator('[aria-roledescription="slide"]').count();
    const navButtons = await section.locator('button[aria-label*="artista"]').count();
    const dots = await section.locator('button[aria-label^="Ir al"]').count();
    const live = section.locator('[aria-live="polite"]').first();
    const before = (await live.textContent())?.trim();
    await section.locator('button[aria-label="Artista siguiente"]').click();
    await page.waitForTimeout(1200);
    const afterClick = (await live.textContent())?.trim();
    await region.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1200);
    const afterKey = (await live.textContent())?.trim();
    const nextDisabled = await section
      .locator('button[aria-label="Artista siguiente"]')
      .isDisabled();
    carousel = { slides, navButtons, dots, before, afterClick, afterKey, nextDisabledAtEnd: nextDisabled };
  }

  await page.goto(`${BASE}/shows`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
  const selectInfo = await page
    .locator("#shows-status")
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return { colorScheme: cs.colorScheme, background: cs.backgroundColor, color: cs.colorColor };
    })
    .catch(() => null);
  const showsControls = {
    search: (await page.locator("#shows-search").count()) > 0,
    status: (await page.locator("#shows-status").count()) > 0,
    futureOnly: (await page.locator("#shows-future-only").count()) > 0,
    selectInfo,
  };
  await context.close();
  await browser.close();

  console.log("=== HTTP / overflow ===");
  results.forEach((r) => console.log(r));
  console.log("=== Carrusel ===");
  console.log(JSON.stringify(carousel, null, 2));
  console.log("=== Controles /shows ===");
  console.log(JSON.stringify(showsControls, null, 2));
  console.log("=== Errores de consola ===");
  console.log(errors.length ? [...new Set(errors)].join("\n") : "ninguno");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
