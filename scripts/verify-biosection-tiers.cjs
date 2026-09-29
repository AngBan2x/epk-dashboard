/**
 * Mide los 4 campos de BioSection en TODOS sus consumidores, para confirmar
 * que el escalon de container query (1 / 2 / 4 columnas) no degrada las otras
 * paginas. Se midio con el DOM real, no con suposiciones.
 */
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE || "http://localhost:3100";
const LABELS = ["Artista", "Género", "Ubicación", "Oyentes Mensuales"];

async function measure(page, url, label, expect) {
  await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate((names) => {
    const out = [];
    for (const n of names) {
      const lbl = Array.from(document.querySelectorAll("*")).find(
        (e) => e.children.length === 0 && (e.textContent || "").trim() === n
      );
      const cell = lbl ? lbl.closest("div") || lbl.parentElement : null;
      if (!cell) continue;
      const val = Array.from(cell.querySelectorAll("p,span")).find(
        (e) => (e.textContent || "").trim() && e.textContent.trim() !== n
      );
      const grid = cell.closest("[class*='grid']");
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0;
      out.push({
        n,
        w: Math.round(cell.getBoundingClientRect().width),
        text: ((val && val.textContent) || "").trim().slice(0, 34),
        cut: val ? val.scrollWidth > val.clientWidth + 1 : false,
        cols,
      });
    }
    return out;
  }, LABELS);
  const okCols = r.length > 0 && r.every((x) => x.cols === expect);
  const anyCut = r.some((x) => x.cut);
  console.log(
    `${okCols && !anyCut ? "PASS" : "FAIL"}  ${label.padEnd(34)} cols=${r[0] ? r[0].cols : "?"} (esperado ${expect})  celdas=${r.map((x) => x.w + "px").join("/")}  ${anyCut ? "** TRUNCA **" : "sin truncar"}`
  );
  console.log(`        ${r.map((x) => `"${x.text}"`).join(" | ")}`);
  return okCols && !anyCut;
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const results = [];

  // pagina publica del artista: grid de 814px -> 4 columnas (como antes del cambio)
  const href = await page.goto(BASE + "/artists", { waitUntil: "domcontentloaded", timeout: 60000 })
    .then(() => page.locator('a[href^="/artists/"]').first().getAttribute("href").catch(() => null));
  if (href) results.push(await measure(page, href, "/artists/[id] (grid 814px)", 4));
  else console.log("FAIL  no se encontro artista en /artists");

  // dashboard como invitado: bloque de bio ~560px -> 2 columnas
  results.push(await measure(page, "/dashboard", "/dashboard bloque bio", 2));

  // carrusel en el dashboard: columna de bio ~520px -> 2 columnas
  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const car = await page.evaluate((names) => {
    const slide = document.querySelector(".basis-full");
    if (!slide) return null;
    const lbl = Array.from(slide.querySelectorAll("*")).find(
      (e) => e.children.length === 0 && (e.textContent || "").trim() === names[0]
    );
    const cell = lbl ? lbl.closest("div") || lbl.parentElement : null;
    if (!cell) return null;
    const grid = cell.closest("[class*='grid']");
    return { cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length, w: Math.round(cell.getBoundingClientRect().width) };
  }, LABELS);
  if (car) {
    const good = car.cols === 2 && car.w >= 200;
    console.log(`${good ? "PASS" : "FAIL"}  carrusel columna bio (desktop)     cols=${car.cols} celda=${car.w}px`);
    results.push(good);
  }

  // movil 390: carrusel -> 1 columna
  await page.setViewportSize({ width: 390, height: 844 });
  const carM = await page.evaluate((names) => {
    const slide = document.querySelector(".basis-full");
    if (!slide) return null;
    const lbl = Array.from(slide.querySelectorAll("*")).find(
      (e) => e.children.length === 0 && (e.textContent || "").trim() === names[0]
    );
    const cell = lbl ? lbl.closest("div") || lbl.parentElement : null;
    if (!cell) return null;
    const grid = cell.closest("[class*='grid']");
    return { cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length, w: Math.round(cell.getBoundingClientRect().width) };
  }, LABELS);
  if (carM) {
    const good = carM.cols === 1 && carM.w >= 200;
    console.log(`${good ? "PASS" : "FAIL"}  carrusel columna bio (movil 390)    cols=${carM.cols} celda=${carM.w}px`);
    results.push(good);
  }

  // movil 390: pagina de artista -> 1 columna
  if (href) {
    await page.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    const m = await page.evaluate((names) => {
      const lbl = Array.from(document.querySelectorAll("*")).find(
        (e) => e.children.length === 0 && (e.textContent || "").trim() === names[0]
      );
      const cell = lbl ? lbl.closest("div") || lbl.parentElement : null;
      if (!cell) return null;
      const grid = cell.closest("[class*='grid']");
      return { cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length, w: Math.round(cell.getBoundingClientRect().width) };
    }, LABELS);
    if (m) {
      const good = m.cols === 1 && m.w >= 200;
      console.log(`${good ? "PASS" : "FAIL"}  /artists/[id] (movil 390)            cols=${m.cols} celda=${m.w}px`);
      results.push(good);
    }
  }

  await browser.close();
  console.log(`\n== RESUMEN ==\n  ${results.filter(Boolean).length}/${results.length} PASS`);
  if (results.some((r) => !r)) process.exitCode = 1;
})();
