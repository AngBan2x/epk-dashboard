import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const TEST_PASSWORD = "TestPass123!";
const ARTIST = "art-1788275587598";
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

async function registerSubscriber(request: import("@playwright/test").APIRequestContext, prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle(registerTimestamps, 2);
    const response = await request.post(`${BASE_URL}/api/auth/register`, {
      data: { name: "QA Suscriptor", email, password: TEST_PASSWORD, role: "subscriber" },
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

test.describe("P4.2: Suscripciones QA", () => {
  test.describe.configure({ timeout: 420_000 });

  test("API: suscribir, prefs, idempotencia, baja y seguridad", async ({ browser }) => {
    const ctx = await browser.newContext();
    const email = await registerSubscriber(ctx.request, "subs-api");
    createdEmails.push(email);
    await loginWithRetry(ctx.request, email);

    const statusBefore = await ctx.request.get(`${BASE_URL}/api/subscriptions?artist_id=${ARTIST}`);
    expect(statusBefore.status()).toBe(200);
    expect((await statusBefore.json()).subscribed).toBe(false);

    const created = await ctx.request.post(`${BASE_URL}/api/subscriptions`, {
      data: { artist_id: ARTIST, notify_releases: true, notify_shows: false },
    });
    expect(created.status()).toBe(201);
    const subscription = await created.json();
    expect(subscription.notify_releases).toBe(true);
    expect(subscription.notify_shows).toBe(false);

    const duplicate = await ctx.request.post(`${BASE_URL}/api/subscriptions`, {
      data: { artist_id: ARTIST, notify_releases: true, notify_shows: true },
    });
    expect(duplicate.status()).toBe(200);
    expect((await duplicate.json()).id).toBe(subscription.id);

    const list = await ctx.request.get(`${BASE_URL}/api/subscriptions`);
    expect(list.status()).toBe(200);
    const items = await list.json();
    expect(items.length).toBe(1);
    expect(items[0].artist.id).toBe(ARTIST);
    expect(items[0].artist.name.length).toBeGreaterThan(0);

    const foreignList = await ctx.request.get(
      `${BASE_URL}/api/subscriptions?user_id=66c07b67-8321-4b85-afca-4d3e16cd8b4f`
    );
    expect(foreignList.status()).toBe(403);

    const patched = await ctx.request.patch(`${BASE_URL}/api/subscriptions/${subscription.id}`, {
      data: { notify_shows: true },
    });
    expect(patched.status()).toBe(200);
    expect((await patched.json()).notify_shows).toBe(true);

    const emptyPatch = await ctx.request.patch(`${BASE_URL}/api/subscriptions/${subscription.id}`, {
      data: {},
    });
    expect(emptyPatch.status()).toBe(400);

    const missing = await ctx.request.patch(`${BASE_URL}/api/subscriptions/no-existe`, {
      data: { notify_shows: true },
    });
    expect(missing.status()).toBe(404);

    const unknownArtist = await ctx.request.post(`${BASE_URL}/api/subscriptions`, {
      data: { artist_id: "no-existe" },
    });
    expect(unknownArtist.status()).toBe(400);

    const removed = await ctx.request.delete(`${BASE_URL}/api/subscriptions/${subscription.id}`);
    expect(removed.status()).toBe(200);

    const statusAfter = await ctx.request.get(`${BASE_URL}/api/subscriptions?artist_id=${ARTIST}`);
    expect((await statusAfter.json()).subscribed).toBe(false);

    const reSubscribe = await ctx.request.post(`${BASE_URL}/api/subscriptions`, { data: { artist_id: ARTIST } });
    expect(reSubscribe.status()).toBe(201);
    await ctx.request.delete(`${BASE_URL}/api/subscriptions/${(await reSubscribe.json()).id}`);

    await ctx.close();
  });

  test("API: un artista no puede suscribirse a su propio perfil", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginWithRetry(ctx.request, "angab06@gmail.com", "12345678");
    const attempt = await ctx.request.post(`${BASE_URL}/api/subscriptions`, { data: { artist_id: ARTIST } });
    expect(attempt.status()).toBe(400);
    expect((await attempt.json()).error).toBe("No puedes suscribirte a tu propio perfil");
    await ctx.close();
  });

  test("API: un suscriptor no puede tocar la suscripción de otro", async ({ browser }) => {
    const owner = await browser.newContext();
    const other = await browser.newContext();

    const emailA = await registerSubscriber(owner.request, "subs-a");
    createdEmails.push(emailA);
    await loginWithRetry(owner.request, emailA);
    const created = await owner.request.post(`${BASE_URL}/api/subscriptions`, { data: { artist_id: ARTIST } });
    expect(created.status()).toBe(201);
    const subscription = await created.json();

    const emailB = await registerSubscriber(other.request, "subs-b");
    createdEmails.push(emailB);
    await loginWithRetry(other.request, emailB);

    const patchAttempt = await other.request.patch(`${BASE_URL}/api/subscriptions/${subscription.id}`, {
      data: { notify_shows: false },
    });
    expect(patchAttempt.status()).toBe(403);

    const deleteAttempt = await other.request.delete(`${BASE_URL}/api/subscriptions/${subscription.id}`);
    expect(deleteAttempt.status()).toBe(403);

    const removed = await owner.request.delete(`${BASE_URL}/api/subscriptions/${subscription.id}`);
    expect(removed.status()).toBe(200);

    await owner.close();
    await other.close();
  });

  test("UI: botón suscribirse, /subscriptions con prefs y baja", async ({ browser }) => {
    test.setTimeout(300_000);

    const ctx = await browser.newContext();
    const email = `subs-ui-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
    const page = await ctx.newPage();

    const hydrationSignal = page
      .waitForResponse((r) => r.url().includes("/api/auth/me"), { timeout: 60_000 })
      .catch(() => null);
    await page.goto(`${BASE_URL}/register`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("form")).toBeVisible({ timeout: 45_000 });
    await hydrationSignal;
    await page.waitForTimeout(750);

    const subscriberRadio = page.getByRole("radio", { name: /Suscriptor/ });
    const nameInput = page.locator("input#name");
    const emailInput = page.locator('input[type="email"]');
    const passwords = page.locator('input[type="password"]');
    await subscriberRadio.check({ force: true });
    await nameInput.fill("QA Suscriptor UI");
    await emailInput.fill(email);
    await passwords.nth(0).fill(TEST_PASSWORD);
    await passwords.nth(1).fill(TEST_PASSWORD);
    await page.waitForTimeout(500);
    expect(await subscriberRadio.isChecked()).toBe(true);
    expect(await nameInput.inputValue()).toBe("QA Suscriptor UI");
    expect(await emailInput.inputValue()).toBe(email);

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

    await page.goto(`${BASE_URL}/artists/${ARTIST}`, { waitUntil: "domcontentloaded" });
    const subscribeButton = page.getByRole("button", { name: "Suscribirse" });
    await expect(subscribeButton).toBeVisible({ timeout: 45_000 });
    await subscribeButton.click();
    await expect(page.getByRole("button", { name: /Suscrito a/ })).toBeVisible({ timeout: 45_000 });
    await page.screenshot({ path: "tests/screenshots/subscriptions/artist-subscribed.png", fullPage: false });

    await page.goto(`${BASE_URL}/subscriptions`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Mis suscripciones" })).toBeVisible({ timeout: 45_000 });
    const showsSwitch = page.getByRole("switch").nth(1);
    await expect(showsSwitch).toBeVisible({ timeout: 45_000 });

    const initialChecked = (await showsSwitch.getAttribute("aria-checked")) === "true";
    await showsSwitch.click();
    await expect
      .poll(async () => (await showsSwitch.getAttribute("aria-checked")) === "true", { timeout: 30_000 })
      .toBe(!initialChecked);
    await page.screenshot({ path: "tests/screenshots/subscriptions/list.png", fullPage: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("switch").nth(1)).toHaveAttribute("aria-checked", String(!initialChecked), {
      timeout: 45_000,
    });

    await page.getByRole("button", { name: "Darse de baja" }).first().click();
    await page.getByRole("button", { name: /Confirmar baja|Confirmar cancelación/ }).first().click();
    await expect(page.getByText(/Aún no tienes suscripciones|Aun no tienes suscripciones/)).toBeVisible({
      timeout: 45_000,
    });
    await page.screenshot({ path: "tests/screenshots/subscriptions/empty.png", fullPage: true });

    await ctx.close();
  });

  test("cascada: borrar la cuenta elimina sus suscripciones", async ({ browser }) => {
    test.setTimeout(420_000);
    const ctx = await browser.newContext();
    const email = `subs-cascade-${Date.now()}@example.com`;
    await throttle(registerTimestamps, 2);
    const registration = await ctx.request.post(`${BASE_URL}/api/auth/register`, {
      data: { name: "QA Cascada", email, password: TEST_PASSWORD, role: "subscriber" },
    });
    if (registration.status() === 429) {
      test.skip(true, "rate limit de registro alcanzado; se omite la cascada");
    }
    expect(registration.status()).toBe(201);
    registerTimestamps.push(Date.now());
    createdEmails.push(email);
    await loginWithRetry(ctx.request, email);
    const created = await ctx.request.post(`${BASE_URL}/api/subscriptions`, { data: { artist_id: ARTIST } });
    expect([200, 201]).toContain(created.status());
    const subscription = await created.json();
    const userId = subscription.subscriber_id;

    const deletion = await ctx.request.delete(`${BASE_URL}/api/auth/me`);
    expect(deletion.ok()).toBeTruthy();
    createdEmails.splice(createdEmails.indexOf(email), 1);

    const adminCtx = await browser.newContext();
    await loginWithRetry(adminCtx.request, "admin@epk.local", "admin123");
    const check = await adminCtx.request.get(`${BASE_URL}/api/subscriptions?user_id=${userId}`);
    expect(check.status()).toBe(200);
    expect(await check.json()).toEqual([]);
    await adminCtx.close();
    await ctx.close();
  });

  test("limpieza: elimina las cuentas QA creadas", async ({ browser }) => {
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


