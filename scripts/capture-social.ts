/**
 * P13 — Genera las capturas que se van a publicar en redes sociales.
 *
 * ## Por qué existe y por qué no es un `take-screenshots.ts` más
 *
 * Los generadores que ya había en `scripts/` fallan **en silencio**, y esa es la
 * diferencia entre este y ellos:
 *
 * - `scripts/take-screenshots.ts` apunta a rutas que no existen (`/track/trk-001`)
 *   y no autentica. Termina "con éxito" y genera capturas de páginas de error.
 * - `screenshots/prod-dark-home.png` y `prod-light-home.png` pesan **1,5 KB**.
 *   Una landing real no pesa eso: son pantallas en blanco.
 *
 * Un generador que deja dos ficheros vacíos y dice que fue bien es peor que uno
 * que falla, porque el éxito falso se descubre **en la publicación**, cuando ya
 * es público y ya no se puede arreglar sin alcance. Por eso aquí hay dos
 * comprobaciones, y las dos abortan:
 *
 * 1. **El selector de cada página tiene que existir** antes de capturar. Si la
 *    ruta dio 404 o un error, falla aquí y no produce un fichero.
 * 2. **Un peso mínimo por debajo del cual se considera en blanco.** Un JPEG de
 *    una página de 1440 px que ocupe menos de `MIN_BYTES` no tiene contenido.
 *
 * ## Dónde van y por qué
 *
 * A `public/pressplay/`, y **commiteadas**. Vercel sirve `public/` por CDN, así
 * que cada captura es ya una URL pública — que es lo que exigen Threads,
 * Instagram y Facebook, que van a descargarlas ellas mismas.
 *
 * La alternativa (bucket externo) evita binarios en el repo pero obliga a
 * subirlos a mano. Con 12-16 ficheros de ~150 KB, el repo crece ~2 MB y a cambio
 * las capturas se regeneran con un comando y no con un ritual.
 *
 * ## Las imágenes NO son portadas de albums
 *
 * Ver `docs/PHASE_P13.md`. Las portadas son obra de terceros con copyright y son
 * de Apple; anunciar la plataforma con el catálogo de otro no tiene sentido.
 *
 * ## Requisito de resolución
 *
 * Threads exige entre 320 y 1440 px de ancho. 1440 cumple; los 390 del móvil
 * también. El mínimo se comprueba en `tests/unit/capturas-social.test.ts`, no
 * aquí: aquí solo se avisa.
 *
 * ## Uso
 *
 *   npx tsx scripts/capture-social.ts                    # contra producción
 *   SOCIAL_BASE_URL=http://localhost:3000 npx tsx ...   # contra local
 */

