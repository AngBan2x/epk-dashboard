import { chromium } from "@playwright/test";
import * as fs from "fs";

// HEADED visual verification: gallery buttons appear after same-page login (bug 1),
// no edit/delete on fallback images (bug 2). Screenshots to tests/screenshots/verify-fixes/.
const BASE = "https://epk-dashboard.vercel.app";
const TRACK = "b55c7033-66a7-42f2-84ad-dd4c225f3307"; // Sad Winter Song (gallery empty -> fallbacks)
const OUT = "tests/screenshots/verify-fixes";
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const pass = (n: string, d = "") => { results.push({ name: n, ok: true, detail: d }); console.log(`[PASS] ${n} ${d}`); };
const fail = (n: string, d = "") => { results.push({ name: n, ok: false, detail: d }); console.log(`[FAIL] ${n} — ${d}`); };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // 1. Guest: gallery without owner controls
  await page.goto(`${BASE}/track/${TRACK}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(4000);
  await page.locator("text=Galería de Prensa").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/1-guest-gallery.png` });
  const guestUpload = await page.getByRole("button", { name: "+ Subir" }).count();
  if (guestUpload === 0) pass("guest: no + Subir");
  else fail("guest: no + Subir", "upload button visible for guest");

  // 2. Login ON the page via header "Iniciar Sesión" (same flow as the reported bug: no navigation)
  const headerLogin = page.getByRole("button", { name: "Iniciar Sesión" }).first();
  await headerLogin.waitFor({ timeout: 15000 });
  await headerLogin.click();
  await page.waitForTimeout(1500);
  const email = page.locator('input[type="email"]');
  await email.waitFor({ timeout: 15000 });
  await email.fill("angab06@gmail.com");
  await page.locator('input[type="password"]').fill("12345678");
  const lp = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60000 });
  await page.locator('button[type="submit"]').click();
  const loginOk = (await lp).status() === 200;
  if (!loginOk) { fail("same-page login", "login failed"); await browser.close(); process.exit(1); }
  pass("same-page login", "200");
  await page.waitForTimeout(5000); // AuthContext propagates -> wrapper re-evaluates isOwner

  // 3. Owner controls appear WITHOUT reload (bug 1)
  await page.locator("text=Galería de Prensa").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1000);
  const subir = await page.getByRole("button", { name: "+ Subir" }).count();
  if (subir > 0) pass("owner: + Subir appears without reload");
  else fail("owner: + Subir appears without reload", "absent after login");
  await page.screenshot({ path: `${OUT}/2-owner-gallery-noreload.png` });

  // 4. Fallbacks: NO edit/delete buttons (bug 2)
  const editCount = await page.getByRole("button", { name: "Editar" }).count();
  const delCount = await page.getByRole("button", { name: "Eliminar" }).count();
  if (editCount === 0 && delCount === 0) pass("fallbacks: no edit/delete");
  else fail("fallbacks: no edit/delete", `editar=${editCount} eliminar=${delCount}`);
  await page.screenshot({ path: `${OUT}/3-fallbacks-no-crud.png` });

  await browser.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n=== VERIFY-FIXES: ${results.length - bad.length} PASS / ${bad.length} FAIL ===`);
  if (bad.length) process.exit(1);
}
main().catch((e) => { console.error("CRASH", e); process.exit(2); });
