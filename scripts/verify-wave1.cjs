/**
 * Verificacion visual de A2 (safeString / 404 de tickets), A3 (toggle del menu
 * de perfil) y C3 (carrusel del catalogo). Local contra `pnpm start`.
 *
 * Uso: BASE=http://localhost:3100 node scripts/verify-wave1.cjs
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "tests/screenshots/rc29";
// Este script corre con `node` (sin tsx), asi que no puede importar
// scripts/lib/credentials.ts. Mismas variables, misma fuente de verdad.
const ARTIST_EMAIL = process.env.TEST_ARTIST_EMAIL || "";
const ARTIST_PASSWORD = process.env.TEST_ARTIST_PASSWORD || "";
if (!ARTIST_EMAIL || !ARTIST_PASSWORD) {
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

async function login(page, email, pw) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  const form = page.locator("form").first();
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').fill(pw);
  const p = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60000 });
  await form.locator('button[type="submit"]').click();
  const r = await p;
  await page.waitForTimeout(2000);
  return r.status() < 400;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ---------- A2: /shows sin 404 de tickets ni "—" como texto ----------
  log("\n== A2: /shows (safeString truthy) ==");
  await page.goto(BASE + "/shows", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const ticketLinks = await page.locator('a[href*="ticket"]').all();
  let badHref = 0;
  for (const a of ticketLinks) {
    const h = (await a.getAttribute("href")) || "";
    if (!/^https?:\/\//i.test(h) && h !== "#") badHref++;
  }
  if (ticketLinks.length === 0) ok("sin enlaces de ticket con ticket_url vacio", "0 enlaces relative");
  else if (badHref === 0) ok("ningun href de ticket es relativo", `${ticketLinks.length} revisados`);
  else ko("ningun href de ticket es relativo", `${badHref} de ${ticketLinks.length} roto(s)`);

  // ningun href debe ser literalmente "—" ni empezar por "/shows/-"
  const hrefs = await page.locator("a").evaluateAll((els) => els.map((e) => e.getAttribute("href") || ""));
  const emDash = hrefs.filter((h) => h === "—" || h.includes("/—"));
  if (emDash.length === 0) ok('ningun href es el em dash "—"');
  else ko('ningun href es el em dash "—"', JSON.stringify(emDash));

  // texto de tarjeta: no debe-printed "—" como descripcion ni "📍 —, —"
  const body = (await page.textContent("body")) || "";
  if (!/📍\s*—\s*,\s*—/.test(body)) ok('sin ubicacion "📍 —, —"');
  else ko('sin ubicacion "📍 —, —"', "sigue presente");

  await page.screenshot({ path: path.join(OUT, "shows-a2.png"), fullPage: true });
  log("  captura: tests/screenshots/rc29/shows-a2.png");

  // ---------- A2: JSON-LD sin "—" ----------
  const ld = await page.evaluate(() => {
    const el = document.querySelector('script[type="application/ld+json"]');
    return el ? el.textContent : "";
  });
  if (ld && !/"genre":"—"/.test(ld)) ok("JSON-LD sin genre: —");
  else if (!ld) ok("JSON-LD de /shows no aplica", "sin script");
  else ko("JSON-LD sin genre: —");

  // ---------- C3: carrusel del catalogo (invitado) ----------
  log("\n== C3: carrusel del catalogo ==");
  for (const [theme, w] of [["light", 1440], ["dark", 1440], ["light-mobile", 390]]) {
    const isMobile = w < 700;
    await page.setViewportSize({ width: w, height: isMobile ? 844 : 900 });
    await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      try { localStorage.setItem("theme", t === "dark" ? "dark" : "light"); } catch {}
    }, theme === "dark" ? "dark" : "light");
    await page.waitForTimeout(600);

    const slide = page.locator("[data-carousel-slide], .basis-full").first();
    if ((await slide.count()) === 0) { ko(`slide presente (${theme})`); continue; }
    ok(`slide presente (${theme})`);

    // 1 slide = ancho del CONTENEDOR del carrusel (no del viewport: el
    // contenedor tiene max-w y padding, asi que comparar contra el viewport
    // daria un ratio < 1 aunque la slide lo ocupe entero).
    const full = await page.evaluate(() => {
      const el = document.querySelector(".basis-full");
      if (!el) return null;
      const track = el.parentElement;
      return {
        w: Math.round(el.getBoundingClientRect().width),
        track: Math.round(track ? track.getBoundingClientRect().width : 0),
        vw: document.documentElement.clientWidth,
      };
    });
    if (full && full.track) {
      const ratio = full.w / full.track;
      if (ratio > 0.95) ok(`1 slide = 1 slide del track (${theme})`, `${full.w}px de ${full.track}px del track`);
      else ko(`1 slide = 1 slide del track (${theme})`, `${full.w}px de ${full.track}px (${ratio.toFixed(2)})`);
    }

    // contador de paginas: vive en el pie del carrusel, fuera de la slide
    const whole = ((await page.textContent("body")) || "").replace(/\s+/g, " ");
    const pg = whole.match(/P[aá]gina\s+(\d+)\s+de\s+(\d+)/);
    const old = whole.match(/Artista\s+(\d+)\s+de\s+(\d+)/);
    if (pg) ok(`contador "Página n de m" (${theme})`, `Página ${pg[1]} de ${pg[2]}`);
    else if (old) ko(`contador "Página n de m" (${theme})`, `sigue el formato viejo "${old[0]}"`);
    else ko(`contador "Página n de m" (${theme})`, "no se encuentra contador");

    // los 4 campos de BioSection: ancho de celda y texto sin truncar
    const metrics = await page.evaluate(() => {
      const el = document.querySelector(".basis-full");
      if (!el) return [];
      // celdas de metrica: las que tienen el nombre del campo como etiqueta
      const all = Array.from(el.querySelectorAll("div,figure"));
      const names = ["Artista", "Género", "Ubicación", "Oyentes Mensuales"];
      return names.map((n) => {
        const lbl = Array.from(el.querySelectorAll("*")).find(
          (e) => e.children.length === 0 && (e.textContent || "").trim() === n
        );
        const cell = lbl ? lbl.closest("div") || lbl.parentElement : null;
        const val = cell ? Array.from(cell.querySelectorAll("p,span")).find((e) => (e.textContent || "").trim() && e.textContent.trim() !== n) : null;
        return {
          name: n,
          w: cell ? Math.round(cell.getBoundingClientRect().width) : 0,
          text: ((val && val.textContent) || "").trim().slice(0, 44),
          clipped: val ? val.scrollWidth > val.clientWidth + 1 : false,
          title: val ? val.getAttribute("title") : null,
        };
      });
    });
    const usable = metrics.filter((m) => m.w > 0);
    if (usable.length === 4) {
      const narrow = usable.filter((m) => m.w < 110);
      if (narrow.length === 0) ok(`4 celdas de BioSection utilizables (${theme})`, usable.map((m) => m.w + "px").join("/"));
      else ko(`4 celdas de BioSection utilizables (${theme})`, narrow.map((m) => `${m.w}px "${m.text}"`).join(", "));
      const clipped = usable.filter((m) => m.clipped);
      if (clipped.length === 0) ok(`texto sin truncar (${theme})`);
      else log(`    ATENCION truncadas en ${theme}: ${clipped.map((m) => `"${m.text}" (title=${m.title ? "si" : "NO"})`).join(" | ")}`);
      log(`    celdas: ${usable.map((m) => `"${m.text}" (${m.w}px)`).join(" | ")}`);
    } else {
      log(`    solo ${usable.length}/4 celdas medidas en ${theme}`);
    }

    const f = path.join(OUT, `carousel-c3-${theme}.png`);
    await page.screenshot({ path: f, fullPage: false });
    log(`  captura: ${f}`);
  }

  // ---------- A3: toggle del menu de perfil ----------
  log("\n== A3: menu de perfil (toggle) ==");
  await page.setViewportSize({ width: 1440, height: 900 });
  if (!(await login(page, ARTIST_EMAIL, ARTIST_PASSWORD))) { ko("login artista"); }
  else {
    ok("login artista");
    const avatar = page.locator('button[aria-haspopup="menu"]').first();
    if ((await avatar.count()) === 0) { ko("boton de avatar con aria-haspopup=menu"); }
    else {
      // 1er click abre
      await avatar.click();
      await page.waitForTimeout(500);
      const open1 = await page.locator('div[role="menu"]').count();
      if (open1 > 0) ok("1er click abre el menu"); else ko("1er click abre el menu");

      // 2o click CIERRA  <-- el bug reportado
      await avatar.click();
      await page.waitForTimeout(500);
      const open2 = await page.locator('div[role="menu"]').count();
      if (open2 === 0) ok("2o click CIERRA el menu (toggle correcto)");
      else ko("2o click CIERRA el menu (toggle correcto)", "sigue abierto");

      // 3o click reabre
      await avatar.click();
      await page.waitForTimeout(500);
      const open3 = await page.locator('div[role="menu"]').count();
      if (open3 > 0) ok("3er click reabre"); else ko("3er click reabre");

      // click fuera cierra
      await page.mouse.click(20, 400);
      await page.waitForTimeout(500);
      const open4 = await page.locator('div[role="menu"]').count();
      if (open4 === 0) ok("click fuera cierra"); else ko("click fuera cierra", "sigue abierto");

      // Escape cierra
      await avatar.click();
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      const open5 = await page.locator('div[role="menu"]').count();
      if (open5 === 0) ok("Escape cierra"); else ko("Escape cierra", "sigue abierto");

      await avatar.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, "header-menu-a3-open.png") });
      log("  captura: tests/screenshots/rc29/header-menu-a3-open.png");
    }
  }

  await browser.close();
  log(`\n== RESUMEN ==\n  PASS: ${pass.length}\n  FAIL: ${fail.length}`);
  if (fail.length) { log("\n  fallos:"); fail.forEach((f) => log("   - " + f)); process.exitCode = 1; }
})();
