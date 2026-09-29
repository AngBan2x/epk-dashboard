/**
 * C1 / C7 / C2 — capturas headless de la página pública `/artists/[id]`.
 *
 * Qué comprueba, en este orden:
 *  1. Las EPKCard no están comprimidas (ancho de tarjeta + `title` en el h3).
 *  2. Los botones de redes tienen hueco respecto a BioSection (C7).
 *  3. El catálogo sale AGRUPADO por release: 3 tarjetas, no 11 (C2).
 *  4. "Ver los N restantes" despliega la lista del álbum.
 *  5. La cabecera del álbum enlaza a `/releases/[id]`.
 *
 * Uso:
 *   npx tsx scripts/rc29-artist-shots.ts seed --db <ruta/db>   (pobla rc29-*)
 *   npx tsx scripts/rc29-artist-shots.ts clean --db <ruta/db>  (borra rc29-*)
 *   npx tsx scripts/rc29-artist-shots.ts shots --base http://localhost:3210
 *   npx tsx scripts/rc29-artist-shots.ts all  --db ... --base ...
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "tests", "screenshots", "rc29");

const ARTIST_ID = "rc29-artist";
const ARTIST_NAME = "RC29 Luna Marea";
const ALBUM_ID = "rc29-album";
const SINGLE_ID = "rc29-single";
const SINGLE_B_ID = "rc29-single-b";

const ALBUM_COVER = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&q=80";
const SINGLE_COVER = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80";
const SINGLE_B_COVER = "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80";

const CHILD_TITLES = [
  "Neón frío",
  "Todo vuelve",
  "Ceniza y sal",
  "Interludio",
  "Marea baja",
  "Vidrio roto",
  "Última parada",
  "Amanecer",
];

const SOCIAL_LINKS = JSON.stringify([
  { platform: "spotify", url: "https://open.spotify.com/" },
  { platform: "instagram", url: "https://instagram.com/" },
  { platform: "youtube", url: "https://youtube.com/" },
  { platform: "tiktok", url: "https://www.tiktok.com/" },
  { platform: "x", url: "https://x.com/" },
]);

const METRICS = JSON.stringify({
  streams: 128400,
  saves: 4300,
  playlist_additions: 96,
  top_countries: [{ country: "ES", pct: 48 }, { country: "MX", pct: 17 }],
});

interface Args {
  mode: "seed" | "clean" | "shots" | "all";
  db: string;
  base: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const mode = (argv[0] ?? "all") as Args["mode"];
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (!["seed", "clean", "shots", "all"].includes(mode)) {
    throw new Error(`Modo desconocido: ${mode} (usa seed | clean | shots | all)`);
  }
  return {
    mode,
    db: get("--db") ?? path.join(process.cwd(), "data", "music_catalog.db"),
    base: get("--base") ?? "http://localhost:3210",
  };
}

function ensureSchema(db: import("better-sqlite3").Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      user_id TEXT,
      biography TEXT,
      press_text TEXT,
      press_highlights TEXT,
      genre TEXT,
      location TEXT,
      monthly_listeners INTEGER DEFAULT 0,
      social_links TEXT,
      profile_image TEXT,
      banner_image TEXT,
      slug TEXT,
      is_active INTEGER DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_name TEXT,
      release_type TEXT,
      release_date TEXT,
      duration TEXT,
      cover_image TEXT,
      audio_preview_url TEXT,
      spotify_url TEXT,
      youtube_video_id TEXT,
      itunes_track_id TEXT,
      metrics TEXT,
      production_details TEXT,
      lyrics TEXT,
      stems_urls TEXT,
      video_embed_url TEXT,
      gallery_images TEXT,
      external_links TEXT,
      disc_number INTEGER DEFAULT 1,
      track_number INTEGER,
      is_double_single INTEGER DEFAULT 0,
      sides_b TEXT,
      isrc TEXT,
      composers TEXT,
      genre TEXT,
      description TEXT,
      streams INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      updated_at TEXT,
      release_id TEXT,
      start_time REAL DEFAULT 0,
      end_time REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function seed(dbPath: string) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`No existe la DB local: ${dbPath}`);
  }
  const db = new Database(dbPath);
  ensureSchema(db);

  db.exec(`DELETE FROM tracks WHERE id LIKE 'rc29-%'`);
  db.exec(`DELETE FROM artists WHERE id = '${ARTIST_ID}'`);

  db.prepare(`
    INSERT OR REPLACE INTO artists
      (id, name, biography, press_text, press_highlights, genre, location,
       monthly_listeners, social_links, slug, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    ARTIST_ID,
    ARTIST_NAME,
    "RC29 Luna Marea nació en un sótano de Valencia con un sintetizador prestado y la idea fija de que la synth-pop todavía tiene cosas que decir. Desde su primer EP ha recorado salas pequeñas de media España con un directoAnalógico, calado y sin capas de más.",
    "«Un disco que se escucha entero a las tres de la mañana» — prensa especializada. Gira 2025 confirmada en 12 ciudades.",
    JSON.stringify(["Nominación al Premio Ondas a la mejor artista emergente", "128.400 reproducciones mensuales", "Telonera de la gira europea de 2024"]),
    "Synth-pop / Electrónica",
    "Valencia, España",
    48200,
    SOCIAL_LINKS,
    "rc29-luna-marea"
  );

  const insertTrack = db.prepare(`
    INSERT OR REPLACE INTO tracks (
      id, title, artist_name, release_type, release_date, duration, cover_image,
      audio_preview_url, metrics, genre, description, streams, status,
      disc_number, track_number, release_id, start_time, end_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertTrack.run(
    ALBUM_ID, ARTIST_NAME, ARTIST_NAME, "album", "2025-03-14", "34:12", ALBUM_COVER,
    "", METRICS, "Synth-pop", "Álbum debut de 8 pistas.", 128400, "approved",
    1, null, null, 0, 0
  );
  CHILD_TITLES.forEach((title, i) => {
    const n = i + 1;
    insertTrack.run(
      `rc29-t${n}`, title, ARTIST_NAME, "single", "2025-03-14", "4:12", ALBUM_COVER,
      "", METRICS, "Synth-pop", "", 12840, "approved",
      1, n, ALBUM_ID, i * 180, i * 180 + 252
    );
  });

  insertTrack.run(
    SINGLE_ID, "Tormenta de verano", ARTIST_NAME, "single", "2025-06-20", "3:47", SINGLE_COVER,
    "", METRICS, "Synth-pop", "", 45210, "approved",
    1, 1, null, 0, 227
  );
  insertTrack.run(
    SINGLE_B_ID, "Vidrio", ARTIST_NAME, "single", "2024-11-11", "3:05", SINGLE_B_COVER,
    "", METRICS, "Synth-pop", "", 30110, "approved",
    1, 1, null, 0, 185
  );

  db.close();
  console.log(`[seed] ${ARTIST_ID}: 1 álbum + ${CHILD_TITLES.length} pistas + 2 singles → ${dbPath}`);
}

/** Borra el artista de prueba. Útil: `npx tsx scripts/rc29-artist-shots.ts clean --db data/music_catalog.db` */
function clean(dbPath: string) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`No existe la DB local: ${dbPath}`);
  }
  const db = new Database(dbPath);
  const tracks = db.prepare(`DELETE FROM tracks WHERE id LIKE 'rc29-%'`).run();
  const artists = db.prepare(`DELETE FROM artists WHERE id = ?`).run(ARTIST_ID);
  db.close();
  console.log(`[clean] ${tracks.changes} tracks y ${artists.changes} artistas borrados de ${dbPath}`);
}

