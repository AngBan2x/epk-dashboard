import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const TEST_PASSWORD = "TestPass123!";
const createdEmails: string[] = [];

async function registerSubscriber(request: import("@playwright/test").APIRequestContext, prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  createdEmails.push(email);
  const response = await request.post(`${BASE_URL}/api/auth/register`, {
    data: { name: "QA Subscriber", email, password: TEST_PASSWORD, role: "subscriber" },
  });
  expect(response.status()).toBe(201);
  return email;
}

test.describe("P4.1: Subscriber Role QA", () => {
  test("API: registro, permisos y gating de rol suscriptor", async ({ request }) => {
    const email = await registerSubscriber(request, "subscriber-api");

    const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email, password: TEST_PASSWORD, rememberMe: false },
    });
    expect(loginResponse.ok()).toBeTruthy();
    const loginBody = await loginResponse.json();
    expect(loginBody.user.role).toBe("subscriber");

    const meResponse = await request.get(`${BASE_URL}/api/auth/me`);
    expect(meResponse.ok()).toBeTruthy();
    const me = await meResponse.json();
    expect(me.email).toBe(email);
    expect(me.role).toBe("subscriber");
    expect(me.password_hash).toBeUndefined();

    const showsPost = await request.post(`${BASE_URL}/api/shows`, {
      data: { artist_id: "no-existe", venue_name: "Test Venue" },
    });
    expect(showsPost.status()).toBe(403);
    expect((await showsPost.json()).error).toBe("No autorizado");

    const showsPut = await request.put(`${BASE_URL}/api/shows`, {
      data: { id: "no-existe", venue_name: "Test Venue" },
    });
    expect(showsPut.status()).toBe(403);

    const showsDelete = await request.delete(`${BASE_URL}/api/shows?id=no-existe`);
    expect(showsDelete.status()).toBe(403);

    const releasesPost = await request.post(`${BASE_URL}/api/releases`, {
      data: { title: "Test Release", artist_name: "QA Subscriber" },
    });
    expect(releasesPost.status()).toBe(403);
    expect((await releasesPost.json()).error).toBe("No autorizado");

    const adminProbe = await request.get(`${BASE_URL}/api/admin/approvals`);
    expect([401, 403]).toContain(adminProbe.status());
  });

  test("UI: selector de cuenta suscriptor + redirecciones de middleware", async ({ page }) => {
    test.setTimeout(180_000);

    const email = `subscriber-ui-${Date.now()}@example.com`;
    createdEmails.push(email);

    const hydrationSignal = page
      .waitForResponse((r) => r.url().includes("/api/auth/me"), { timeout: 60_000 })
      .catch(() => null);
    await page.goto(`${BASE_URL}/register`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("form")).toBeVisible({ timeout: 45_000 });
    await hydrationSignal;
    await page.waitForTimeout(500);

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

    const registerResponse = page.waitForResponse(
      (r) => r.url().includes("/api/auth/register") && r.request().method() === "POST",
      { timeout: 60_000 }
    );
    await page.locator('button[type="submit"]').click();
    expect((await registerResponse).status()).toBe(201);
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