import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Este import **carga** `.env.local` por su cuenta (`scripts/lib/credentials.ts`
// llama a `config()` en su propio cuerpo). Por eso este fichero ya no lo carga:
// en ES modules los imports se evaluan antes que el cuerpo del módulo, asi que
// un `config()` aqui correria DESPUES de que `credentials.ts` hubiera leido un
// `process.env` vacio.
import { DEMO_ARTIST_EMAIL, DEMO_ARTIST_PASSWORD } from "./lib/credentials";

const BASE_URL = process.env.SOCIAL_BASE_URL || "https://epk-dashboard.vercel.app";
const OUT_DIR = path.resolve(process.cwd(), "public/pressplay");

/** Por debajo de esto, una captura de página completa está en blanco. */
const MIN_BYTES = 6_000;

type Viewport = { name: string; width: number; height: number };

const VIEWPORTS: Viewport[] = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

type Theme = "light" | "dark";

/**
 * IDs reales de producción. Se comprobaron contra Turso (`docs/PHASE_P13.md`):
 * `rel-3085f506` es The Wall, una cabecera con 20 hijas — la página más rica
 * del catálogo. Un id inventado produce una captura de 404, que es exactamente
 * el fallo silencioso que este script existe para evitar.
 *
 * El selector es **propio de cada página**, no un `main` común. Se empezó con
 * `main` y falló en las dos páginas que más importan: la landing
 * (`app/page.tsx`) compone `LandingHero` / `LandingFeatures` /
 * `LandingHowItWorks` y no envuelve nada, y la ficha de release arranca con un
 * `<div className="min-h-screen">`. Ninguna de las dos tiene landmark `<main>`,
 * que además es un aviso de accesibilidad pendiente.
 *
 * Con selectores propios la comprobación además es **más fuerte**: `main`
 * aparecería en cualquier página que lo tuviera, mientras que `h1` con el texto
 * del catálogo solo aparece si esa ficha se ha resuelto de verdad.
 *
 * ## Por qué `necesitaSesion` está en cuatro de cinco y no al revés
 *
 * La primera versión capturaba todo con la sesión de artista puesta, porque era
 * más cómodo. Salió bien y **no se pudo publicar**: la landing salía con el CTA
 * "Ir al Dashboard" —que no le dice nada a quien llega de una red social— y el
 * navbar con el nombre de una persona real y su contador de notificaciones.
 *
 * Eso son dos cosas a la vez: una captura de marketing que no enseña lo que ve
 * quien llega, y datos personales de una cuenta de prueba en una imagen
 * destinada a ser pública. Una imagen ya publicada no se quita sin alcance.
 *
 * Así que solo `/dashboard` necesita sesión —es la única página que no existe
 * sin ella— y se captura aparte y con sesión. Todo lo demás, sin sesión, que es
 * exactamente lo que ve alguien que llega por primera vez.
 */
const PAGINAS: { nombre: string; ruta: string; selector: string; necesitaSesion: boolean }[] = [
  { nombre: "landing", ruta: "/", selector: "h1", necesitaSesion: false },
  { nombre: "release", ruta: "/releases/rel-3085f506", selector: "h1", necesitaSesion: false },
  { nombre: "artista", ruta: "/artists/art-1790740875070", selector: "main", necesitaSesion: false },
  { nombre: "shows", ruta: "/shows", selector: "main", necesitaSesion: false },
  { nombre: "dashboard", ruta: "/dashboard", selector: "main", necesitaSesion: true },
];

/**
 * Fija el tema **antes** de cada navegación.
 *
 * La clave es `epk-theme`, no `theme`: `components/ThemeToggle.tsx` y el script
 * anti-FOUC de `app/layout.tsx:44-55` usan esa. Poner `theme` no produce ningún
 * efecto y la captura sale siempre en oscuro, porque el default del proyecto es
 * oscuro.
 *
 * Se fija con `addInitScript` y no cambiando la clase después de cargar, por
 * dos razones: el script de arranque corre antes del paint, así que cambiar la
 * clase luego deja una captura con medio render en el tema anterior; y así no
 * depende de que el `<html>` ya exista.
 */
async function fijarTema(contexto: BrowserContext, tema: Theme): Promise<void> {
  await contexto.addInitScript((t) => {
    try {
      window.localStorage.setItem("epk-theme", t);
    } catch {
      // Storage bloqueado: se fuerza la clase, que es lo que manda para pintar.
      document.documentElement.classList.toggle("dark", t === "dark");
    }
  }, tema);
}

/**
 * Espera a que la página **haya terminado de pintarse**, no a que pase un rato.
 *
 * El primer intento usaba `waitForTimeout(600)` y produjo una captura de la
 * landing en oscuro con el hero vacío: solo el logo, en negro. No era un bug de
 * modo oscuro —el DOM, los colores y la geometría eran idénticos en claro y en
 * oscuro— sino que se había capturado a mitad de las animaciones de Framer
 * Motion: el logo anima sin retardo y ya estaba; el titular tiene `delay: 0.2`
 * más 0,6 s de duración y no.
 *
 * Y **el suelo de bytes no lo detectó**, que es la parte incómoda: una página a
 * medias tiene navbar, pie y titulares de sección, y pesa de sobra. Un umbral
 * de peso solo distingue "vacío" de "lleno", no "a medias" de "entero". Por eso
 * aquí se espera a que terminen las animaciones, y el peso se queda como red de
 * seguridad para lo que sí es una página vacía.
 */
async function esperarPintado(page: Page): Promise<void> {
  // 1) Los fondos CSS no son <img>, así que el waitForFunction de imágenes no
  //    los ve. Se extraen y se esperan a mano.
  await page.waitForFunction(
    async () => {
      const urls = new Set<string>();
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*")).slice(0, 800)) {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === "none") continue;
        for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(m[1]!);
      }
      await Promise.all(
        Array.from(urls).map(
          (u) =>
            new Promise<void>((res) => {
              const img = new Image();
              img.onload = img.onerror = () => res();
              img.src = u;
            }),
        ),
      );
      return true;
    },
    undefined,
    { timeout: 20_000 },
  );

  // 2) Y ningún elemento visible se queda a medio fundido. El titular es la
  //    señal: es lo primero con retardo, así que cuando él ha llegado, lo que
  //    viene detrás va por detrás.
  await page.waitForFunction(
    () => {
      const h1 = document.querySelector("h1");
      if (!h1) return true;
      return parseFloat(getComputedStyle(h1).opacity) > 0.99;
    },
    undefined,
    { timeout: 20_000 },
  );

  // Margen para los últimos frames y para que las imágenes ya pintadas
  // asienten. Corto a propósito: si algo no ha llegado en 20 s, las esperas de
  // arriba ya han fallado con un mensaje que dice qué pasó.
  await page.waitForTimeout(500);
}