// ─── Capturas ────────────────────────────────────────────────────────────────

interface Measurements {
  cards: number;
  cardWidth: number | null;
  hasTitleAttr: boolean;
  socialGap: number | null;
  visibleRows: number;
  collapseLabel: string | null;
  errors: string[];
}

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`[PASS] ${name} — ${detail}`);
  else {
    failures += 1;
    console.log(`[FAIL] ${name} — ${detail}`);
  }
}

async function themedContext(browser: Browser, theme: "light" | "dark", mobile: boolean) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  await ctx.addInitScript((t: string) => {
    try {
      localStorage.setItem("epk-theme", t);
    } catch {
      /* noop */
    }
    if (t === "dark" && document.documentElement) document.documentElement.classList.add("dark");
  }, theme);
  return ctx;
}

async function measure(page: Page): Promise<Measurements> {
  // Las filas se cuentan DENTRO del panel del álbum: fuera están los botones de
  // play de las 3 EPKCard y no deben sumarse.
  return page.evaluate((albumId: string) => {
    const h3s = Array.from(document.querySelectorAll("h3[title]"));
    const first = h3s[0] as HTMLElement | undefined;
    const card = first ? (first.closest('[class*="overflow-hidden"]') as HTMLElement | null) : null;
    const social = document.querySelector('[role="list"][aria-label^="Redes sociales"]');
    const socialBox = social?.parentElement?.getBoundingClientRect();
    const bio = Array.from(document.querySelectorAll("section")).find((s) =>
      (s.textContent ?? "").includes("Biograf")
    );
    const bioBox = bio?.getBoundingClientRect();
    const albumLink = document.querySelector(`a[href="/releases/${albumId}"]`);
    const panel = albumLink?.parentElement ?? null;
    const rows = panel
      ? panel.querySelectorAll('button[aria-label="Reproducir"], button[aria-label="Pausar"]')
      : [];
    const collapse = Array.from(panel?.querySelectorAll("button") ?? []).find((b) =>
      /^Ver los \d+ restantes$/.test((b.textContent ?? "").trim())
    );
    const visibleRows = rows.length;
    return {
      cards: h3s.length,
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : null,
      hasTitleAttr: !!first && (first.getAttribute("title") ?? "").length > 0,
      socialGap:
        socialBox && bioBox ? Math.round(bioBox.top - socialBox.bottom) : null,
      visibleRows,
      collapseLabel: collapse ? (collapse.textContent ?? "").trim() : null,
      errors: [],
    };
  }, ALBUM_ID);
}

