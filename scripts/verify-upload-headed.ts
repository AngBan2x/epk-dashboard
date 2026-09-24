import { chromium } from "@playwright/test";
import * as fs from "fs";
const BASE = "https://epk-dashboard.vercel.app";
const TRACK = "b55c7033-66a7-42f2-84ad-dd4c225f3307";
const OUT = "tests/screenshots/verify-fixes";
const PNG_PATH = "C:\\Users\\Usuario\\AppData\\Local\\Temp\\opencode\\ui-upload.png";
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const pass = (n: string, d = "") => { results.push({ name: n, ok: true, detail: d }); console.log(`[PASS] ${n} ${d}`); };
const fail = (n: string, d = "") => { results.push({ name: n, ok: false, detail: d }); console.log(`[FAIL] ${n} — ${d}`); };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // 200x200 test png (solid) via raw bytes
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  fs.writeFileSync(PNG_PATH, png);

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on("dialog", async (d) => { await d.accept(); });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const form = page.locator("form").first();
  await form.waitFor({ timeout: 20000 });
  await form.locator('input[type="email"]').fill("angab06@gmail.com");
  await form.locator('input[type="password"]').fill("12345678");
  const lp = page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60000 });
  await form.locator('button[type="submit"]').click();
  console.log("login:", (await lp).status());
  await page.waitForURL((u) => u.pathname.includes("/dashboard"), { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // GALLERY UI upload
  await page.goto(`${BASE}/track/${TRACK}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.locator("text=Galería de Prensa").scrollIntoViewIfNeeded().catch(() => {});
  await page.getByRole("button", { name: "+ Subir" }).click();
  await page.waitForTimeout(1000);
  await page.locator(`#upload-${TRACK}`).setInputFiles(PNG_PATH);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/5-gallery-uploader-open.png` });
  const upBtn = page.getByRole("button", { name: "Subir imagen" });
  await upBtn.waitFor({ timeout: 15000 });
  const upResp = page.waitForResponse((r) => r.url().includes("/api/upload/image") && r.request().method() === "POST", { timeout: 60000 });
  await upBtn.click();
  const upStatus = (await upResp).status();
  if (upStatus === 201) pass("gallery UI upload", "201");
  else fail("gallery UI upload", `status=${upStatus}`);
  await page.waitForTimeout(4000);
  const body1 = (await page.textContent("body")) ?? "";
  if (body1.includes("ui-upload")) pass("gallery UI shows upload");
  else fail("gallery UI shows upload", "title absent");
  await page.screenshot({ path: `${OUT}/6-gallery-uploaded.png` });

  // PROFILE UI upload (banner) — sets field, no save (no DB change)
  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  const me = await page.evaluate(async () => {
    const r = await fetch("/api/artists/me");
    return r.ok ? r.json() : null;
  });
  const artistId: string = me?.id ?? "";
  await page.locator("text=Imagen de Banner").scrollIntoViewIfNeeded().catch(() => {});
  await page.locator(`#upload-banner-${artistId}`).setInputFiles(PNG_PATH);
  await page.waitForTimeout(1500);
  const bannerUpBtn = page.getByRole("button", { name: "Subir imagen" }).first();
  await bannerUpBtn.waitFor({ timeout: 15000 });
  const upResp2 = page.waitForResponse((r) => r.url().includes("/api/upload/image") && r.request().method() === "POST", { timeout: 60000 });
  await bannerUpBtn.click();
  const upStatus2 = (await upResp2).status();
  if (upStatus2 === 201) pass("profile UI upload", "201");
  else fail("profile UI upload", `status=${upStatus2}`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/7-profile-upload.png` });

  await browser.close();
  try { fs.unlinkSync(PNG_PATH); } catch {}
  const bad = results.filter((r) => !r.ok);
  console.log(`\n=== UI-UPLOAD: ${results.length - bad.length} PASS / ${bad.length} FAIL ===`);
  if (bad.length) process.exit(1);
}
main().catch((e) => { console.error("CRASH", e); process.exit(2); });
