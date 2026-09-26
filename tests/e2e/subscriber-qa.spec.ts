import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const TEST_PASSWORD = "TestPass123!";
const createdEmails: string[] = [];

const loginTimestamps: number[] = [];
const registerTimestamps: number[] = [];

async function throttle(timestamps: number[], max: number) {
  while (true) {
    const now = Date.now();
    const recent = timestamps.filter((t) => now - t < 62_000);
    timestamps.length = 0;
    timestamps.push(...recent);
    if (recent.length < max) return;
    await new Promise((r) => setTimeout(r, 62_000 - (now - recent[0]) + 500));
  }
}

async function waitOk(response: import("@playwright/test").APIResponse, label: string) {
  if (response.status() !== 429) return response;
  const waitMs = label === "login" ? 70_000 : 65_000;
  console.log(`${label}: 429, esperando ${Math.ceil(waitMs / 1000)}s`);
  await new Promise((r) => setTimeout(r, waitMs));
  return null;
}

async function registerAccount(
  request: import("@playwright/test").APIRequestContext,
  prefix: string,
  role: "subscriber" | "artist" = "subscriber"
) {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle(registerTimestamps, 2);
    const response = await request.post(`${BASE_URL}/api/auth/register`, {
      data: { name: "QA Suscriptor", email, password: TEST_PASSWORD, role },
    });
    if (response.status() === 201) {
      registerTimestamps.push(Date.now());
      return email;
    }
    if (!(await waitOk(response, "register"))) {
      expect(response.status(), `register falló con ${response.status()}`).toBe(201);
    }
  }
  throw new Error("No se pudo registrar la cuenta QA tras 4 intentos");
}

async function loginWithRetry(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  password = TEST_PASSWORD
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle(loginTimestamps, 1);
    const response = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email, password, rememberMe: false },
    });
    if (response.ok()) {
      loginTimestamps.push(Date.now());
      return response;
    }
    if (!(await waitOk(response, "login"))) {
      expect(response.ok(), `login falló con ${response.status()}`).toBeTruthy();
    }
  }
  throw new Error("No se pudo iniciar sesión tras 4 intentos");
}

async function deleteAccount(request: import("@playwright/test").APIRequestContext, email: string) {
  const login = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password: TEST_PASSWORD, rememberMe: false },
  });
  if (!login.ok()) return false;
  const deleted = await request.delete(`${BASE_URL}/api/auth/me`);
  return deleted.ok();
}

test.describe("P4.1: Subscriber Role QA", () => {
  test.describe.configure({ timeout: 420_000 });

  test("API: registro, permisos y gating de rol suscriptor", async ({ browser }) => {
    const registerCtx = await browser.newContext();
    const email = await registerAccount(registerCtx.request, "subscriber-api");
    await registerCtx.close();

    const ctx = await browser.newContext();
    await loginWithRetry(ctx.request, email);

    const meResponse = await ctx.request.get(`${BASE_URL}/api/auth/me`);
    expect(meResponse.ok()).toBeTruthy();
    const me = await meResponse.json();
    expect(me.email).toBe(email);
    expect(me.role).toBe("subscriber");
    expect(me.password_hash).toBeUndefined();

    const showsPost = await ctx.request.post(`${BASE_URL}/api/shows`, {
      data: { artist_id: "no-existe", venue_name: "Test Venue" },
    });
    expect(showsPost.status()).toBe(403);
    expect((await showsPost.json()).error).toBe("No autorizado");

    const showsPut = await ctx.request.put(`${BASE_URL}/api/shows`, {
      data: { id: "no-existe", venue_name: "Test Venue" },
    });
    expect(showsPut.status()).toBe(403);

    const showsDelete = await ctx.request.delete(`${BASE_URL}/api/shows?id=no-existe`);
    expect(showsDelete.status()).toBe(403);

    const releasesPost = await ctx.request.post(`${BASE_URL}/api/releases`, {
      data: { title: "Test Release", artist_name: "QA Subscriber" },
    });
    expect(releasesPost.status()).toBe(403);
    expect((await releasesPost.json()).error).toBe("No autorizado");

    const adminProbe = await ctx.request.get(`${BASE_URL}/api/admin/approvals`);
    expect([401, 403]).toContain(adminProbe.status());

    await ctx.close();
    createdEmails.push(email);
  });

  test("UI: selector de cuenta suscriptor + redirecciones de middleware", async ({ page }) => {
    test.setTimeout(180_000);

    const email = `subscriber-ui-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
    const hydrationSignal = page
      .waitForResponse((r) => r.url().includes("/api/auth/me"), { timeout: 60_000 })
      .catch(() => null);
    await page.goto(`${BASE_URL}/register`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("form")).toBeVisible({ timeout: 45_000 });
    await hydrationSignal;
    await page.waitForTimeout(750);

    const subscriberRadio = page.getByRole("radio", { name: /Suscriptor/ });
    await expect(subscriberRadio).toBeVisible({ timeout: 45_000 });
    const nameInput = page.locator("input#name");
    const emailInput = page.locator('input[type="email"]');
    const passwords = page.locator('input[type="password"]');

    await subscriberRadio.check({ force: true });
    await nameInput.fill("QA Subscriber UI");
    await emailInput.fill(email);
    await passwords.nth(0).fill(TEST_PASSWORD);
    await passwords.nth(1).fill(TEST_PASSWORD);
    await page.waitForTimeout(750);

    expect(await subscriberRadio.isChecked()).toBe(true);
    expect(await nameInput.inputValue()).toBe("QA Subscriber UI");
    expect(await emailInput.inputValue()).toBe(email);
    expect(await passwords.nth(1).inputValue()).toBe(TEST_PASSWORD);

    await page.screenshot({ path: "tests/screenshots/subscriber/register-role-selector.png", fullPage: true });

    await throttle(registerTimestamps, 2);
    const registerResponse = page
      .waitForResponse(
        (r) => r.url().includes("/api/auth/register") && r.request().method() === "POST",
        { timeout: 60_000 }
      )
      .catch(() => null);
    await page.locator('button[type="submit"]').click();
    const response = await registerResponse;
    if (response && response.status() === 429) {
      test.skip(true, "rate limit de registro alcanzado; se omite la parte UI");
    }
    expect(response?.status()).toBe(201);
    registerTimestamps.push(Date.now());
    createdEmails.push(email);
    await page.waitForURL("**/artists", { timeout: 60_000 });

    await page.goto(`${BASE_URL}/releases/new`, { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/artists");

    await page.goto(`${BASE_URL}/profile`, { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/artists");

    const accountResponse = await page.goto(`${BASE_URL}/account`, { waitUntil: "domcontentloaded" });
    expect(accountResponse?.status()).toBe(200);
    expect(page.url()).toContain("/account");
    await expect(page.getByRole("heading", { name: "Configuración de Cuenta" })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("heading", { name: "Email", exact: true })).toBeVisible({ timeout: 45_000 });
    await page.screenshot({ path: "tests/screenshots/subscriber/account-access.png", fullPage: true });

    createdEmails.push(email);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext();
    for (const email of createdEmails) {
      await throttle(loginTimestamps, 1);
      const login = await ctx.request.post(`${BASE_URL}/api/auth/login`, {
        data: { email, password: TEST_PASSWORD, rememberMe: false },
      });
      if (!login.ok()) continue;
      const deleted = await ctx.request.delete(`${BASE_URL}/api/auth/me`);
      if (deleted.ok()) console.log(`eliminada ${email}`);
    }
    createdEmails.length = 0;
    await ctx.close();
  });
});