async function capturar(
  page: Page,
  pagina: (typeof PAGINAS)[number],
  viewport: Viewport,
  tema: Theme,
): Promise<{ fichero: string; bytes: number }> {
  const fichero = `${pagina.nombre}-${viewport.name}-${tema}.jpg`;
  const destino = path.join(OUT_DIR, fichero);

  const url = `${BASE_URL}${pagina.ruta}`;
  const respuesta = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });

  const estado = respuesta?.status();
  if (estado && estado >= 400) {
    throw new Error(`${fichero}: ${url} respondió ${estado}. No se captura una página de error.`);
  }

  // 1) El contenido tiene que estar. Esto es lo que evita las capturas de 404
  //    "con éxito" que tienen los scripts anteriores.
  try {
    await page.waitForSelector(pagina.selector, { state: "attached", timeout: 20_000 });
  } catch {
    throw new Error(
      `${fichero}: ${url} respondió ${estado} pero no apareció \`${pagina.selector}\`. ` +
        `La página no renderizó; capturar ahora guardaría una imagen vacía.`,
    );
  }

  // El tema ya viene puesto desde el init script del contexto: la página
  // nace en su color. Aquí no hay que alternar nada.

  await esperarPintado(page);
  const buffer = await page.screenshot({
    path: destino,
    type: "jpeg",
    quality: 82,
    fullPage: true,
  });

  // 2) Y que pese algo. Un JPEG de página completa por debajo del suelo está
  //    en blanco, y un fichero en blanco publicado en redes no se puede quitar
  //    sin alcance.
  if (buffer.length < MIN_BYTES) {
    throw new Error(
      `${fichero}: ${buffer.length} bytes, por debajo del suelo de ${MIN_BYTES}. ` +
        `Eso es una captura en blanco, no un fallo de red.`,
    );
  }

  return { fichero, bytes: buffer.length };
}

/**
 * La sesión se hace **una vez** y se reutiliza en los dos contextos.
 *
 * ## Por qué la cuenta de DEMO y no la de artista de pruebas
 *
 * `/dashboard` es la única de las cinco rutas que no existe sin sesión, así que
 * hay que autenticarse para capturarla. Pero estas imágenes van a
 * `public/pressplay/`, que se sirve **sin autenticación** y está pensado para
 * publicarse en redes: capturar con `TEST_ARTIST_*` mete en un fichero público
 * el nombre, el correo y los contadores de notificaciones de una persona real.
 *
 * Las otras cuatro rutas ya se capturaban sin sesión por el mismo motivo — la
 * primera versión de la landing salió con el nombre real. Con esta, las cinco
 * rutas quedan limpias por el mismo motivo y por el mismo camino.
 *
 * Si faltan las credenciales de la demo, `/dashboard` se salta **visible**, no en
 * silencio: una captura que falta es un aviso; una captura con el nombre de
 * alguien es un problema que ya se publicó.
 */
