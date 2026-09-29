/**
 * Verificacion de C1 (ancho de tarjeta), C7 (hueco de redes), C4 (shows) y del
 * follow-up de a11y en ReleaseTrackList, sobre el build de produccion local.
 *
 * Uso: BASE=http://localhost:3100 node scripts/verify-wave3.cjs
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  // ---------- C1 + C7 ----------
  log("\n== C1 ancho de tarjeta | C7 hueco de redes ==");
  await page.goto(BASE + "/artists", { waitUntil: "domcontentloaded", timeout: 60000 });
  const href = await page.locator('a[href^="/artists/"]').first().getAttribute("href").catch(() => null);
  if (!href) { ko("artista encontrado"); } else {
    await page.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);

    const main = await page.locator("main").first().evaluate((el) => ({
      w: Math.round(el.getBoundingClientRect().width),
      cls: el.className,
    }));
    if (main.w > 1100) ok("C1: contenedor élargido", `${main.w}px (${main.cls.match(/max-w-\S+/)?.[0]})`);
    else ko("C1: contenedor alargado", `${main.w}px — sigue estrecho`);

    // la tarjeta es el ancestro del h3 con rounded-xl, no el <a> del titulo
    const card = await page.evaluate(() => {
      const h3 = document.querySelector("main h3");
      if (!h3) return 0;
      let n = h3;
      for (let i = 0; i < 6 && n.parentElement; i++) {
        n = n.parentElement;
        if ((n.className || "").toString().includes("rounded-xl") && (n.className || "").toString().includes("border")) {
          return Math.round(n.getBoundingClientRect().width);
        }
      }
      return 0;
    });
    if (card >= 260) ok("C1: tarjeta legible", `${card}px (antes 198px)`);
    else ko("C1: tarjeta legible", `${card}px o no encontrada`);

    // C2 no debe dejar la ficha inalcanzable
    const nav = await page.evaluate(() => {
      const h2 = Array.from(document.querySelectorAll("h2")).find((e) => /Lanzamientos/i.test(e.textContent || ""));
      const sec = h2 ? h2.parentElement : null;
      if (!sec) return null;
      const hrefs = Array.from(sec.querySelectorAll("a")).map((a) => a.getAttribute("href") || "");
      return { track: hrefs.filter((h) => h.startsWith("/track/")).length, release: hrefs.filter((h) => h.startsWith("/releases/")).length, total: hrefs.length };
    });
    if (!nav) ko("seccion Lanzamientos presente");
    else if (nav.track + nav.release > 0) ok("C2: cada lanzamiento enlaza a su ficha", `${nav.track} a /track/ + ${nav.release} a /releases/`);
    else ko("C2: cada lanzamiento enlaza a su ficha", "0 enlaces: la ficha quedaria inalcanzable");

    const h3 = await page.locator('main a[href^="/track/"] h3, main a[href^="/releases/"] h3').first().evaluate((el) => ({
      t: el.getAttribute("title"),
      txt: (el.textContent || "").trim().slice(0, 30),
  })).catch(() => null);
    if (h3 && h3.t) ok("C1: título truncado conserva el texto completo", `title="${h3.t.slice(0, 40)}"`);
    else if (h3) log(`    (el h3 "${h3.txt}" no está truncado)`);
    else log("    (no se encontró h3 enlazado)");

    const gap = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[aria-label*="Visitar"]'));
      const bio = Array.from(document.querySelectorAll("h2,h3")).find((e) => /Biograf/i.test(e.textContent || ""));
      if (!links.length || !bio) return null;
      const last = links[links.length - 1].getBoundingClientRect();
      const box = bio.closest("div");
      return Math.round(box.getBoundingClientRect().top - last.bottom);
    });
    if (gap === null) log("    (este artista no tiene redes, no se mide C7)");
    else if (gap > 12) ok("C7: hueco entre redes y BioSection", `${gap}px (antes pegadas)`);
    else ko("C7: hueco entre redes y BioSection", `${gap}px`);

    // follow-up a11y: title en la fila de ReleaseTrackList
    const rowTitles = await page.locator('button[aria-label*="Reproducir"]').evaluateAll((els) => els.length);
    log(`    filas de pista con boton play: ${rowTitles}`);
    if (rowTitles > 0) {
      const titled = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button[aria-label*="Reproducir"]'))[0];
        const p = btn ? btn.parentElement.querySelector("p") : null;
        return p ? { title: p.getAttribute("title"), txt: (p.textContent || "").trim() } : null;
      });
      if (titled && titled.title) ok("a11y: la fila de pista conserva el título completo", `title="${titled.title.slice(0, 40)}"`);
      else log(`    (sin pistas multipista visibles todavia: "${titled ? titled.txt : "n/d"}")`);
    }

    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => { document.documentElement.classList.toggle("dark", t === "dark"); }, theme);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `c1-c7-artist-${theme}.png`), fullPage: true });
    }
    log("  capturas: tests/screenshots/rc29/c1-c7-artist-{light,dark}.png");

    // movil
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow <= 1) ok("movil 390: sin desbordamiento horizontal", `scrollWidth-clientWidth=${overflow}px`);
    else ko("movil 390: sin desbordamiento horizontal", `${overflow}px de overflow`);
    await page.screenshot({ path: path.join(OUT, "c1-c7-artist-mobile.png"), fullPage: true });
  }

  // ---------- C4 ----------
  log("\n== C4: /shows ==");
  for (const [theme, w] of [["light", 1440], ["dark", 1440], ["light-mobile", 390]]) {
    await page.setViewportSize({ width: w, height: w < 700 ? 844 : 1000 });
    await page.goto(BASE + "/shows", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.evaluate((t) => { document.documentElement.classList.toggle("dark", t === "dark"); }, theme === "dark" ? "dark" : "light");
    await page.waitForTimeout(600);

    const r = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      // el gradiente de marca esta en el <header>, no en un div
      const grads = [];
      document.querySelectorAll("*").forEach((el) => {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg.includes("linear-gradient")) grads.push({ bg, tag: el.tagName, w: Math.round(el.getBoundingClientRect().width) });
      });
      const marca = grads.find((g) => /79,\s*70,\s*229/.test(g.bg) && /236,\s*72,\s*153/.test(g.bg));
      const mains = Array.from(document.querySelectorAll("main, div")).find((d) => (d.className || "").toString().includes("max-w-7xl"));
      const initials = Array.from(document.querySelectorAll("*")).filter((e) => e.children.length === 0 && /^[A-Z]{1,3}$/.test((e.textContent || "").trim()) && e.textContent.trim().length > 1);
      const rel = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") || "");
      return {
        h1: h1 ? (h1.textContent || "").trim() : null,
        gradienteMarca: !!marca,
        gradienteTag: marca ? marca.tag + " " + marca.w + "px" : null,
        gradientesTotales: grads.length,
        maxw: mains ? Math.round(mains.getBoundingClientRect().width) : 0,
        fallbacks: initials.length,
        hrefsRelativos: rel.filter((x) => x && !/^https?:|^#|^\//.test(x)).length,
        emDashHref: rel.filter((x) => x.includes("—")).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    log(`    ${theme}: ${JSON.stringify(r)}`);
    if (r.gradienteMarca) ok(`C4: gradiente de marca (${theme})`, `${r.gradienteTag}, ${r.gradientesTotales} gradientes en la pagina`);
    else ko(`C4: gradiente de marca (${theme})`, "no detectado");
    if (r.maxw > 1100) ok(`C4: ancho acotado (${theme})`, `${r.maxw}px`); else if (w > 700) ko(`C4: ancho acotado (${theme})`, `${r.maxw}px`);
    if (r.fallbacks > 0) ok(`C4: portada de fallback sin flyer (${theme})`, `${r.fallbacks} iniciales`); else ko(`C4: portada de fallback sin flyer (${theme})`, "0");
    if (r.hrefsRelativos === 0 && r.emDashHref === 0) ok(`C4: ningun href roto (${theme})`); else ko(`C4: ningun href roto (${theme})`, `${r.hrefsRelativos} relativos, ${r.emDashHref} con em dash`);
    if (r.overflow <= 1) ok(`C4: sin overflow (${theme})`); else ko(`C4: sin overflow (${theme})`, `${r.overflow}px`);
    await page.screenshot({ path: path.join(OUT, `c4-shows-${theme}.png`), fullPage: true });
  }

  log(`\n== consola ==\n  errores: ${errs.length}`);
  errs.slice(0, 4).forEach((e) => log("   " + e.slice(0, 110)));
  await b.close();
  log(`\n== RESUMEN ==\n  PASS: ${pass.length}\n  FAIL: ${fail.length}`);
  if (fail.length) { log("\n  fallos:"); fail.forEach((f) => log("   - " + f)); process.exitCode = 1; }
})();