async function openArtist(page: Page, base: string): Promise<number> {
  const url = `${base}/artists/${ARTIST_ID}`;
  // 2 intentos: `next dev` puede reiniciar el worker y cortar una conexión.
  let resp: Awaited<ReturnType<Page["goto"]>> = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2 && !resp; attempt++) {
    try {
      resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      lastErr = e;
      await page.waitForTimeout(3000);
    }
  }
  if (!resp) throw lastErr;
  await page.getByText("Lanzamientos").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  return resp?.status() ?? 0;
}

/**
 * Captura full-page. Vuelve a scroll 0 antes: el header es `fixed` y, si la
 * página quedó scrolleada (p. ej. tras hacer click en un botón), Playwright lo
 * pinta a media altura en la captura.
 */
async function snap(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
}

async function shots(base: string) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await runShots(browser, base);
  } finally {
    // Si algo lanza (p. ej. la página no carga), cerrar igualmente el browser:
    // sin esto el proceso queda vivo por el hijo de Chromium y no termina.
    await browser.close().catch(() => undefined);
  }
}

/** Cambia de tema SIN recargar: Tailwind usa `dark:` con la clase en <html>. */
async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t: string) => {
    const el = document.documentElement;
    if (t === "dark") el.classList.add("dark");
    else el.classList.remove("dark");
    try {
      localStorage.setItem("epk-theme", t);
    } catch {
      /* noop */
    }
  }, theme);
  await page.waitForTimeout(500);
}

/**
 * Todo en UN SOLO contexto y con 3 navegaciones:
 * `next dev` (Node 24 + Next 14.2) se cae con un assertion de V8 al cerrar un
 * contexto de Playwright y abrir otro, y el worker muerto deja ERR_CONNECTION_REFUSED.
 */
