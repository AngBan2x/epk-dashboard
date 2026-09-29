/**
 * Renderiza los 16 iconos de social-platforms.ts a 16/20/24px sobre fondo claro y
 * oscuro, y guarda un PNG. Es la verificacion visual que el bug original hacia
 * imposible: los paths inventados compilaban bien y se veian igual de mal.
 *
 * Uso: node scripts/verify-social-icons.cjs
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const SRC = "lib/social-platforms.ts";
const OUT_DIR = "tests/screenshots/social-icons";
const HTML = path.join(OUT_DIR, "index.html");

function extractPlatforms() {
  const text = fs.readFileSync(SRC, "utf8");
  const start = text.indexOf("export const SOCIAL_PLATFORMS");
  const end = text.indexOf("] as const satisfies", start);
  const block = text.slice(start, end);
  const out = [];
  const entryRe = /key:\s*"([^"]+)",\s*\n\s*label:\s*"([^"]+)",\s*\n\s*color:\s*"([^"]+)"/g;
  let m;
  const idx = [];
  while ((m = entryRe.exec(block)) !== null) idx.push({ key: m[1], label: m[2], color: m[3], at: m.index });
  idx.forEach((e, i) => {
    const from = e.at;
    const to = i + 1 < idx.length ? idx[i + 1].at : block.length;
    const seg = block.slice(from, to);
    const d = seg.match(/d:\s*"([^"]+)"/);
    const fr = seg.match(/fillRule:\s*"(\w+)"/);
    if (d) out.push({ ...e, d: d[1], fillRule: fr ? fr[1] : "nonzero" });
  });
  return out;
}

(async () => {
  const platforms = extractPlatforms();
  console.log("plataformas extraidas:", platforms.length);
  if (platforms.length !== 16) {
    console.error("ATENCION: se esperaban 16, hay", platforms.length);
  }
  platforms.forEach((p) => console.log("  " + p.key.padEnd(15) + " d.len=" + String(p.d.length).padStart(5) + "  " + p.fillRule));

  const svg = (p, size) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" fill-rule="${p.fillRule}" aria-label="${p.label}"><path d="${p.d}"/></svg>`;

  const cell = (p) => `
    <figure>
      <div class="row">
        <div class="chip light">${svg(p, 16)}</div>
        <div class="chip light">${svg(p, 20)}</div>
        <div class="chip light">${svg(p, 24)}</div>
        <div class="chip dark">${svg(p, 16)}</div>
        <div class="chip dark">${svg(p, 20)}</div>
        <div class="chip dark">${svg(p, 24)}</div>
      </div>
      <figcaption>${p.label} <span>${p.key}</span></figcaption>
    </figure>`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    HTML,
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Iconos de redes</title>
<style>
 body{margin:0;padding:24px;font:14px/1.4 system-ui,sans-serif;background:#f8fafc;color:#0f172a}
 h1{font-size:20px;margin:0 0 4px} p.sub{margin:0 0 20px;color:#64748b}
 .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
 figure{margin:0;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:10px}
 figcaption{margin-top:8px;font-weight:600} figcaption span{font-weight:400;color:#94a3b8;font-size:12px}
 .row{display:flex;gap:8px;align-items:center}
 .chip{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid #cbd5e1;border-radius:8px}
 .chip.dark{background:#0f172a;border-color:#334155;color:#f8fafc}
</style></head><body>
<h1>Iconos de redes sociales — 16 / 20 / 24 px, claro y oscuro</h1>
<p class="sub">Los 7 paths geometricos inventados se reemplazaron por logotipos oficiales (simple-icons, CC0) y Webflow paso a BandLab.</p>
<div class="grid">${platforms.map(cell).join("")}</div>
</body></html>`
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto("file:///" + path.resolve(HTML).replace(/\\/g, "/"));
  await page.waitForTimeout(300);
  const png = path.join(OUT_DIR, "icons-16-20-24.png");
  await page.screenshot({ path: png, fullPage: true });
  await browser.close();
  console.log("\nscreenshot:", png);
})();
