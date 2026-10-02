import { chromium } from "@playwright/test";
import fs from "node:fs";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./lib/credentials";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
const results: string[] = [];

async function main() {
  fs.mkdirSync("screenshots/t1", { recursive: true });
  const browser = await chromium.launch();
  const anon = await browser.newContext();

  const post = async (ctx: Awaited<ReturnType<typeof browser.newContext>>, url: string, data?: unknown) =>
    ctx.request.post(`${BASE}${url}`, {
      headers: { "Content-Type": "application/json" },
      data: data ?? {},
    });

  const closed: Array<[string, number]> = [];
  for (const url of ["/api/sync", "/api/webhooks/metrics"]) {
    const res = await post(anon, url, { track_id: "trk-001", date: "2026-01-01", source: "x" });
    closed.push([url, res.status()]);
  }
  const streams = await post(anon, "/api/tracks/trk-001/streams", {});
  closed.push(["/api/tracks/:id/streams", streams.status()]);
  const cleanup = await anon.request.delete(`${BASE}/api/shows/cleanup`);
  closed.push(["/api/shows/cleanup (DELETE)", cleanup.status()]);
  results.push(
    "Endpoints sin sesion: " + closed.map(([u, s]) => `${u}=${s}`).join(", ")
  );

  const adminCtx = await browser.newContext();
  const login = await post(adminCtx, "/api/auth/login", ADMIN);
  results.push(`login admin: ${login.status()}`);

  const artistless = await adminCtx.request.get(`${BASE}/api/admin/approvals?status=all`);
  const body = await artistless.json();
  results.push(
    `GET /api/admin/approvals admin: ${artistless.status()} · artistless_count=${body.artistless_count} · submissions=${body.submissions?.length} · muestra=${JSON.stringify(body.submissions?.[0]?.artist_has_owner)}`
  );

  const page = await adminCtx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/admin/approvals`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const badge = await page.locator("text=Sin cuenta vinculada").count();
  const warn = await page.locator("text=sin cuenta vinculada").count();
  const pag = await page.locator("text=/Pagina .* de /").count();
  results.push(`admin/approvals: badge=${badge} aviso=${warn} paginacion=${pag}`);
  await page.screenshot({ path: "screenshots/t1/admin-approvals.png", fullPage: true });

  console.log(results.join("\n"));
  console.log("errores de pagina:", errors.length ? errors.join("; ") : "ninguno");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
