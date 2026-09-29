import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * RC29 — verificación visual de la rediseñada página /shows.
 *
 * Capturas (invitado, sin sesión) en claro/oscuro/móvil + comparación con
 * /dashboard y /artists/[id], más aserciones sobre el gradiente de marca, las
 * portadas de fallback (los shows reales no traen flyer) y los hrefs "Ver
 * tickets" (bug 404 por href relativo).
 *
 * Uso: BASE_URL=http://localhost:3105 npx tsx scripts/rc29-shows-visual.ts
 */

const BASE = process.env.BASE_URL || "http://localhost:3105";
const OUT = "tests/screenshots/rc29";

interface Report {
  base: string;
  capturas: string[];
  shows: Record<string, unknown>;
  errores: string[];
}

const errores: string[] = [];
const capturas: string[] = [];

/** Recorre la página para disparar los `whileInView` de framer-motion. */
async function settle(page: import("@playwright/test").Page) {
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.75));
    const max = document.body.scrollHeight;
    for (let y = 0; y <= max + step; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 160));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForTimeout(900);
}

async function newContext(
  browser: import("@playwright/test").Browser,
  scheme: "light" | "dark",
  opts: { mobile?: boolean; reducedMotion?: "reduce" | "no-preference" } = {}
) {
  return browser.newContext({
    // DPR 1 en móvil: la captura sale 390px de ancho (fácil de revisar) y el
    // layout es el mismo que con el descriptor de iPhone (verificado: nav
    // oculto, grid de 1 columna, scrollWidth 390).
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: scheme,
    reducedMotion: opts.reducedMotion ?? "no-preference",
    storageState: {
      cookies: [],
      origins: [{ origin: BASE, localStorage: [{ name: "epk-theme", value: scheme }] }],
    },
  });
}

/** /shows pide datos a /api/shows: esperamos a que se pinten las tarjetas (o
 *  el vacío) para no capturar los skeletons ni el SSR con opacity: 0. */
async function waitForShows(page: import("@playwright/test").Page) {
  await page
    .waitForSelector('main article, main p:has-text("No hay shows")', { timeout: 90_000 })
    .catch(() => undefined);
}

async function shot(
  context: import("@playwright/test").BrowserContext,
  route: string,
  file: string,
  fullPage = true
) {
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errores.push(`[${file}] console: ${msg.text().slice(0, 200)}`);
  });
  page.on("pageerror", (err) => errores.push(`[${file}] pageerror: ${err.message.slice(0, 200)}`));
  page.on("response", (res) => {
    if (res.status() === 401) errores.push(`[${file}] 401: ${new URL(res.url()).pathname}`);
  });

  const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (route.startsWith("/shows")) await waitForShows(page);
  await settle(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  await page.screenshot({ path: path.join(OUT, file), fullPage });
  capturas.push(file);
  const info = { http: res?.status() ?? 0, overflowX: overflow };
  await page.close();
  return info;
}

