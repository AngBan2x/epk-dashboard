import { chromium, BrowserContext, Page } from "@playwright/test";
import * as fs from "fs";

const BASE = "https://epk-dashboard.vercel.app";
const OUT = "tests/screenshots/prod-exhaustive";
const TRACK = "b55c7033-66a7-42f2-84ad-dd4c225f3307"; // Sad Winter Song
const ARTIST = "art-1788275587598"; // Angel Bandres

interface R { name: string; ok: boolean; detail: string; }
const results: R[] = [];
function pass(name: string, detail = "") { results.push({ name, ok: true, detail }); console.log(`[PASS] ${name} ${detail}`); }
function fail(name: string, detail = "") { results.push({ name, ok: false, detail }); console.log(`[FAIL] ${name} — ${detail}`); }

async function shot(page: Page, role: string, theme: string, name: string) {
  const dir = `${OUT}/${role}/${theme}`;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
}

// Returns console errors + failed request URLs seen during fn
async function watchErrors(page: Page): Promise<{ errs: string[]; bad: string[] }> {
  const errs: string[] = [];
  const bad: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
  return { errs, bad };
}

async function expectPage(page: Page, role: string, theme: string, name: string, url: string,
  opts: { mustContain?: string[]; mustNotContain?: string[]; expectRedirect?: string; shotName?: string; tolerateConsole404?: boolean }) {
  const { errs, bad } = await watchErrors(page);
  let resp = null;
  try {
    resp = await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    fail(`${role}/${theme} ${name}`, `goto timeout: ${url}`);
    return;
  }
  await page.waitForTimeout(2500);
  const status = resp?.status() ?? 0;
  const finalUrl = page.url();
  const body = (await page.textContent("body")) ?? "";
  const norm = body.replace(/\s+/g, " ");

  if (opts.expectRedirect) {
    if (finalUrl.includes(opts.expectRedirect)) pass(`${role}/${theme} ${name}`, `redirect→${opts.expectRedirect}`);
    else fail(`${role}/${theme} ${name}`, `expected redirect ${opts.expectRedirect}, at ${finalUrl}`);
    return;
  }
  if (status >= 400) { fail(`${role}/${theme} ${name}`, `HTTP ${status}`); return; }
  const appErr = /Application error|Something went wrong|Error boundary/i.test(norm);
  if (appErr) { fail(`${role}/${theme} ${name}`, "error boundary visible"); await shot(page, role, theme, (opts.shotName ?? name) + "-ERROR"); return; }
  for (const t of opts.mustContain ?? []) {
    if (!norm.includes(t)) { fail(`${role}/${theme} ${name}`, `missing "${t}"`); await shot(page, role, theme, (opts.shotName ?? name) + "-MISS"); return; }
  }
  for (const t of opts.mustNotContain ?? []) {
    if (norm.includes(t)) { fail(`${role}/${theme} ${name}`, `forbidden "${t}" present`); return; }
  }
  let fatal = errs.filter((e) => !/favicon|Failed to load resource.*401/i.test(e));
  // admin has no artist profile: /api/artists/me 404 is by design (blank form).
  // Response-level check already tolerates it; suppress its console duplicate only where flagged.
  if (opts.tolerateConsole404) fatal = fatal.filter((e) => !/Failed to load resource[^]*404/.test(e));
  // Expected noise: guest /api/auth/me 401 (no session) and profile /api/artists/me 404 (no artist yet — handled as blank form)
  const tolerated = [/^401 \/api\/auth\/me$/, /^404 \/api\/artists\/me$/];
  const real404 = bad.filter((b) => !/^404 \/favicon\.ico/.test(b) && !tolerated.some((t) => t.test(b)));
  await shot(page, role, theme, opts.shotName ?? name);
  if (real404.length) fail(`${role}/${theme} ${name}`, `HTTP errors: ${real404.slice(0, 3).join(" | ")}`);
  else if (fatal.length) fail(`${role}/${theme} ${name}`, `console errors: ${fatal.slice(0, 2).join(" | ")}`);
  else pass(`${role}/${theme} ${name}`, `HTTP ${status}`);
}

async function login(ctx: BrowserContext, email: string, pw: string): Promise<boolean> {
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 45000 });
  const form = page.locator("form").first();
  await form.waitFor({ timeout: 20000 });
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').fill(pw);
  const p = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60000 });
  await form.locator('button[type="submit"]').click();
  let ok = false;
  try {
    const r = await p;
    ok = r.status() === 200;
  } catch { ok = false; }
  await page.waitForTimeout(4000);
  await page.close();
  return ok;
}

