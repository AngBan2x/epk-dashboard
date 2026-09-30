/**
 * Mide el ancho real de la "Ficha técnica para prensa" en `/track/[id]`.
 *
 * Sirve para justificar los umbrales de la container query con números, no con
 * suposiciones. Antes de este guion se dio por hecho que el problema era el
 * viewport, y el viewport a 1440px es correcto: el problema es que el
 * componente mide 322px porque vive en la tercera columna de un grid de 3.
 *
 * Uso: npx tsx scripts/rc30-measure-ficha.ts [--base url] [--track rel-...]
 */
import { chromium } from "@playwright/test";

const argv = process.argv.indexOf("--base");
const BASE = argv > -1 ? process.argv[argv + 1] : "https://epk-dashboard.vercel.app";
const tv = process.argv.indexOf("--track");
const TRACK = tv > -1 ? process.argv[tv + 1] : "rel-5878039e";

interface Box { sel: string; w: number; text: number }

(async () => {
  const browser = await chromium.launch();
  const results: Record<string, Box[]> = {};

  for (const width of [1440, 1280, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`${BASE}/track/${TRACK}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("h1", { timeout: 45000 });
    await page.waitForTimeout(1500);

    // Expresiones de una linea a proposito: un cuerpo de funcion multilinea
    // pasado como string a evaluate devuelve undefined en silencio.
    const rows = (await page.evaluate(`(function(){
      var h = Array.from(document.querySelectorAll('h2')).find(function(e){return (e.textContent||'').indexOf('Ficha t') === 0});
      if (!h) return [];
      var card = h.closest('div');
      var grid = card.querySelector('div.grid');
      var out = [];
      out.push({ sel: 'card', w: Math.round(card.getBoundingClientRect().width) });
      out.push({ sel: 'grid', w: grid ? Math.round(grid.getBoundingClientRect().width) : 0 });
      var cells = grid ? Array.from(grid.children) : [];
      cells.forEach(function(c,i){
        out.push({ sel: 'celda ' + (i+1), w: Math.round(c.getBoundingClientRect().width) });
        // el texto dentro de la celda
        var ps = c.querySelectorAll('p');
        if (ps.length > 1) {
          var d = ps[ps.length-1];
          out.push({ sel: '  texto', w: Math.round(d.getBoundingClientRect().width), text: d.scrollWidth });
        }
        var b = c.querySelector('button');
        if (b) out.push({ sel: '  boton', w: Math.round(b.getBoundingClientRect().width) });
        var badge = c.querySelector('div.h-8');
        if (badge) out.push({ sel: '  badge', w: Math.round(badge.getBoundingClientRect().width) });
      });
      return out;
    })()`)) as Box[];
    results[width] = rows;
    await page.close();
  }

  console.log(`\nFicha técnica para prensa — ${BASE}/track/${TRACK}\n`);
  for (const [w, rows] of Object.entries(results)) {
    const card = rows.find((r) => r.sel === "card")?.w ?? 0;
    const celda = rows.find((r) => r.sel === "celda 1")?.w ?? 0;
    const texto = rows.find((r) => r.sel === "  texto");
    const boton = rows.find((r) => r.sel === "  boton")?.w ?? 0;
    const badge = rows.find((r) => r.sel === "  badge")?.w ?? 0;
    const roto = texto && texto.text > texto.w + 1;
    console.log(
      `  ${String(w).padStart(4)}px  card=${String(card).padStart(4)}  celda=${String(celda).padStart(4)}` +
        `  badge=${String(badge).padStart(3)}  boton=${String(boton).padStart(3)}` +
        `  texto=${texto ? String(texto.w).padStart(3) : "  -"}` +
        (roto ? `  <-- NECESITA ${texto!.text}px (CORTADO)` : "")
    );
  }
  await browser.close();
})();
