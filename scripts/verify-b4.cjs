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
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);

  const jsonBtn = page.getByRole("button", { name: /Descargar cat[aá]logo \(JSON\)/i });
  const htmlBtn = page.getByRole("button", { name: /Descargar cat[aá]logo \(HTML\)/i });
  const nJ = await jsonBtn.count(), nH = await htmlBtn.count();
  if (nJ > 0) ok("B4: boton de catalogo en JSON"); else ko("B4: boton de catalogo en JSON");
  if (nH > 0) ok("B4: boton de catalogo en HTML"); else ko("B4: boton de catalogo en HTML", "no existe la opcion HTML");

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => { document.documentElement.classList.toggle("dark", t === "dark"); }, theme);
    await page.waitForTimeout(400);
    const f = path.join(OUT, `catalog-html-b4-${theme}.png`);
    await page.screenshot({ path: f });
    log(`  captura: ${f}`);
  }

  // descarga REAL de las dos opciones y comprobamos el nombre del archivo
  for (const [name, loc] of [["JSON", jsonBtn], ["HTML", htmlBtn]]) {
    if ((await loc.count()) === 0) continue;
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      loc.first().click(),
    ]);
    const fn = dl.suggestedFilename();
    const p = await dl.path();
    let size = 0, head = "";
    if (p) {
      const fsx = require("fs");
      size = fsx.statSync(p).size;
      head = fsx.readFileSync(p, "utf8").slice(0, 220).replace(/\s+/g, " ");
    }
    if (size > 0) ok(`B4: descarga ${name} responde con archivo`, `${fn} (${size} bytes)`);
    else ko(`B4: descarga ${name} responde con archivo`, `${fn} vacio`);
    if (name === "HTML") {
      if (/EPK_Dossier/i.test(fn)) ko("B4: nombre del HTML de catalogo correcto", `sale como ${fn} (se esperaba Catalogo)`);
      else ok("B4: nombre del HTML ya no dice EPK_Dossier", fn);
      if (/<html|<!doctype html/i.test(head)) ok("B4: el HTML descargado es HTML de verdad", head.slice(0, 60));
      else ko("B4: el HTML descargado es HTML de verdad", head.slice(0, 80));
    }
    if (name === "JSON") {
      try { JSON.parse(head.slice(0, 200) + "..."); } catch {}
    }
    await page.waitForTimeout(1200);
  }

  await b.close();
  log(`\n== RESUMEN ==\n  PASS: ${pass.length}\n  FAIL: ${fail.length}`);
  if (fail.length) { fail.forEach((f) => log("   - " + f)); process.exitCode = 1; }
})();
