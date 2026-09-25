import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const ARTIST_EMAIL = "angab06@gmail.com";
const ARTIST_PASSWORD = "12345678";
const ADMIN_EMAIL = "admin@epk.local";
const ADMIN_PASSWORD = "admin123";

const loginTimestamps: number[] = [];

async function throttle(max: number) {
  while (true) {
    const now = Date.now();
    const recent = loginTimestamps.filter((t) => now - t < 62_000);
    loginTimestamps.length = 0;
    loginTimestamps.push(...recent);
    if (recent.length < max) return;
    await new Promise((r) => setTimeout(r, 62_000 - (now - recent[0]) + 500));
  }
}

async function loginAs(request: import("@playwright/test").APIRequestContext, email: string, password: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle(1);
    const response = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email, password, rememberMe: false },
    });
    if (response.ok()) {
      loginTimestamps.push(Date.now());
      return response;
    }
    if (response.status() !== 429) {
      expect(response.ok(), `login de ${email} devolvió ${response.status()}`).toBeTruthy();
    }
    await new Promise((r) => setTimeout(r, 70_000));
  }
  throw new Error(`No se pudo iniciar sesión de ${email}`);
}

test.describe("P4.3: Notificaciones in-app QA", () => {
  test.describe.configure({ timeout: 300_000 });

  test("API: 401 sin sesión, forma del listado y ownership al marcar leída", async ({ browser }) => {
    const guest = await browser.newContext();
    const unauth = await guest.request.get(`${BASE_URL}/api/notifications`);
    expect(unauth.status()).toBe(401);
    await guest.close();

    const artist = await browser.newContext();
    await loginAs(artist.request, ARTIST_EMAIL, ARTIST_PASSWORD);

    const list = await artist.request.get(`${BASE_URL}/api/notifications`);
    expect(list.status()).toBe(200);
    const body = await list.json();
    expect(Array.isArray(body.notifications)).toBe(true);
    expect(typeof body.unread_count).toBe("number");
    expect(body.notifications.length).toBeGreaterThan(0);
    for (const notification of body.notifications) {
      expect(typeof notification.id).toBe("string");
      expect(typeof notification.title).toBe("string");
      expect(typeof notification.read).toBe("boolean");
      expect(notification.data === null || typeof notification.data === "object").toBe(true);
    }

    const unreadOnly = await artist.request.get(`${BASE_URL}/api/notifications?unread=1`);
    expect(unreadOnly.status()).toBe(200);
    const unreadBody = await unreadOnly.json();
    expect(unreadBody.notifications.every((n: { read: boolean }) => n.read === false)).toBe(true);

    const target = body.notifications.find((n: { read: boolean }) => n.read === false) ?? body.notifications[0];

    const admin = await browser.newContext();
    await loginAs(admin.request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const foreignRead = await admin.request.post(`${BASE_URL}/api/notifications/read?id=${target.id}`, {
      data: { id: target.id },
    });
    expect(foreignRead.status()).toBe(404);
    const foreignPatch = await admin.request.patch(`${BASE_URL}/api/notifications/${target.id}`, {
      data: { read: true },
    });
    expect(foreignPatch.status()).toBe(404);

    const ownerRead = await artist.request.post(`${BASE_URL}/api/notifications/read?id=${target.id}`, {
      data: { id: target.id },
    });
    expect(ownerRead.ok()).toBeTruthy();

    const afterRead = await artist.request.get(`${BASE_URL}/api/notifications`);
    const afterBody = await afterRead.json();
    const updated = afterBody.notifications.find((n: { id: string }) => n.id === target.id);
    expect(updated.read).toBe(true);

    const markAll = await artist.request.post(`${BASE_URL}/api/notifications/read-all`);
    expect(markAll.ok()).toBeTruthy();
    const afterAll = await artist.request.get(`${BASE_URL}/api/notifications`);
    expect((await afterAll.json()).unread_count).toBe(0);

    await admin.close();
    await artist.close();
  });

  test("API: preferencias de notificación (GET/PATCH, validación y persistencia)", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAs(ctx.request, ARTIST_EMAIL, ARTIST_PASSWORD);

    const current = await ctx.request.get(`${BASE_URL}/api/user/preferences`);
    expect(current.status()).toBe(200);
    const before = (await current.json()).preferences;
    expect(typeof before.marketing_emails).toBe("boolean");

    const patched = await ctx.request.patch(`${BASE_URL}/api/user/preferences`, {
      data: { marketing_emails: !before.marketing_emails },
    });
    expect(patched.status()).toBe(200);
    expect((await patched.json()).preferences.marketing_emails).toBe(!before.marketing_emails);

    const reread = await ctx.request.get(`${BASE_URL}/api/user/preferences`);
    expect((await reread.json()).preferences.marketing_emails).toBe(!before.marketing_emails);

    const invalid = await ctx.request.patch(`${BASE_URL}/api/user/preferences`, { data: {} });
    expect(invalid.status()).toBe(400);

    const wrongType = await ctx.request.patch(`${BASE_URL}/api/user/preferences`, {
      data: { show_alerts: "sí" },
    });
    expect(wrongType.status()).toBe(400);

    await ctx.request.patch(`${BASE_URL}/api/user/preferences`, {
      data: { marketing_emails: before.marketing_emails },
    });
    await ctx.close();
  });

  test("UI: campana con badge, panel, página y preferencias", async ({ browser }) => {
    test.setTimeout(300_000);
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    const guestCalls: string[] = [];
    guestPage.on("request", (r) => {
      if (r.url().includes("/api/notifications")) guestCalls.push(r.url());
    });
    await guestPage.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await guestPage.waitForTimeout(5000);
    expect(guestCalls).toEqual([]);
    expect(await guestPage.getByRole("button", { name: /Notificaciones/i }).count()).toBe(0);
    await guest.close();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await loginAs(ctx.request, ARTIST_EMAIL, ARTIST_PASSWORD);
    const state = await ctx.storageState();
    await ctx.close();

    const authed = await browser.newContext({ storageState: state });
    const authedPage = await authed.newPage();
    authedPage.on("pageerror", (e) => errors.push(String(e)));

    await authedPage.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    const bell = authedPage.getByRole("button", { name: /Notificaciones/i });
    await expect(bell).toBeVisible({ timeout: 60_000 });
    await bell.click();
    await expect(authedPage.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
    await expect(authedPage.locator(".animate-pulse")).toHaveCount(0, { timeout: 45_000 });
    await authedPage.screenshot({ path: "tests/screenshots/notifications/e2e-bell-panel.png", fullPage: false });

    await authedPage.keyboard.press("Escape");
    await expect(authedPage.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

    await authedPage.goto(`${BASE_URL}/notifications`, { waitUntil: "domcontentloaded" });
    await expect(authedPage.getByRole("heading", { name: "Notificaciones" })).toBeVisible({ timeout: 60_000 });
    await expect(authedPage.locator(".animate-pulse")).toHaveCount(0, { timeout: 45_000 });
    await authedPage.screenshot({ path: "tests/screenshots/notifications/e2e-page.png", fullPage: true });

    await authedPage.goto(`${BASE_URL}/account`, { waitUntil: "domcontentloaded" });
    await expect(authedPage.getByRole("heading", { name: "Notificaciones" })).toBeVisible({ timeout: 60_000 });
    const pushSwitch = authedPage.getByRole("switch").nth(1);
    await expect(pushSwitch).toBeVisible({ timeout: 30_000 });
    const initial = (await pushSwitch.getAttribute("aria-checked")) === "true";
    await pushSwitch.click();
    await expect
      .poll(async () => (await pushSwitch.getAttribute("aria-checked")) === "true", { timeout: 30_000 })
      .toBe(!initial);
    await authedPage.screenshot({ path: "tests/screenshots/notifications/e2e-preferences.png", fullPage: true });

    await authedPage.reload({ waitUntil: "domcontentloaded" });
    await expect(authedPage.getByRole("switch").nth(1)).toHaveAttribute("aria-checked", String(!initial), {
      timeout: 45_000,
    });

    await pushSwitch.click();
    await expect(pushSwitch).toHaveAttribute("aria-checked", String(initial), { timeout: 30_000 });

    expect(errors).toEqual([]);
    await authed.close();
  });
});
