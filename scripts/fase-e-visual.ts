/**
 * Fase E — verificación visual y medición del N+1 de YouTube.
 *
 * Levanta capturas de /artists/[id] y /dashboard en claro y oscuro, y cuenta
 * las peticiones a /api/youtube/stats que hace el navegador en cada página.
 * Uso: npx tsx scripts/fase-e-visual.ts [baseUrl] [outDir]
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "fs/promises";
import path from "path";

const BASE = process.argv[2] || "http://localhost:3200";
const OUT = process.argv[3] || path.join(process.cwd(), "tests", "screenshots", "rc29");
const ARTIST_ID = process.env.FASE_E_ARTIST || "art-1788275587598";
const TRACK_ID = "7c922875-54c5-4670-8940-98b07403f691";

const STATS_RE = /\/api\/youtube\/stats/;

interface PageReport {
  page: string;
  theme: "light" | "dark";
  youtubeStatsRequests: string[];
  cards: number;
  consoleErrors: string[];
}

const reports: PageReport[] = [];

async function login(ctx: BrowserContext, email: string, pw: string): Promise<boolean> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const form = page.locator("form").first();
  await form.waitFor({ timeout: 60000 });
  // En dev el primer render compila varios segundos: sin esta espera el clic
  // llega antes de que React hidrate y el submit no dispara nada.
  await page.waitForTimeout(4000);
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').fill(pw);
  const res = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 120000 });
  await form.locator('button[type="submit"]').click();
  let ok = false;
  try {
    ok = (await res).status() === 200;
  } catch {
    ok = false;
  }
  await page.waitForTimeout(3000);
  await page.close();
  return ok;
}

async function themedContext(browser: Browser, theme: "light" | "dark"): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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

async function visit(page: Page, urlPath: string, theme: "light" | "dark", shot: string) {
  const reqs: string[] = [];
  const errors: string[] = [];
  const onReq = (r: { url(): string }) => {
    if (STATS_RE.test(r.url())) reqs.push(r.url().replace(BASE, ""));
  };
  const onErr = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("request", onReq);
  page.on("console", onErr);

  await page.goto(`${BASE}${urlPath}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(6000);
  const cards = await page.locator("a[href^='/track/']").count();
  await page.screenshot({ path: path.join(OUT, shot), fullPage: true });

  page.off("request", onReq);
  page.off("console", onErr);
  reports.push({ page: urlPath, theme, youtubeStatsRequests: reqs, cards, consoleErrors: errors });
  console.log(
    `  ${urlPath} [${theme}] → peticiones /api/youtube/stats: ${reqs.length}${reqs.length ? ` (${reqs.join(", ")})` : ""}`,
  );
}

/** Lee los `title` (tooltips) de las celdas de métricas de un track. */
async function dumpMetricTooltips(page: Page, urlPath: string, theme: "light" | "dark") {
  const reqs: string[] = [];
  const onReq = (r: { url(): string }) => {
    if (STATS_RE.test(r.url())) reqs.push(r.url().replace(BASE, ""));
  };
  page.on("request", onReq);
  await page.goto(`${BASE}${urlPath}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(6000);
  const cells = await page.evaluate(() => {
    const out: Array<{ value: string; label: string; note: string; title: string }> = [];
    document.querySelectorAll<HTMLElement>("div.grid p[title]").forEach((p) => {
      const parent = p.parentElement;
      const label = parent?.querySelectorAll("p")[1]?.textContent?.trim() ?? "";
      const note = parent?.querySelectorAll("p")[2]?.textContent?.trim() ?? "";
      out.push({
        value: p.childNodes[0]?.textContent?.trim() ?? "",
        label,
        note,
        title: p.getAttribute("title") ?? "",
      });
    });
    return out;
  });
  page.off("request", onReq);
  await page.screenshot({ path: path.join(OUT, `track-${theme}.png`), fullPage: true });
  console.log(`\n  /track/${TRACK_ID} [${theme}] → peticiones /api/youtube/stats: ${reqs.length}`);
  for (const c of cells) {
    console.log(
      `    ${c.label}: "${c.value}"  nota="${c.note}"  title="${c.title}"`,
    );
  }
  return { reqs: reqs.length, cells };
}

/** Títulos de los contadores de las tarjetas de un grid. */
async function dumpCardTooltips(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const t = el.getAttribute("title");
      if (t) out.push(`${el.textContent?.trim()} → ${t}`);
    });
    return out;
  }, selector);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const admin = { email: "admin@epk.local", pw: "CONTRASENA_ADMIN_ROTADA" };

  for (const theme of ["light", "dark"] as const) {
    console.log(`\n=== ${theme} ===`);
    const ctx = await themedContext(browser, theme);
    const ok = await login(ctx, admin.email, admin.pw);
    console.log(`  login admin: ${ok ? "OK" : "FALLO"}`);

    const firstPage = await ctx.newPage();
    await visit(firstPage, `/artists/${ARTIST_ID}`, theme, `artists-${theme}.png`);
    await visit(await ctx.newPage(), `/dashboard`, theme, `dashboard-${theme}.png`);
    const trackPage = await ctx.newPage();
    const trackInfo = await dumpMetricTooltips(trackPage, `/track/${TRACK_ID}`, theme);

    const artistsPage = await ctx.newPage();
    await artistsPage.goto(`${BASE}/artists/${ARTIST_ID}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const tooltips = await dumpCardTooltips(artistsPage, "span[title]");
    console.log(`  tooltips de tarjetas en /artists/${ARTIST_ID}:`);
    for (const t of tooltips.slice(0, 6)) console.log(`    ${t}`);

    await ctx.close();
    console.log(`  (track: ${trackInfo.reqs} petición/es, ${trackInfo.cells.length} celdas)`);
  }

  await browser.close();

  console.log("\n=== RESUMEN DE PETICIONES A /api/youtube/stats (lado navegador) ===");
  for (const r of reports) {
    console.log(
      `  ${r.page} [${r.theme}] → ${r.youtubeStatsRequests.length} (tarjetas en la página: ${r.cards})`,
    );
  }
  const errs = reports.flatMap((r) => r.consoleErrors).filter((e) => !/favicon|401 \/api\/auth\/me/i.test(e));
  console.log(`\nErrores de consola (filtrados): ${errs.length}`);
  for (const e of errs.slice(0, 10)) console.log(`  ${e}`);
}

main().catch((e) => {
  console.error("FALLO:", e);
  process.exit(1);
});
