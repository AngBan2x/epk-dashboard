/**
 * Verificacion visual de C10/C11/C12: pestanas del admin.
 * Los iconos (C8/C9) se verifican en scripts/verify-social-icons.cjs y
 * scripts/verify-social-editor.cjs — aqui no, porque /profile con cuenta admin
 * no monta el editor de redes (el admin no tiene perfil de artista).
 *
 * Uso: BASE=http://localhost:3100 node scripts/verify-tabs-icons.cjs
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = "tests/screenshots/rc29";
const EMAIL = process.env.ADMIN_EMAIL || "admin@epk.local";
const PASSWORD = process.env.ADMIN_PASSWORD || "CONTRASENA_ADMIN_ROTADA";

const pass = [];
const fail = [];
const log = (m) => console.log(m);
const ok = (n, d) => { pass.push(n); log(`  PASS ${n}${d ? " — " + d : ""}`); };
const ko = (n, d) => { fail.push(n + (d ? " — " + d : "")); log(`  FAIL ${n}${d ? " — " + d : ""}`); };

async function login(page) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  const form = page.locator("form").first();
  await form.locator('input[type="email"]').fill(EMAIL);
  await form.locator('input[type="password"]').fill(PASSWORD);
  const p = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60000 });
  await form.locator('button[type="submit"]').click();
  const r = await p;
  if (r.status() >= 400) return false;
  await page.waitForTimeout(2500);
  return true;
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    const d = document.documentElement;
    d.classList.toggle("dark", t === "dark");
    try { localStorage.setItem("theme", t); } catch {}
  }, theme);
  await page.waitForTimeout(400);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  if (!(await login(page))) ko("login admin");
  else ok("login admin", EMAIL);

  for (const theme of ["light", "dark"]) {
    await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    await setTheme(page, theme);
    const nav = page.locator('nav[aria-label="Admin tabs"]');
    const navText = ((await nav.textContent()) || "").replace(/\s+/g, " ").trim();
    log(`  nav (${theme}): ${navText}`);

    if (navText.includes("Envíos")) ok(`pestaña Envíos presente (${theme})`);
    else ko(`pestaña Envíos presente (${theme})`);

    if (!navText.includes("Aprobaciones")) ok(`pestaña Aprobaciones duplicada eliminada (${theme})`);
    else ko(`pestaña Aprobaciones duplicada eliminada (${theme})`, "sigue en el nav");

    // C10: el enlace Envíos no debe llevar el color de activa
    const link = nav.locator('a[href="/admin/approvals"]');
    const linkClass = (await link.getAttribute("class")) || "";
    if (!/text-blue-600/.test(linkClass)) ok(`Envíos sin azul de seleccionada (${theme})`);
    else ko(`Envíos sin azul de seleccionada (${theme})`, linkClass.slice(0, 80));

    // C12: solo la pestaña activa lleva border-b-2
    const underline = await nav.locator("button.border-b-2").count();
    const ariaCurrent = await nav.locator('[aria-current="page"]').count();
    log(`  botones con border-b-2: ${underline} | aria-current: ${ariaCurrent}`);
    if (underline === 1) ok(`una sola pestaña subrayada (${theme})`);
    else ko(`una sola pestaña subrayada (${theme})`, `hay ${underline}`);
    if (ariaCurrent === 1) ok(`un solo aria-current (${theme})`);
    else ko(`un solo aria-current (${theme})`, `hay ${ariaCurrent}`);

    // comprobar que el fondo solido verde desaparecio
    if (underline === 1 && !/bg-emerald-500/.test(await nav.innerHTML())) {
      ok(`sin fondo sólido en pestañas (${theme})`);
    } else {
      ko(`sin fondo sólido en pestañas (${theme})`);
    }

    const file = path.join(OUT, `admin-tabs-${theme}.png`);
    await page.screenshot({ path: file, fullPage: false });
    log(`  captura: ${file}`);

    // recorrer todas las pestañas y capturar la activa
    for (const name of ["Tracks", "Releases", "Notificaciones", "Artistas", "Shows"]) {
      const btn = nav.getByRole("button", { name: new RegExp("^" + name) });
      if ((await btn.count()) === 0) { ko(`pestaña ${name} existe (${theme})`); continue; }
      await btn.first().click();
      await page.waitForTimeout(900);
      const cur = await nav.locator('[aria-current="page"]').textContent();
      if ((cur || "").trim().startsWith(name)) ok(`activar ${name} (${theme})`);
      else ko(`activar ${name} (${theme})`, `aria-current quedo en "${(cur || "").trim()}"`);
    }
    const fileActive = path.join(OUT, `admin-tab-shows-${theme}.png`);
    await page.screenshot({ path: fileActive, fullPage: false });
    log(`  captura: ${fileActive}`);
  }

  log(`\n== consola ==\n  errores: ${consoleErrors.length}`);
  consoleErrors.slice(0, 5).forEach((e) => log("   " + e.slice(0, 140)));

  await browser.close();
  log(`\n== RESUMEN ==\n  PASS: ${pass.length}\n  FAIL: ${fail.length}`);
  if (fail.length) { log("\n  fallos:"); fail.forEach((f) => log("   - " + f)); process.exitCode = 1; }
})();
