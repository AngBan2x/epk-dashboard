/**
 * Verifica C8/C9 en el editor de redes con la cuenta que TIENE perfil de artista
 * (el admin no lo tiene, asi que /profile no monta el editor).
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "tests/screenshots/rc29";
// Este script corre con `node` (sin tsx), asi que no puede importar
// scripts/lib/credentials.ts. Las variables son las mismas y la fuente de verdad
// sigue siendo ese modulo: si cambias el nombre de una, cambias aqui tambien.
const EMAIL = process.env.TEST_ARTIST_EMAIL || "";
const PASSWORD = process.env.TEST_ARTIST_PASSWORD || "";
if (!EMAIL || !PASSWORD) {
  console.error(
    "Faltan TEST_ARTIST_EMAIL / TEST_ARTIST_PASSWORD. Definelas en .env.local " +
      "(plantilla en .env.example) o en el secret store de CI. No hay contrasena por defecto."
  );
  process.exit(1);
}

const pass = [], fail = [];
const log = (m) => console.log(m);
const ok = (n, d) => { pass.push(n); log(`  PASS ${n}${d ? " — " + d : ""}`); };
const ko = (n, d) => { fail.push(n); log(`  FAIL ${n}${d ? " — " + d : ""}`); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  const form = page.locator("form").first();
  await form.locator('input[type="email"]').fill(EMAIL);
  await form.locator('input[type="password"]').fill(PASSWORD);
  const p = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60000 });
  await form.locator('button[type="submit"]').click();
  const r = await p;
  if (r.status() >= 400) { log("login fallo " + r.status()); process.exit(1); }
  await page.waitForTimeout(2500);
  log("login ok: " + EMAIL);

  for (const theme of ["light", "dark"]) {
    await page.goto(BASE + "/profile", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      try { localStorage.setItem("theme", t); } catch {}
    }, theme);
    await page.waitForTimeout(500);
    // el editor completo esta tras el boton "Añadir" (showSocialEditor)
    const addBtn = page.getByRole("button", { name: /^(Añadir|Ocultar)$/ });
    if ((await addBtn.count()) > 0) {
      const label = (await addBtn.first().textContent()) || "";
      if (label.trim() === "Añadir") {
        await addBtn.first().click();
        await page.waitForTimeout(700);
        log("  se abrio el editor con 'Añadir'");
      }
    }
    await page.locator("#social-links-editor").scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);

    const editor = page.locator("#social-links-editor");
    const editorCount = (await editor.count()) ? await editor.textContent() : "";
    const labels = editorCount || "";
    if (labels.includes("BandLab")) ok(`BandLab en el editor (${theme})`);
    else ko(`BandLab en el editor (${theme})`, "no aparece en el editor desplegado");
    if (!/Webflow/i.test(labels)) ok(`Webflow eliminado del editor (${theme})`);
    else ko(`Webflow eliminado del editor (${theme})`, "sigue en el editor");

    // contar los inputs por plataforma
    const inputs = await editor.locator('input[id^="social-"]').count();
    log(`  inputs de plataforma en el editor: ${inputs}`);

    // los 16 iconos deben estar presentes en el editor
    const iconCount = await editor.locator('svg[aria-hidden="true"]').count();
    log(`  iconos svg en el editor: ${iconCount}`);
    if (iconCount >= 16) ok(`16 iconos en el editor (${theme})`, iconCount + " svg");
    else ko(`16 iconos en el editor (${theme})`, `solo ${iconCount}`);

    const f = path.join(OUT, `social-editor-${theme}.png`);
    await page.screenshot({ path: f, fullPage: true });
    log(`  captura: ${f}`);
  }

  // vista publica del artista: los iconos configurados
  await page.goto(BASE + "/artists", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const href = await page.locator('a[href^="/artists/"]').first().getAttribute("href").catch(() => null);
  if (href) {
    await page.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    const f = path.join(OUT, "artist-page-socials.png");
    await page.screenshot({ path: f, fullPage: true });
    log(`  captura pagina artista: ${f}`);
  }

  await browser.close();
  log(`\n== RESUMEN ==\n  PASS: ${pass.length}\n  FAIL: ${fail.length}`);
  if (fail.length) process.exitCode = 1;
})();