async function autenticar(url: string): Promise<ReturnType<BrowserContext["storageState"]> | null> {
  // Las credenciales salen de `scripts/lib/credentials.ts` y no de
  // `process.env`: es el unico sitio donde vive un default, y este script lo
  // estaba leyendo directo. Consecuencia real: `DEMO_ARTIST_EMAIL` no estaba en
  // `.env.local`, `process.env` daba `undefined`, y el script se creia sin
  // credenciales — generaba cero capturas y salia con codigo de exito.
  const email = DEMO_ARTIST_EMAIL;
  const password = DEMO_ARTIST_PASSWORD;

  if (!email || !password) {
    console.log("  sin credenciales de la cuenta de demo: NO se capturará /dashboard");
    console.log("    (crear con: npx tsx scripts/create-demo-artist.ts --apply)");
    return null;
  }

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ locale: "es-ES" });
  const page = await contexto.newPage();
  try {
    await page.goto(`${url}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // La cookie de sesión es httpOnly: `document.cookie` no la ve. La única
    // señal observable desde la página es la URL, así que se espera a salir de
    // `/login`. El login contra Turso tarda, de ahí los 60 s.
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60_000 });
    console.log("  sesión de la cuenta de demo iniciada");
    return await contexto.storageState();
  } finally {
    await navegador.close();
  }
}

async function main(): Promise<void> {
  // `--only` regenera una sola pagina. Existe por una razon concreta: cambiar la
  // cuenta de las capturas de `/dashboard` no debería reescribir las otras 18,
  // que ya estan bien y cuyo unico cambio seria un nuevo timestamp en el
  // binario, haciendo el diff ilegible.
  const solo = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);

  const paginas = solo
    ? PAGINAS.filter((p) => p.nombre === solo)
    : PAGINAS;

  if (solo && paginas.length === 0) {
    const disponibles = PAGINAS.map((p) => p.nombre).join(", ");
    throw new Error(`--only=${solo} no coincide con ninguna pagina.\n  Disponibles: ${disponibles}`);
  }

  console.log(`\nP13 · capturas para redes sociales`);
  console.log(`  destino: ${OUT_DIR}`);
  console.log(`  base:    ${BASE_URL}`);
  if (solo) console.log(`  solo:    ${solo}`);
  console.log("");

  await mkdir(OUT_DIR, { recursive: true });

  // Autenticar cuesta un login contra Turso. Si lo filtrado no incluye ninguna
  // pagina con sesion, no se hace: es un segundo entero por nada.
  const haceFaltaSesion = paginas.some((p) => p.necesitaSesion);
  const sesion = haceFaltaSesion ? await autenticar(BASE_URL) : null;

  const hechas: { fichero: string; bytes: number }[] = [];
  const fallos: string[] = [];

  const navegador = await chromium.launch();
  try {
    // Un contexto por tema. `fijarTema` añade un init script que corre antes de
    // cada navegación, así que la página **nace** en su color en vez de
    // cambiar de color después de haber pintado.
    //
    // Y dos familias de contexto, porque la sesión no va en todas partes: las
    // cuatro páginas públicas se capturan sin ella, a propósito. Ver la nota
    // en PAGINAS.
    for (const tema of ["light", "dark"] as Theme[]) {
      for (const autenticado of [false, true]) {
        const contexto = await navegador.newContext({
          viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height },
          deviceScaleFactor: 1,
          locale: "es-ES",
          ...(autenticado && sesion ? { storageState: sesion } : {}),
        });
        await fijarTema(contexto, tema);
        const page = await contexto.newPage();

        for (const pagina of paginas) {
          if (pagina.necesitaSesion !== autenticado) continue;
          if (pagina.necesitaSesion && !sesion) {
            console.log(`  - ${pagina.nombre}: omitida, necesita sesión`);
            continue;
          }
          for (const viewport of VIEWPORTS) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            try {
              const r = await capturar(page, pagina, viewport, tema);
              hechas.push(r);
              console.log(`  ok ${r.fichero.padEnd(34)} ${(r.bytes / 1024).toFixed(0).padStart(4)} KB`);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              fallos.push(msg);
              console.error(`  FALLO ${msg}`);
            }
          }
        }
        await contexto.close();
      }
    }
  } finally {
    await navegador.close();
  }

  console.log(`\n${hechas.length} capturas, ${fallos.length} fallos`);

  // Cero capturas NO es un exito. Pasaba: sin credenciales de la demo, la
  // pagina se omitia con un "omitida, necesita sesion" y el script terminaba
  // con 0 capturas, 0 fallos y codigo de salida 0. Un set de capturas que se
  // regenera entero y se queda vacio es peor que no regenerarlo: deja las
  // imagenes viejas en su sitio y nadie se entera de que no se ha comprobado
  // nada.
  if (hechas.length === 0) {
    console.error("\nAbortando: no se ha generado ninguna captura.");
    process.exitCode = 1;
    return;
  }

  if (fallos.length > 0) {
    // Sale con código distinto de cero: un generador que falla tiene que poder
    // fallar en CI, o "aborta si está en blanco" es solo un texto.
    console.error("\nAbortando. No se genera un set parcial creíble.");
    process.exitCode = 1;
    return;
  }

  const bytesTotales = hechas.reduce((a, b) => a + b.bytes, 0);
  console.log(`  total: ${(bytesTotales / 1024 / 1024).toFixed(2)} MB en ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});