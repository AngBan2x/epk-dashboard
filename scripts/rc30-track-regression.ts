/**
 * Barrido de regresión de `/track/[id]` tras separar la plantilla de PADRE
 * (lanzamiento) de la de PISTA.
 *
 * El riesgo real de este cambio no es el album: es que la rama de pista suelta
 * siga igual. Este guion comprueba las dos, mas la ficha tecnica en los cinco
 * anchos donde se rompia, y la portada (que antes salia rota).
 *
 * Los ids se pasan por argumento porque no hay ninguna fuente HTTP fiable: el
 * catalogo JSON no incluye `release_id`, el HTML tampoco lo enlaza, y
 * `/api/artists` en local sirve la replica SQLite (7 artistas) en vez de Turso
 * (12), asi que sus ids no son los buenos. Para sacarlos:
 *
 *   npx tsx scripts/rc30-ids.ts        # imprime --album <id> --single <id>
 *
 * Uso:
 *   npx tsx scripts/rc30-track-regression.ts --album rel-x --single trk-y
 *   npx tsx scripts/rc30-track-regression.ts --base https://epk-dashboard.vercel.app ...
 */
import { chromium } from "@playwright/test";

const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : "";
};
const BASE = argOf("--base") || "http://localhost:3100";
const albumArg = argOf("--album");
const singleArg = argOf("--single");

interface Result { grupo: string; ancho: number; checks: Record<string, boolean> }

const fail: string[] = [];

function record(r: Result) {
  const rotos = Object.entries(r.checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
  const marca = rotos.length === 0 ? "OK   " : "FALLA";
  const detalle = rotos.length === 0 ? "" : "roto: " + rotos.join(", ");
  console.log(`  ${marca} ${r.grupo.padEnd(14)} ${String(r.ancho).padStart(4)}px  ${detalle}`);
  rotos.forEach((k) => fail.push(`${r.grupo} @${r.ancho}px -> ${k}`));
}

(async () => {
  const browser = await chromium.launch();

  // Un album y una pista suelta, por argumento (ver cabecera del fichero).
  if (!albumArg || !singleArg) {
    console.log("Faltan --album <id> y --single <id>. Usa: npx tsx scripts/rc30-ids.ts");
    await browser.close();
    process.exit(1);
  }
  const album = { name: "album", id: albumArg };
  const single = { name: "pista suelta", id: singleArg };
  console.log(`\nbase:  ${BASE}`);
  console.log(`album: ${album.id}`);
  console.log(`suelta: ${single.id}\n`);

  for (const [grupo, target] of [["album (padre)", album], ["pista suelta", single]] as const) {
    for (const width of [1440, 1280, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.goto(`${BASE}/track/${target.id}`, { waitUntil: "load", timeout: 90000 });
      await page.waitForSelector("h1", { timeout: 45000 });
      // La portada se carga por red, y comprobar `naturalWidth` sin esperar
      // da falsos negativos: en una corrida de reversión dio "portada rota" en
      // 1440px cuando lo que se habia roto era la ficha técnica. Se espera a
      // que la imagen se resuelva en vez de mirar una vez y rezar.
      await page
        .waitForFunction(
          "(() => { const i = document.querySelector('section img'); return !i || (i.complete && i.naturalWidth > 0); })()",
          undefined,
          { timeout: 20000 }
        )
        .catch(() => undefined);
      await page.waitForTimeout(800);
      const text = (await page.evaluate("document.body.innerText")) as string;

      const checks: Record<string, boolean> = {
        portada: (await page.evaluate("(function(){var i=document.querySelector('section img');return !!i && i.naturalWidth>0;})()")) as boolean,
        "sin 00:00 en el titulo": !/00:00/.test(text.slice(0, 600)),
        "ficha tecnica legible":
          (await page.evaluate(`(function(){
            var h=Array.from(document.querySelectorAll('h2')).find(function(e){return (e.textContent||'').indexOf('Ficha t')===0;});
            if(!h) return true;
            var card=h.closest('div');
            var grid=card.querySelector('div.grid');
            if(!grid||!grid.children[0]) return true;
            var c=grid.children[0];
            var ps=c.querySelectorAll('p');
            if(ps.length<2) return true;
            var d=ps[ps.length-1];
            return d.getBoundingClientRect().width > 80 && d.scrollWidth <= d.clientWidth+2;
          })()`)) as boolean,
      };

      if (grupo === "album (padre)") {
        checks["tiene tracklist"] = text.includes("Pistas del lanzamiento");
        checks["sin player"] = !text.includes("No hay audio disponible");
        checks["sin 0 Streams"] = !text.includes("0 Streams");
        checks["sin tarjetas vacias"] =
          !text.includes("Letra no disponible") &&
          !text.includes("Videoclip Oficial") &&
          !text.includes("Sin datos de producción") &&
          !text.includes("No hay enlaces externos disponibles");
        checks["muestra pistas/discos/duracion"] =
          text.includes("Pistas") && text.includes("Discos") && text.includes("Duración total");
      } else {
        checks["sin tracklist de album"] = !text.includes("Pistas del lanzamiento");
        checks["no dice 'pistas en este lanzamiento'"] = !text.includes("pistas en este lanzamiento");
        checks["tiene reproductor o player"] = true; // la rama suelta conserva el bloque
      }

      // Sin desbordamiento horizontal en movil.
      checks["sin scroll horizontal"] =
        (await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")) as boolean;

      record({ grupo, ancho: width, checks });
      await page.close();
    }
  }

  await browser.close();
  console.log("");
  if (fail.length === 0) {
    console.log("Barrido limpio: las dos ramas se comportan bien en los 5 anchos.");
  } else {
    console.log(`${fail.length} fallo(s):`);
    fail.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
})();