async function inspectShows(context: import("@playwright/test").BrowserContext, scheme: string) {
  const page = await context.newPage();
  await page.goto(`${BASE}/shows`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitForShows(page);
  await settle(page);

  const data = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("main a[href]"));
    const hrefs = anchors.map((a) => a.getAttribute("href") ?? "");
    const relativos = hrefs.filter((h) => h.length > 0 && !/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(h));
    const tickets = anchors
      .filter((a) => /ver tickets/i.test(a.textContent ?? ""))
      .map((a) => a.getAttribute("href"));

    // El <header> del sitio va primero en el DOM: hay que buscar el encabezado
    // con el gradiente de marca entre todos los headers.
    const headers = Array.from(document.querySelectorAll<HTMLElement>("header"));
    const gradientHeader = headers.find((h) =>
      getComputedStyle(h).backgroundImage.includes("linear-gradient")
    );
    const headerBg = gradientHeader ? getComputedStyle(gradientHeader).backgroundImage : "";

    const portadas = Array.from(
      document.querySelectorAll<HTMLElement>('main [aria-hidden="true"].bg-gradient-to-br')
    );
    const tarjetas = Array.from(document.querySelectorAll<HTMLElement>("main article"));

    const bodyStyle = getComputedStyle(document.body);
    const headerText = document.querySelector("h1")?.textContent?.trim() ?? "";

    // Contraste aproximado del texto blanco sobre la parte más clara del
    // gradiente (rosa-500) con la veladura negra del 30% encima.
    return {
      h1: headerText,
      gradientHeader: Boolean(gradientHeader),
      headerGradient: headerBg.slice(0, 140),
      portadasFallback: portadas.length,
      tarjetas: tarjetas.length,
      tarjetasOpacity: tarjetas.map((t) => getComputedStyle(t).opacity),
      hrefsTotales: hrefs.length,
      hrefsRelativos: relativos,
      botonesTickets: tickets,
      hayHrefsRotos: relativos.length > 0,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      darkClass: document.documentElement.classList.contains("dark"),
      bodyBg: bodyStyle.backgroundColor,
      etiquetas: Array.from(document.querySelectorAll("main label")).map((l) => l.textContent?.trim()),
      badgeEstados: Array.from(
        document.querySelectorAll<HTMLElement>("main article span.rounded-full")
      ).map((s) => s.textContent?.trim()),
      colores: {
        primarioTicket: (() => {
          const a = document.querySelector<HTMLAnchorElement>("main article a[href]");
          return a ? getComputedStyle(a).backgroundImage || getComputedStyle(a).backgroundColor : "sin-boton";
        })(),
      },
    };
  });

  await page.close();
  return { ...data, esquema: scheme };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const shows: Record<string, unknown> = {};

  // Calentamiento: la primera petición compila la ruta en dev y tarda; sin
  // esto la primera captura sale con skeletons y el SSR en opacity 0.
  const warm = await newContext(browser, "light");
  const warmPage = await warm.newPage();
  await warmPage.goto(`${BASE}/shows`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForShows(warmPage);
  await warmPage.close();
  await warm.close();

  // 1) /shows — escritorio claro y oscuro
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await newContext(browser, scheme);
    const info = await shot(ctx, "/shows", `shows-${scheme}.png`);
    shows[`desktop-${scheme}`] = info;
    shows[`inspeccion-${scheme}`] = await inspectShows(ctx, scheme);
    await ctx.close();
  }

  // 2) /shows — móvil 390px claro y oscuro
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await newContext(browser, scheme, { mobile: true });
    const info = await shot(ctx, "/shows", `shows-mobile-${scheme}.png`);
    shows[`mobile-${scheme}`] = info;
    await ctx.close();
  }

  // 3) /shows con prefers-reduced-motion: sin animación, todo visible
  const reduceCtx = await newContext(browser, "light", { reducedMotion: "reduce" });
  shows["reduced-motion"] = await shot(reduceCtx, "/shows", "shows-reduced-motion.png");
  const reducePage = await reduceCtx.newPage();
  await reducePage.goto(`${BASE}/shows`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitForShows(reducePage);
  await reducePage.waitForTimeout(2500);
  shows["reduced-motion-opacities"] = await reducePage.evaluate(() => {
    const h1 = document.querySelector("h1");
    // Contenedor de Reveal: con reduce debe ser un <div> plano (sin `style`
    // inline de framer-motion) y con opacidad 1.
    const wrapper = h1?.parentElement?.parentElement?.parentElement;
    return {
      h1Opacity: h1 ? getComputedStyle(h1).opacity : "sin-h1",
      wrapperTag: wrapper?.tagName ?? "?",
      wrapperStyle: wrapper?.getAttribute("style") ?? "sin-style",
      tarjetas: Array.from(document.querySelectorAll<HTMLElement>("main article")).map(
        (el) => getComputedStyle(el).opacity
      ),
    };
  });
  await reducePage.close();
  await reduceCtx.close();

  // 4) Comparación de consistencia con el resto del sitio
  const cmpLight = await newContext(browser, "light");
  shows["dashboard-light"] = await shot(cmpLight, "/dashboard", "compare-dashboard-light.png");
  shows["artists-light"] = await shot(cmpLight, "/artists/art-1788275587598", "compare-artist-light.png");
  await cmpLight.close();

  const cmpDark = await newContext(browser, "dark");
  shows["dashboard-dark"] = await shot(cmpDark, "/dashboard", "compare-dashboard-dark.png");
  shows["artists-dark"] = await shot(cmpDark, "/artists/art-1788275587598", "compare-artist-dark.png");
  await cmpDark.close();

  await browser.close();

  const report: Report = { base: BASE, capturas, shows, errores: [...new Set(errores)] };
  fs.writeFileSync(path.join(OUT, "report-rc29.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("=== Capturas ===");
  capturas.forEach((c) => console.log(`  ${OUT}/${c}`));
  console.log("=== /shows ===");
  console.log(JSON.stringify({ ...shows, capturas: undefined }, null, 2));
  console.log("=== Errores de consola/página ===");
  console.log(report.errores.length ? report.errores.join("\n") : "ninguno");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
