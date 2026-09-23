import { chromium } from "@playwright/test";
import * as fs from "fs";

// Download test: both EPK export buttons trigger real file downloads (prod, artist).
const BASE = "https://epk-dashboard.vercel.app";
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const pass = (n: string, d = "") => { results.push({ name: n, ok: true, detail: d }); console.log(`[PASS] ${n} ${d}`); };
const fail = (n: string, d = "") => { results.push({ name: n, ok: false, detail: d }); console.log(`[FAIL] ${n} — ${d}`); };

async function main() {
  const headed = process.env.HEADED === "1";
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 45000 });
  const form = page.locator("form").first();
  await form.waitFor({ timeout: 20000 });
  await form.locator('input[type="email"]').fill("angab06@gmail.com");
  await form.locator('input[type="password"]').fill("12345678");
  const lp = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60000 });
  await form.locator('button[type="submit"]').click();
  if ((await lp).status() !== 200) { fail("login", "failed"); await browser.close(); process.exit(1); }
  pass("login", "200");
  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 45000 });
  try { await page.waitForSelector("h2", { timeout: 25000 }); } catch {}
  await page.waitForTimeout(3000);

  for (const fmt of ["JSON", "HTML"] as const) {
    const btn = page.getByRole("button", { name: new RegExp(`Descargar dossier en ${fmt}`, "i") }).first();
    if ((await btn.count()) === 0) { fail(`export ${fmt} button`, "not found"); continue; }
    pass(`export ${fmt} button`, "visible");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      btn.click(),
    ]);
    const path = await download.path().catch(() => null);
    const name = download.suggestedFilename();
    const okExt = name.toLowerCase().endsWith(fmt.toLowerCase() === "json" ? ".json" : ".html");
    if (path && okExt) pass(`export ${fmt} download`, name);
    else fail(`export ${fmt} download`, `path=${!!path} name=${name}`);
    await page.waitForTimeout(3500); // let status reset to idle
  }
  await page.screenshot({ path: "tests/screenshots/export-buttons-check.png" });
  await browser.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n=== EXPORT DOWNLOAD: ${results.length - bad.length} PASS / ${bad.length} FAIL ===`);
  if (bad.length) process.exit(1);
}
main().catch((e) => { console.error("CRASH", e); process.exit(2); });