async function runShots(browser: Browser, base: string) {
  const artistUrl = `${base}/artists/${ARTIST_ID}`;
  const ctx = await themedContext(browser, "light", false);
  try {
    const page = await ctx.newPage();

    // 1. Escritorio claro
    const status = await openArtist(page, base);
    check("GET /artists/[id] (claro)", status === 200, `HTTP ${status}`);
    const light = await measure(page);
    check(
      "C2 · agrupación",
      light.cards === 3,
      `${light.cards} EPKCards (esperadas 3: álbum + 2 singles)`
    );
    check(
      "C1 · ancho de tarjeta",
      light.cardWidth !== null && light.cardWidth >= 250,
      `${light.cardWidth}px (antes 198px)`
    );
    check("C1 · title en el h3 truncado", light.hasTitleAttr, `title attr = ${light.hasTitleAttr}`);
    check(
      "C7 · hueco redes → Bio",
      light.socialGap !== null && light.socialGap >= 20,
      `${light.socialGap}px (mb-6 = 24px)`
    );
    check(
      "C2 · lista colapsada a 6",
      light.visibleRows === 6 && light.collapseLabel === "Ver los 2 restantes",
      `${light.visibleRows} filas · botón "${light.collapseLabel}"`
    );
    await snap(page, "artist-light.png");

    // 2. Escritorio oscuro (mismo contexto, solo la clase `dark`)
    await setTheme(page, "dark");
    const dark = await measure(page);
    check("C2 · agrupación (oscuro)", dark.cards === 3, `${dark.cards} EPKCards`);
    check(
      "C7 · hueco redes → Bio (oscuro)",
      dark.socialGap !== null && dark.socialGap >= 20,
      `${dark.socialGap}px`
    );
    await snap(page, "artist-dark.png");

    // 3. "Ver los 2 restantes"
    const btn = page.getByRole("button", { name: /^Ver los \d+ restantes$/ });
    if ((await btn.count()) > 0) {
      await btn.first().click();
      await page.waitForTimeout(600);
      const after = await measure(page);
      check(
        "C2 · Ver los N restantes",
        after.visibleRows === 8 && after.collapseLabel === null,
        `${after.visibleRows} filas tras desplegar`
      );
      await snap(page, "artist-dark-expanded.png");
    } else {
      check("C2 · Ver los N restantes", false, "no se encontró el botón de colapso");
    }

    // 4. Enlace de la cabecera del álbum → /releases/[id]
    const link = page.locator(`a[href="/releases/${ALBUM_ID}"]`);
    check(
      "C2 · cabecera enlaza a /releases",
      (await link.count()) > 0,
      `a[href="/releases/${ALBUM_ID}"]`
    );
    if ((await link.count()) > 0) {
      await link.first().click();
      await page.waitForURL(`**/releases/${ALBUM_ID}`, { timeout: 30000 });
      await page.waitForTimeout(1200);
      const url = page.url();
      check("C2 · navegación a /releases/[id]", url.includes(`/releases/${ALBUM_ID}`), url);
      const body = (await page.textContent("body")) ?? "";
      check(
        "C2 · la lista de pistas se ve en /releases",
        body.includes("Neón frío") && body.includes("Amanecer"),
        "pistas del álbum en la página del release"
      );
      await snap(page, "release-detail-dark.png");
    }

    // 5. Móvil 390px (mismo contexto: solo viewport + tema)
    const back = await page.goto(artistUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    check("vuelta a /artists/[id] para móvil", (back?.status() ?? 0) === 200, `HTTP ${back?.status()}`);
    await page.getByText("Lanzamientos").first().waitFor({ timeout: 30000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, "light");
    const mobLight = await measure(page);
    check(
      "móvil 390 (light) · contenido",
      mobLight.cards === 3 && mobLight.visibleRows === 6,
      `${mobLight.cards} tarjetas · ${mobLight.visibleRows} filas visibles`
    );
    await snap(page, "artist-mobile-390-light.png");

    await setTheme(page, "dark");
    const mobDark = await measure(page);
    check(
      "móvil 390 (dark) · contenido",
      mobDark.cards === 3 && mobDark.visibleRows === 6,
      `${mobDark.cards} tarjetas · ${mobDark.visibleRows} filas visibles`
    );
    await snap(page, "artist-mobile-390-dark.png");
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function main() {
  const args = parseArgs();
  if (args.mode === "seed") {
    seed(args.db);
    return;
  }
  if (args.mode === "clean") {
    clean(args.db);
    return;
  }
  if (args.mode === "all") seed(args.db);
  await shots(args.base);
  if (failures > 0) {
    console.error(`\n${failures} comprobación(es) fallida(s)`);
    process.exitCode = 1;
  } else {
    console.log(`\nTodas las comprobaciones OK · capturas en ${OUT}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

