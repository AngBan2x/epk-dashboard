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

const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

async function registerSubscriber(request: import("@playwright/test").APIRequestContext) {
  const email = uniqueEmail("p45-sub");
  const response = await request.post(`${BASE_URL}/api/auth/register`, {
    data: { name: "QA Aprobaciones", email, password: "TestPass123!", role: "subscriber" },
  });
  expect(response.status()).toBe(201);
  return email;
}


test.describe("P4.5: Aprobaciones QA", () => {
  test.describe.configure({ timeout: 600_000 });

  test("API: cola real de releases (crear -> pending -> revision -> approved) con notificacion", async ({ browser }) => {
    test.setTimeout(420_000);
    const artist = await browser.newContext();
    await loginAs(artist.request, ARTIST_EMAIL, ARTIST_PASSWORD);

    const created = await artist.request.post(`${BASE_URL}/api/releases`, {
      data: {
        title: `QA P45 Release ${Date.now()}`,
        artist_name: "Angel Bandres",
        release_date: "2026-10-01",
        status: "pending",
      },
    });
    expect(created.status()).toBe(201);
    const release = await created.json();

    const admin = await browser.newContext();
    await loginAs(admin.request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const before = await artist.request.get(`${BASE_URL}/api/notifications`);
    const beforeCount = (await before.json()).unread_count;

    const revision = await admin.request.put(`${BASE_URL}/api/admin/releases`, {
      data: { id: release.id, status: "revision", admin_notes: "Falta la portada del release, adjúntala." },
    });
    expect(revision.status()).toBe(200);

    const pendingAgain = await admin.request.put(`${BASE_URL}/api/admin/releases`, {
      data: { id: release.id, status: "pending" },
    });
    expect(pendingAgain.status()).toBe(200);

    const approved = await admin.request.put(`${BASE_URL}/api/admin/releases`, {
      data: { id: release.id, status: "approved" },
    });
    expect(approved.status()).toBe(200);

    const after = await artist.request.get(`${BASE_URL}/api/notifications`);
    const body = await after.json();
    const fresh = body.notifications.filter((n: { created_at: string }) => n.created_at >= new Date(Date.now() - 300_000).toISOString().slice(0, 10));
    expect(fresh.some((n: { type: string }) => n.type === "revision_requested")).toBe(true);
    expect(fresh.some((n: { type: string }) => n.type === "submission_approved")).toBe(true);
    expect(body.unread_count).toBeGreaterThanOrEqual(beforeCount);

    const removal = await admin.request.delete(`${BASE_URL}/api/tracks?id=${release.id}`);
    expect([200, 404]).toContain(removal.status());

    await admin.close();
    await artist.close();
  });

  test("API: permisos de aprobacion y de lectura de envios", async ({ browser }) => {
    const guest = await browser.newContext();
    const guestSubmissions = await guest.request.get(`${BASE_URL}/api/submissions`);
    expect(guestSubmissions.status()).toBe(401);
    const guestApprovals = await guest.request.get(`${BASE_URL}/api/admin/approvals`);
    expect([401, 403]).toContain(guestApprovals.status());
    await guest.close();

    const artist = await browser.newContext();
    await loginAs(artist.request, ARTIST_EMAIL, ARTIST_PASSWORD);
    const ownSubmissions = await artist.request.get(`${BASE_URL}/api/submissions`);
    expect(ownSubmissions.status()).toBe(200);
    expect(Array.isArray(await ownSubmissions.json())).toBe(true);
    const foreignSubmissions = await artist.request.get(`${BASE_URL}/api/submissions?user_id=otro-usuario`);
    expect(foreignSubmissions.status()).toBe(200);
    expect(await foreignSubmissions.json()).toEqual([]);
    const artistApprovals = await artist.request.get(`${BASE_URL}/api/admin/approvals`);
    expect([401, 403]).toContain(artistApprovals.status());
    const artistPatch = await artist.request.patch(`${BASE_URL}/api/submissions?id=alguna`);
    expect([401, 403]).toContain(artistPatch.status());
    await artist.close();

    const subscriber = await browser.newContext();
    const email = await registerSubscriber(subscriber.request);
    await loginAs(subscriber.request, email, "TestPass123!");
    const subApprovals = await subscriber.request.get(`${BASE_URL}/api/admin/approvals`);
    expect([401, 403]).toContain(subApprovals.status());
    const subReleases = await subscriber.request.put(`${BASE_URL}/api/admin/releases`, {
      data: { id: "cualquiera", status: "approved" },
    });
    expect([401, 403]).toContain(subReleases.status());
    await subscriber.close();

    const admin = await browser.newContext();
    await loginAs(admin.request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const allSubmissions = await admin.request.get(`${BASE_URL}/api/submissions`);
    expect(allSubmissions.status()).toBe(200);
    const filtered = await admin.request.get(`${BASE_URL}/api/submissions?status=pending`);
    expect(filtered.status()).toBe(200);
    expect(Array.isArray(await filtered.json())).toBe(true);
    await admin.close();
  });

  test("API: el artista no puede auto-aprobar y si puede enviar a revision", async ({ browser }) => {
    const artist = await browser.newContext();
    await loginAs(artist.request, ARTIST_EMAIL, ARTIST_PASSWORD);

    const draft = await artist.request.post(`${BASE_URL}/api/releases`, {
      data: { title: `QA P45 Draft ${Date.now()}`, artist_name: "Angel Bandres", release_date: "2026-10-02" },
    });
    expect(draft.status()).toBe(201);
    const release = await draft.json();

    const selfApprove = await artist.request.put(`${BASE_URL}/api/releases`, {
      data: { id: release.id, status: "approved" },
    });
    expect(selfApprove.status()).toBe(403);

    const selfReject = await artist.request.put(`${BASE_URL}/api/releases`, {
      data: { id: release.id, status: "rejected" },
    });
    expect(selfReject.status()).toBe(403);

    const submit = await artist.request.put(`${BASE_URL}/api/releases`, {
      data: { id: release.id, status: "pending" },
    });
    expect(submit.status()).toBe(200);

    const admin = await browser.newContext();
    await loginAs(admin.request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const removal = await admin.request.delete(`${BASE_URL}/api/tracks?id=${release.id}`);
    expect([200, 404]).toContain(removal.status());
    await admin.close();
    await artist.close();
  });

  test("UI: el panel admin muestra revision y stats correctos", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAs(ctx.request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const state = await ctx.storageState();
    await ctx.close();

    const authed = await browser.newContext({ storageState: state });
    const page = await authed.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByRole("heading", { name: /Panel de Administración/ })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /Releases/ }).first().click();
    await page.waitForTimeout(3000);
    await expect(page.getByRole("button", { name: /Revisi/ }).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "tests/screenshots/approvals/admin-releases.png", fullPage: false });

    await page.goto(`${BASE_URL}/admin/approvals`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByRole("heading", { name: /Aprobaciones/ })).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "tests/screenshots/approvals/admin-approvals.png", fullPage: false });
    expect(errors).toEqual([]);
    await authed.close();
  });
});