async function themedContext(browser: any, theme: "light" | "dark", storage?: string) {
  const ctx = await browser.newContext(storage ? { storageState: storage } : {});
  await ctx.addInitScript((t: string) => {
    try { localStorage.setItem("epk-theme", t); } catch { /* noop */ }
    if (t === "dark" && document.documentElement) document.documentElement.classList.add("dark");
  }, theme);
  return ctx;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const themes: ("light" | "dark")[] = ["light", "dark"];

  // ---------- GUEST ----------
  for (const theme of themes) {
    const ctx = await themedContext(browser, theme);
    const page = await ctx.newPage();
    await expectPage(page, "guest", theme, "home", "/", { mustContain: ["PressPlay"], shotName: "home" });
    await expectPage(page, "guest", theme, "login", "/login", { mustContain: ["Iniciar Sesión", "Email"], shotName: "login" });
    await expectPage(page, "guest", theme, "register", "/register", { mustContain: ["PressPlay"], shotName: "register" });
    await expectPage(page, "guest", theme, "artists", "/artists", { mustContain: ["Angel Bandres"], shotName: "artists" });
    await expectPage(page, "guest", theme, "artist-detail", `/artists/${ARTIST}`, { mustContain: ["Angel Bandres"], shotName: "artist-detail" });
    await expectPage(page, "guest", theme, "track-detail", `/track/${TRACK}`, { mustContain: ["Sad Winter Song"], shotName: "track-detail" });
    await expectPage(page, "guest", theme, "release-detail", `/releases/${TRACK}`, { mustContain: ["Sad Winter Song"], shotName: "release-detail" });
    await expectPage(page, "guest", theme, "shows", "/shows", { mustContain: ["PressPlay"], shotName: "shows" });
    // /dashboard is intentionally public (guest view); only /admin /profile /account /releases/new require auth
    await expectPage(page, "guest", theme, "dashboard-guest", "/dashboard", { mustContain: ["PressPlay"], shotName: "dashboard-guest" });
    await expectPage(page, "guest", theme, "admin-redirect", "/admin", { expectRedirect: "/login" });
    await expectPage(page, "guest", theme, "profile-redirect", "/profile", { expectRedirect: "/login" });
    await expectPage(page, "guest", theme, "account-redirect", "/account", { expectRedirect: "/login" });
    await expectPage(page, "guest", theme, "releases-new-redirect", "/releases/new", { expectRedirect: "/login" });
    await page.close(); await ctx.close();
  }

  // ---------- ARTIST ----------
  {
    const lctx = await browser.newContext();
    console.log("ARTIST LOGIN...");
    if (!(await login(lctx, "angab06@gmail.com", "12345678"))) { fail("artist login", "login failed"); }
    else {
      pass("artist login", "200");
      await lctx.storageState({ path: "prod-artist.json" });
    }
    await lctx.close();
  }
  for (const theme of themes) {
    const ctx = await themedContext(browser, theme, "prod-artist.json");
    const page = await ctx.newPage();
    await expectPage(page, "artist", theme, "dashboard", "/dashboard", { mustContain: ["PressPlay"], mustNotContain: ["Iniciar Sesión"], shotName: "dashboard" });
    await expectPage(page, "artist", theme, "profile", "/profile", { mustContain: ["PressPlay"], shotName: "profile" });
    await expectPage(page, "artist", theme, "account", "/account", { mustContain: ["PressPlay"], shotName: "account" });
    await expectPage(page, "artist", theme, "releases-new", "/releases/new", { mustContain: ["PressPlay"], shotName: "releases-new" });
    await expectPage(page, "artist", theme, "release-edit", `/releases/${TRACK}/edit`, { mustContain: ["PressPlay"], shotName: "release-edit" });
    await expectPage(page, "artist", theme, "admin-redirect", "/admin", { expectRedirect: "/dashboard" });
    await page.close(); await ctx.close();
  }

  // ---------- ADMIN ----------
  {
    const lctx = await browser.newContext();
    console.log("ADMIN LOGIN...");
    await new Promise((r) => setTimeout(r, 65000)); // rate-limit cooldown
    if (!(await login(lctx, "admin@epk.local", "admin123"))) { fail("admin login", "login failed"); }
    else {
      pass("admin login", "200");
      await lctx.storageState({ path: "prod-admin.json" });
    }
    await lctx.close();
  }
  for (const theme of themes) {
    const ctx = await themedContext(browser, theme, "prod-admin.json");
    const page = await ctx.newPage();
    await expectPage(page, "admin", theme, "dashboard", "/dashboard", { mustContain: ["PressPlay"], shotName: "dashboard" });
    await expectPage(page, "admin", theme, "admin-panel", "/admin", { mustContain: ["Panel de Administración"], shotName: "admin-panel" });
    await expectPage(page, "admin", theme, "approvals", "/admin/approvals", { mustContain: ["PressPlay"], shotName: "approvals" });
    await expectPage(page, "admin", theme, "profile", "/profile", { mustContain: ["PressPlay"], shotName: "profile", tolerateConsole404: true });
    await expectPage(page, "admin", theme, "account", "/account", { mustContain: ["PressPlay"], shotName: "account" });
    await page.close(); await ctx.close();
  }

  await browser.close();
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok);
  console.log(`\n=== PROD EXHAUSTIVE: ${ok} PASS / ${bad.length} FAIL ===`);
  for (const b of bad) console.log(`  FAIL: ${b.name} — ${b.detail}`);
  fs.rmSync("prod-artist.json", { force: true });
  fs.rmSync("prod-admin.json", { force: true });
  if (bad.length) process.exit(1);
}
main().catch((e) => { console.error("CRASH", e); process.exit(2); });
