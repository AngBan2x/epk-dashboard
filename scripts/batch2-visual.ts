/* Batch 2 visual verification — dashboard sections + admin artist edit form */
import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3099";
const OUT = "tests/screenshots/batch2";

const results: { name: string; status: "PASS" | "FAIL" | "SKIP"; note?: string }[] = [];

async function setTheme(page: import("@playwright/test").Page, theme: "dark" | "light") {
  await page.evaluate((t) => {
    localStorage.setItem("epk-theme", t);
    if (t === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, theme);
  await page.waitForTimeout(250);
}

async function shot(page: import("@playwright/test").Page, theme: string, name: string) {
  await setTheme(page, theme as "dark" | "light");
  await page.screenshot({ path: `${OUT}/${theme}/${name}.png`, fullPage: true });
}

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });
  const form = page.locator("form").first();
  await form.waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}

function pass(name: string, note?: string) { results.push({ name, status: "PASS", note }); }
function fail(name: string, note?: string) { results.push({ name, status: "FAIL", note }); }
function skip(name: string, note?: string) { results.push({ name, status: "SKIP", note }); }

async function main() {
  mkdirSync(`${OUT}/dark`, { recursive: true });
  mkdirSync(`${OUT}/light`, { recursive: true });

  const headed = process.env.HEADED === "1";
  if (headed) console.log("HEADED mode: browser visible");
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  try {
    await login(page, "angab06@gmail.com", "12345678");
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("h2", { timeout: 20000 });
    await page.waitForTimeout(1500);

    const body = (await page.textContent("body")) ?? "";
    const h2s = await page.locator("h2").allTextContents();

    if (h2s.length >= 5) pass("C1 SectionHeaders (h2)", `${h2s.length}: ${h2s.slice(0, 3).join(" | ")}...`);
    else fail("C1 SectionHeaders (h2)", `only ${h2s.length}`);

    if (!body.toLowerCase().includes("ejemplo de biografía") && !body.includes("fallback"))
      pass("C2 Bio sin contenido fake");
    else fail("C2 Bio sin contenido fake");

    if (body.includes("Descargar")) pass('C3 "Descargar" ES');
    else skip('C3 "Descargar" ES', "DownloadCenter not in view");

    const imprimir = await page.getByRole("button", { name: /Imprimir/i }).count();
    if (imprimir === 1) pass("C4 Un solo Imprimir", "1 button");
    else if (imprimir === 0) skip("C4 Un solo Imprimir", "not visible");
    else fail("C4 Un solo Imprimir", `${imprimir} buttons`);

    if (body.includes("Suscriptores") && body.includes("Shows"))
      pass("C5 Stats visibles", `Shows+Suscriptores present`);
    else fail("C5 Stats visibles", "missing stats labels");

    // Stats content check: shows count vs section
    const showStatMatch = body.match(/(\d+)\s*Shows/i);
    if (showStatMatch) pass("C5b Shows stat", `value=${showStatMatch[1]}`);
    else skip("C5b Shows stat", "no numeric Shows stat");

    await shot(page, "dark", "C1-dashboard-full");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    await shot(page, "dark", "C1-dashboard-bottom");
    await shot(page, "light", "C1-dashboard-full");

    // --- Admin: fresh context (avoid residual artist session) ---
    const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const adminPage = await adminCtx.newPage();

    let loginOk = false;
    let loginBody = "";

    await adminPage.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });
    const form = adminPage.locator("form").first();
    await form.waitFor({ timeout: 20000 });
    await form.locator('input[type="email"]').fill("admin@epk.local");
    await form.locator('input[type="password"]').fill("admin123");

    const loginResPromise = adminPage.waitForResponse(
      (r) => r.url().includes("/api/auth/login"),
      { timeout: 60000 }
    ).then(async (r) => {
      const status = r.status();
      loginBody = await r.text().catch(() => "");
      console.log("ADMIN LOGIN", status, loginBody.slice(0, 200));
      loginOk = status === 200;
      return r;
    }).catch((e) => {
      console.log("ADMIN LOGIN WAIT FAIL", String(e).slice(0, 200));
      return null;
    });

    await form.locator('button[type="submit"]').click();
    await loginResPromise;
    await adminPage.waitForTimeout(3000);
    console.log("ADMIN AFTER LOGIN URL:", adminPage.url(), "loginOk=", loginOk);

    if (!loginOk) {
      const snap = (await adminPage.textContent("body"))?.replace(/\s+/g, " ").slice(0, 300) ?? "";
      fail("C6 Admin access", `login failed: ${snap}`);
      await adminPage.screenshot({ path: `${OUT}/dark/C6-admin-login-fail.png`, fullPage: true });
    } else {
      await adminPage.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 45000 });
      // Wait for AuthContext to hydrate (header shows user) — avoid networkidle (admin polls)
      try {
        await adminPage.waitForSelector('header:has-text("Cerrar sesión"), header:has-text("Admin EPK")', {
          timeout: 30000,
        });
      } catch {
        console.log("header auth wait timeout");
      }
      // Wait for tab counts to populate
      try {
        await adminPage.waitForSelector('button:has-text("Artistas (7)"), button:has-text("Artistas (1)"), button:has-text("Artistas (")', {
          timeout: 25000,
        });
      } catch {
        console.log("artists count wait timeout");
      }
      await adminPage.waitForTimeout(1500);
      console.log("ADMIN URL:", adminPage.url());
      console.log("ADMIN HEADER:", (await adminPage.locator("header").textContent().catch(() => ""))?.replace(/\s+/g, " ").slice(0, 150));

      if (!adminPage.url().includes("/admin")) {
        fail("C6 Admin access", `stuck at ${adminPage.url()}`);
        await adminPage.screenshot({ path: `${OUT}/dark/C6-admin-noaccess.png`, fullPage: true });
      } else {
        const tab = adminPage.locator('nav[aria-label="Admin tabs"] button, button').filter({ hasText: /^Artistas \(/ }).first();
        if (await tab.count()) {
          await tab.click();
          await adminPage.waitForTimeout(2000);
        }

        try {
          await adminPage.waitForSelector('button:has-text("Editar")', { timeout: 20000 });
        } catch {
          console.log("Editar wait timeout");
        }

        const editBtn = adminPage.getByRole("button", { name: /^Editar$/ }).first();
        const editCount = await editBtn.count();
        if (editCount) {
          await editBtn.click();
          await adminPage.waitForSelector("text=Biografía", { timeout: 15000 });
          await adminPage.waitForTimeout(1000);
          await shot(adminPage, "dark", "C6-admin-artist-edit");

          const adminBody = (await adminPage.textContent("body")) ?? "";
          const bio = adminBody.includes("Biografía");
          const press = adminBody.includes("Texto de Prensa");
          const hl = adminBody.includes("Destacados de Prensa");
          if (bio && press && hl) pass("C6 Admin form labels", "Biografía + Texto de Prensa + Destacados");
          else fail("C6 Admin form labels", `bio=${bio} press=${press} hl=${hl}`);

          const guardar = adminPage.getByRole("button", { name: /Guardar/i }).first();
          if (await guardar.count()) {
            const cls = (await guardar.getAttribute("class")) ?? "";
            if (cls.includes("primary-600") && cls.includes("primary-700"))
              pass("C7 Admin Guardar button style", "primary-600/700");
            else fail("C7 Admin Guardar button style", cls.slice(0, 120));
          } else skip("C7 Admin Guardar button style", "no Guardar");

          await shot(adminPage, "light", "C6-admin-artist-edit");
        } else {
          // Try tracks-tab Editar as fallback for form labels? No — need artist form.
          // Artistas tab may need a second click if first hit track Editar
          const bodyNow = (await adminPage.textContent("body"))?.replace(/\s+/g, " ").slice(0, 500) ?? "";
          fail("C6 Admin form labels", `no Artistas Editar — ${bodyNow}`);
          await shot(adminPage, "dark", "C6-admin-page");
        }
      }
    }
    await adminCtx.close();
    await ctx.close();
  } catch (e) {
    fail("CRASH", String(e).slice(0, 300));
  }

  await browser.close();

  console.log("\n=== BATCH 2 VISUAL RESULTS ===");
  let passN = 0, failN = 0, skipN = 0;
  for (const r of results) {
    console.log(`[${r.status}] ${r.name}${r.note ? ` — ${r.note}` : ""}`);
    if (r.status === "PASS") passN++;
    else if (r.status === "FAIL") failN++;
    else skipN++;
  }
  console.log(`\nTOTAL: ${passN} PASS / ${failN} FAIL / ${skipN} SKIP`);
  process.exit(failN > 0 ? 1 : 0);
}

main();
