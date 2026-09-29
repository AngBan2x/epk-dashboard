/**
 * C1 follow-up: el header de `ArtistHero` debe alinearse con el resto de la
 * pagina. Cuando el <main> subio de `max-w-4xl` a `max-w-7xl` (para que las
 * EPKCard no estuvieran comprimidas), el `max-w-4xl` INTERNO de ArtistHero
 * paso a recortar el header a 896px dentro de 1280px, y el nombre del artista
 * quedo inset ~194px respecto a las tarjetas de abajo.
 *
 * Mide el borde izquierdo de: <main>, el contenedor del header, y la primera
 * tarjeta de la seccion siguiente. Los tres deben coincidir.
 *
 * Uso:
 *   npx tsx scripts/rc29-header-align.ts --base http://localhost:3100
 *   npx tsx scripts/rc29-header-align.ts --base https://epk-dashboard.vercel.app
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "tests", "screenshots", "rc29");
const argv = process.argv.indexOf("--base");
const BASE = argv > -1 ? process.argv[argv + 1] : "http://localhost:3100";
const ARTIST_ID = process.env.ARTIST_ID || "art-1788226907039"; // Kate Bush

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  // networkidle no converge en produccion (polling de notificaciones + player).
  await page.goto(`${BASE}/artists/${ARTIST_ID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("h1", { timeout: 45000 });
  await page.waitForTimeout(2500);

  // OJO: estas expresiones van como STRING de una linea. Un arrow function
  // pasado a evaluate recibe el helper __name de esbuild, que no existe en el
  // navegador ("__name is not defined"); y un cuerpo de funcion multilinea
  // pasado como string devuelve undefined en silencio (la lista sale vacia).
  const main = (await page.evaluate("Math.round(document.querySelector('main').getBoundingClientRect().left)")) as number;
  const mainW = (await page.evaluate("Math.round(document.querySelector('main').getBoundingClientRect().width)")) as number;
  const hero = (await page.evaluate(
    "Math.round(document.querySelector('main > div').getBoundingClientRect().left)"
  )) as number;
  const bio = (await page.evaluate(
    "(function(){var h=document.querySelector('h2');var e=h?h.closest('section,div[class*=rounded]')||h.parentElement:null;return e?Math.round(e.getBoundingClientRect().left):-1})()"
  )) as number;

  const h1Left = (await page.evaluate(
    "Math.round(document.querySelector('h1').getBoundingClientRect().left)"
  )) as number;

  await page.screenshot({ path: path.join(OUT, `header-align-${BASE.includes("vercel") ? "prod" : "local"}.png`) });

  const rows: [string, number][] = [
    ["main (contenedor de pagina)", main],
    ["header del artista (h1)", h1Left],
    ["contenedor del header", hero],
    ["primera tarjeta de seccion", bio],
  ];
  console.log(`\nBASE ${BASE}   viewport 1440`);
  console.log(`main: ${mainW}px de ancho, left=${main}\n`);
  console.log("elemento                          left");
  for (const [n, v] of rows) console.log(`${n.padEnd(32)} ${String(v).padStart(5)}`);

  // La referencia es la tarjeta de contenido, NO la caja de <main>: main tiene
  // px-4, asi que su left (80) queda 16px a la izquierda del contenido real (96).
  // Comparar el h1 contra main daria un falso positivo de 16px siempre.
  const drift = Math.abs(h1Left - bio);
  console.log(`\ndesalineacion header h1 vs contenido: ${drift}px`);
  if (drift > 8) {
    console.log("FALLA: el header no alinea con el resto de la pagina");
    await browser.close();
    process.exit(1);
  }
  console.log("OK: header alineado con el resto de la pagina");
  await browser.close();
})();
