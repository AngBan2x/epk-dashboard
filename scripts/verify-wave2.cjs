/**
 * Verificacion de la Fase B (B1-B4) y la Fase E sobre la app de produccion
 * local. Incluye la medicion del N+1 de YouTube contando peticiones de red.
 *
 * Uso: BASE=http://localhost:3100 node scripts/verify-wave2.cjs
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "tests/screenshots/rc29";
const pass = [], fail = [];
const log = (m) => console.log(m);
const ok = (n, d) => { pass.push(n); log(`  PASS ${n}${d ? " — " + d : ""}`); };
const ko = (n, d) => { fail.push(n); log(`  FAIL ${n}${d ? " — " + d : ""}`); };

async function login(page, email, pw) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  const f = page.locator("form").first();
  await f.locator('input[type="email"]').fill(email);
  await f.locator('input[type="password"]').fill(pw);
  const p = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60000 });
  await f.locator('button[type="submit"]').click();
  const r = await p;
  await page.waitForTimeout(2500);
  return r.status() < 400;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  // contador de peticiones a las APIs de metricas
  let ytCalls = [], lfmCalls = [], exportCalls = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/api/youtube")) ytCalls.push(u);
    if (u.includes("/api/lastfm")) lfmCalls.push(u);
    if (u.includes("/api/export")) exportCalls.push(u + " " + r.method());
  });
  const consoleErr = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErr.push(m.text()); });

  // ---------------- E: N+1 de YouTube ----------------
  log("\n== E: N+1 de YouTube y metricas honestas ==");
  const href = await page.goto(BASE + "/artists", { waitUntil: "domcontentloaded", timeout: 60000 })
    .then(() => page.locator('a[href^="/artists/"]').first().getAttribute("href").catch(() => null));
  if (!href) { ko("artista encontrado en /artists"); } else {
    ytCalls = [];
    await page.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    const cards = await page.locator('a[href^="/track/"]').count();
    if (ytCalls.length === 0) ok("0 peticiones a /api/youtube desde el cliente", "lote resuelto en servidor");
    else if (ytCalls.length === 1) ok("1 sola peticion a /api/youtube", ytCalls[0].replace(BASE, "").slice(0, 90));
    else ko("N+1 de YouTube eliminado", `${ytCalls.length} peticiones para ${cards} tarjetas`);
    log(`    tarjetas: ${cards} | peticiones youtube: ${ytCalls.length}`);

    // valores de streams/likes: "—" con title, o numero real
    const metrics = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('a[href^="/track/"]').forEach((a) => {
        const t = (a.textContent || "").replace(/\s+/g, " ").trim();
        if (/\d/.test(t)) out.push(t.slice(0, 80));
      });
      return out.slice(0, 3);
    });
    log(`    tarjeta muestra: ${JSON.stringify(metrics[0] || "")}`);
  }

  // dashboard invitado: cuenta las rejillas
  for (const [label, url] of [["invitado", "/dashboard"], ["artista", "/dashboard"]]) {
    if (label === "artista" && !(await login(page, "angab06@gmail.com", "12345678"))) { ko("login artista"); continue; }
    ytCalls = []; lfmCalls = [];
    await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    const n = await page.locator('a[href^="/track/"]').count();
    if (label === "invitado") {
      if (ytCalls.length <= 1) ok(`dashboard invitado: ${ytCalls.length} peticion(es) de youtube para ${n} tarjetas`);
      else ko("dashboard invitado: N+1", `${ytCalls.length} peticiones para ${n} tarjetas`);
    } else {
      if (ytCalls.length <= 1) ok(`dashboard artista: ${ytCalls.length} peticion(es) de youtube para ${n} tarjetas`);
      else ko("dashboard artista: N+1", `${ytCalls.length} peticiones para ${n} tarjetas`);
      lfmCalls = [];
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);
      log(`    /api/lastfm: ${lfmCalls.length} peticion(es) desde el cliente (se espera 1 por render)`);
    }
  }

  // ---------------- B1 + C6 ----------------
  log("\n== B1: descargas en la pagina publica del artista ==");
  await page.goto(BASE + "/artists", { waitUntil: "domcontentloaded", timeout: 60000 });
  const h2 = await page.locator('a[href^="/artists/"]').first().getAttribute("href").catch(() => null);
  if (!h2) { ko("artista para B1"); } else {
    await page.goto(BASE + h2, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    const body = (await page.textContent("body")) || "";
    if (/Descargas para prensa/i.test(body)) ok("seccion de descargas visible en /artists/[id] (invitado)");
    else ko("seccion de descargas visible en /artists/[id]");

    if (!/Actualizar datos del dossier/i.test(body)) ok("B2: boton de regenerar eliminado");
    else ko("B2: boton de regenerar eliminado", "sigue visible");

    // las descargas de verdad: pulsar y esperar respuesta
    const dl = page.locator('button:has-text("Descargar"), a:has-text("Descargar")').first();
    if ((await dl.count()) > 0) {
      const p = page.waitForResponse((r) => r.url().includes("/api/export"), { timeout: 60000 });
      await dl.click({ force: true });
      const r = await p;
      if (r.status() < 400) ok("B1: la descarga responde de verdad", `status ${r.status()} en ${r.url().replace(BASE, "")}`);
      else ko("B1: la descarga responde de verdad", `status ${r.status()}`);
    } else ko("hay botones de descarga", "ninguno encontrado");

    // B4: opcion de catalogo en HTML
    const htmlBtn = page.getByRole("button", { name: /html/i }).first();
    if ((await htmlBtn.count()) > 0) ok("B4: existe opcion HTML del catalogo");
    else log("    (B4: la opcion HTML no se ve como boton separado en esta vista)");

    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => { document.documentElement.classList.toggle("dark", t === "dark"); }, theme);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `artist-downloads-b1-${theme}.png`), fullPage: true });
    }
    log("  capturas: tests/screenshots/rc29/artist-downloads-b1-{light,dark}.png");
  }

  // ---------------- C6 + B3 ----------------
  log("\n== C6: bloque de redes fuera del catalogo | B3: alturas ==");
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const g = await ctx2.newPage();
  await g.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  await g.waitForTimeout(3500);
  // C6: el bloque era un div con el nombre del artista + sus botones de red,
  // justo tras "Catalogo completo". Se comprueba por el aria-label que usa
  // ArtistSocialLinks, no por buscar texto de plataforma: las tarjetas de
  // track tambien pintan iconos de YouTube.
  const socialLinks = await g.locator('a[aria-label*="Visitar"], a[aria-label*="Redes sociales"]').count();
  if (socialLinks === 0) ok("C6: 0 links de redes en el catalogo de invitado");
  else ko("C6: 0 links de redes en el catalogo de invitado", `${socialLinks} encontrados`);

  const adminTabs = await g.locator('nav[aria-label="Admin tabs"]').count();
  if (adminTabs === 0) ok("C6: sin tabs de admin en el catalogo de invitado");
  else ko("C6: sin tabs de admin en el catalogo de invitado", `${adminTabs} navs`);

  const guestText = ((await g.textContent("body")) || "").replace(/\s+/g, " ");
  const gap = /Catálogo completo[^§]{0,80}Ordenar por/.test(guestText);
  if (gap) ok("C6: el titulo del catalogo salta directo a 'Ordenar por' (bloque fuera)");
  else ko("C6: el titulo del catalogo salta directo a 'Ordenar por'", "hay contenido entre medio");

  // B3: las dos cajas (Dossier/Rider y Descargas) solo existen si el usuario
  // TIENE perfil de artista. El admin no lo tiene, asi que hay que entrar con
  // la cuenta de artista.
  const adm = await ctx2.newPage();
  if (await login(adm, "angab06@gmail.com", "12345678")) {
    await adm.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await adm.waitForTimeout(4500);
    const heights = await adm.evaluate(() => {
      const find = (re) => Array.from(document.querySelectorAll("h1,h2,h3")).find((e) => re.test(e.textContent || ""));
      const h = find(/Dossier \/ Rider/i);
      const p = find(/Descargas para prensa/i);
      if (!h || !p) return null;
      const box = (e) => { const d = e.closest("div"); return d ? Math.round(d.getBoundingClientRect().height) : 0; };
      return { dossier: box(h), prensa: box(p) };
    });
    if (!heights) ko("B3: las dos cajas existen en el dashboard del artista", "no se localizaron");
    else {
      const diff = Math.abs(heights.dossier - heights.prensa);
      if (diff < 40) ok("B3: alturas parejas (fin del hueco de ~190px)", `${heights.dossier}px vs ${heights.prensa}px, dif ${diff}px`);
      else ko("B3: alturas parejas", `${heights.dossier}px vs ${heights.prensa}px, dif ${diff}px`);
    }
    for (const theme of ["light", "dark"]) {
      await adm.evaluate((t) => { document.documentElement.classList.toggle("dark", t === "dark"); }, theme);
      await adm.waitForTimeout(400);
      await adm.screenshot({ path: path.join(OUT, `dashboard-b3-${theme}.png`), fullPage: false });
    }
    log("  capturas: tests/screenshots/rc29/dashboard-b3-{light,dark}.png");
  } else ko("login artista para B3");

  log(`\n== consola ==\n  errores: ${consoleErr.length}`);
  consoleErr.slice(0, 4).forEach((e) => log("   " + e.slice(0, 130)));
  await browser.close();
  log(`\n== RESUMEN ==\n  PASS: ${pass.length}\n  FAIL: ${fail.length}`);
  if (fail.length) { log("\n  fallos:"); fail.forEach((f) => log("   - " + f)); process.exitCode = 1; }
})();
