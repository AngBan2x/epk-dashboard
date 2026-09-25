import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const TEST_PASSWORD = "TestPass123!";
const ARTIST = "art-1788275587598";
const createdEmails: string[] = [];

async function registerSubscriber(request: import("@playwright/test").APIRequestContext, prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  createdEmails.push(email);
  const response = await request.post(`${BASE_URL}/api/auth/register`, {
    data: { name: "QA Suscriptor", email, password: TEST_PASSWORD, role: "subscriber" },
  });
  expect(response.status()).toBe(201);
  return email;
}

test.describe("P4.2: Suscripciones QA", () => {
  test("API: suscribir, prefs, idempotencia, baja y seguridad", async ({ request }) => {
    const email = await registerSubscriber(request, "subs-api");

    const login = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email, password: TEST_PASSWORD, rememberMe: false },
    });
    expect(login.ok()).toBeTruthy();

    const statusBefore = await request.get(`${BASE_URL}/api/subscriptions?artist_id=${ARTIST}`);
    expect(statusBefore.status()).toBe(200);
    const beforeBody = await statusBefore.json();
    expect(beforeBody.subscribed).toBe(false);

    const created = await request.post(`${BASE_URL}/api/subscriptions`, {
      data: { artist_id: ARTIST, notify_releases: true, notify_shows: false },
    });
    expect(created.status()).toBe(201);
    const subscription = await created.json();
    expect(subscription.notify_releases).toBe(true);
    expect(subscription.notify_shows).toBe(false);

    const duplicate = await request.post(`${BASE_URL}/api/subscriptions`, {
      data: { artist_id: ARTIST, notify_releases: true, notify_shows: true },
    });
    expect(duplicate.status()).toBe(200);
    expect((await duplicate.json()).id).toBe(subscription.id);

    const list = await request.get(`${BASE_URL}/api/subscriptions`);
    expect(list.status()).toBe(200);
    const items = await list.json();
    expect(items.length).toBe(1);
    expect(items[0].artist.id).toBe(ARTIST);
    expect(items[0].artist.name.length).toBeGreaterThan(0);

    const foreignList = await request.get(`${BASE_URL}/api/subscriptions?user_id=66c07b67-8321-4b85-afca-4d3e16cd8b4f`);
    expect(foreignList.status()).toBe(403);

    const patched = await request.patch(`${BASE_URL}/api/subscriptions/${subscription.id}`, {
      data: { notify_shows: true },
    });
    expect(patched.status()).toBe(200);
    expect((await patched.json()).notify_shows).toBe(true);

    const emptyPatch = await request.patch(`${BASE_URL}/api/subscriptions/${subscription.id}`, { data: {} });
    expect(emptyPatch.status()).toBe(400);

    const missing = await request.patch(`${BASE_URL}/api/subscriptions/no-existe`, { data: { notify_shows: true } });
    expect(missing.status()).toBe(404);

    const unknownArtist = await request.post(`${BASE_URL}/api/subscriptions`, {
      data: { artist_id: "no-existe" },
    });
    expect(unknownArtist.status()).toBe(400);

    const removed = await request.delete(`${BASE_URL}/api/subscriptions/${subscription.id}`);
    expect(removed.status()).toBe(200);

    const statusAfter = await request.get(`${BASE_URL}/api/subscriptions?artist_id=${ARTIST}`);
    expect((await statusAfter.json()).subscribed).toBe(false);
  });

  test("API: un suscriptor no puede tocar la suscripción de otro", async ({ browser, request }) => {
    const emailA = await registerSubscriber(request, "subs-a");
    const emailB = await registerSubscriber(request, "subs-b");

    const contextA = await browser.newContext();
    const loginA = await contextA.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: emailA, password: TEST_PASSWORD, rememberMe: false },
    });
    expect(loginA.ok()).toBeTruthy();
    const created = await contextA.request.post(`${BASE_URL}/api/subscriptions`, {
      data: { artist_id: ARTIST },
    });
    expect(created.status()).toBe(201);
    const subscription = await created.json();

    const contextB = await browser.newContext();
    const loginB = await contextB.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: emailB, password: TEST_PASSWORD, rememberMe: false },
    });
    expect(loginB.ok()).toBeTruthy();

    const patchAttempt = await contextB.request.patch(`${BASE_URL}/api/subscriptions/${subscription.id}`, {
      data: { notify_shows: false },
    });
    expect(patchAttempt.status()).toBe(403);

    const deleteAttempt = await contextB.request.delete(`${BASE_URL}/api/subscriptions/${subscription.id}`);
    expect(deleteAttempt.status()).toBe(403);

    await contextA.request.delete(`${BASE_URL}/api/subscriptions/${subscription.id}`);
    await contextA.close();
    await contextB.close();
  });

  test("UI: botón suscribirse, /subscriptions con prefs y baja", async ({ page }) => {
    test.setTimeout(180_000);

    const email = `subs-ui-${Date.now()}@example.com`;
    createdEmails.push(email);
    const password = TEST_PASSWORD;

    const hydrationSignal = page
      .waitForResponse((r) => r.url().includes("/api/auth/me"), { timeout: 60_000 })
      .catch(() => null);
    await page.goto(`${BASE_URL}/register`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("form")).toBeVisible({ timeout: 45_000 });
    await hydrationSignal;
    await page.waitForTimeout(750);

    const subscriberRadio = page.getByRole("radio", { name: /Suscriptor/ });
    await subscriberRadio.check({ force: true });
    const nameInput = page.locator("input#name");
    const emailInput = page.locator('input[type="email"]');
    await nameInput.fill("QA Suscriptor UI");
    await emailInput.fill(email);
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill(password);
    await passwords.nth(1).fill(password);
    await page.waitForTimeout(500);
    expect(await subscriberRadio.isChecked()).toBe(true);
    expect(await nameInput.inputValue()).toBe("QA Suscriptor UI");
    expect(await emailInput.inputValue()).toBe(email);
    expect(await passwords.nth(1).inputValue()).toBe(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/artists", { timeout: 60_000 });

    await page.goto(`${BASE_URL}/artists/${ARTIST}`, { waitUntil: "domcontentloaded" });
    const subscribeButton = page.getByRole("button", { name: "Suscribirse" });
    await expect(subscribeButton).toBeVisible({ timeout: 45_000 });
    await subscribeButton.click();
    await expect(page.getByRole("button", { name: /Suscrito a/ })).toBeVisible({ timeout: 45_000 });
    await page.screenshot({ path: "tests/screenshots/subscriptions/artist-subscribed.png", fullPage: false });

    await page.goto(`${BASE_URL}/subscriptions`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Mis suscripciones" })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("switch").first()).toBeVisible({ timeout: 45_000 });

    const showsSwitch = page.getByRole("switch").nth(1);
    const initialChecked = (await showsSwitch.getAttribute("aria-checked")) === "true";
    await showsSwitch.click();
    await expect
      .poll(async () => (await showsSwitch.getAttribute("aria-checked")) === "true", { timeout: 30_000 })
      .toBe(!initialChecked);
    await page.screenshot({ path: "tests/screenshots/subscriptions/list.png", fullPage: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("switch").nth(1)).toHaveAttribute("aria-checked", String(!initialChecked), { timeout: 45_000 });

    await page.getByRole("button", { name: "Darse de baja" }).first().click();
    await page.getByRole("button", { name: /Confirmar baja|Confirmar cancelación/ }).first().click();
    await expect(page.getByText(/Aún no tienes suscripciones|Aun no tienes suscripciones/)).toBeVisible({ timeout: 45_000 });
    await page.screenshot({ path: "tests/screenshots/subscriptions/empty.png", fullPage: true });
  });

  test("cascada: borrar la cuenta elimina sus suscripciones", async ({ request }) => {
    const email = createdEmails[0] ?? (await registerSubscriber(request, "subs-cascade"));

    const login = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email, password: TEST_PASSWORD, rememberMe: false },
    });
    expect(login.ok()).toBeTruthy();
    const created = await request.post(`${BASE_URL}/api/subscriptions`, { data: { artist_id: ARTIST } });
    expect([200, 201]).toContain(created.status());
    const subscription = await created.json();
    const userId = subscription.subscriber_id;

    const deletion = await request.delete(`${BASE_URL}/api/auth/me`);
    expect(deletion.ok()).toBeTruthy();

    const adminLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: "admin@epk.local", password: "admin123", rememberMe: false },
    });
    expect(adminLogin.ok()).toBeTruthy();
    const check = await request.get(`${BASE_URL}/api/subscriptions?user_id=${userId}`);
    expect(check.status()).toBe(200);
    expect(await check.json()).toEqual([]);
  });

  test("limpieza: elimina las cuentas QA creadas", async ({ request }) => {
    for (const email of createdEmails) {
      const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
        data: { email, password: TEST_PASSWORD, rememberMe: false },
      });
      if (!loginResponse.ok()) continue;
      const deleteResponse = await request.delete(`${BASE_URL}/api/auth/me`);
      expect(deleteResponse.ok()).toBeTruthy();
    }
    createdEmails.length = 0;
  });
});
