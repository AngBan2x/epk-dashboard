import { test, expect } from "@playwright/test";
import * as dotenv from "dotenv";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const ARTIST = ["angab06@gmail.com", "12345678"] as const;
const ADMIN = ["admin@epk.local", "admin123"] as const;
const ARTIST_ID = "art-1788275587598";
const PASSWORD = "TestPass123!";
const loginStamps: number[] = [];
const createdEmails: string[] = [];
const createdShowIds: string[] = [];
const createdReleaseIds: string[] = [];

async function throttle() {
  const now = Date.now();
  const recent = loginStamps.filter((t) => now - t < 62_000);
  loginStamps.length = 0;
  loginStamps.push(...recent);
  if (recent.length === 0) return;
  await new Promise((r) => setTimeout(r, 62_000 - (now - recent[0]) + 500));
}

async function loginAs(request: import("@playwright/test").APIRequestContext, creds: readonly [string, string]) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: creds[0], password: creds[1], rememberMe: false },
    });
    if (res.ok()) {
      loginStamps.push(Date.now());
      return;
    }
    if (res.status() !== 429) expect(res.ok(), `login ${creds[0]} -> ${res.status()}`).toBeTruthy();
    await new Promise((r) => setTimeout(r, 70_000));
  }
  throw new Error(`login fallido para ${creds[0]}`);
}

const futureDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

async function registerSubscriber(browser: import("@playwright/test").Browser, notifyShows: boolean) {
  const ctx = await browser.newContext();
  const email = `p46b-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  const reg = await ctx.request.post(`${BASE_URL}/api/auth/register`, {
    data: { name: "QA Fanout", email, password: PASSWORD, role: "subscriber" },
  });
  expect(reg.status()).toBe(201);
  createdEmails.push(email);
  await loginAs(ctx.request, [email, PASSWORD]);
  const sub = await ctx.request.post(`${BASE_URL}/api/subscriptions`, {
    data: { artist_id: ARTIST_ID, notify_releases: true, notify_shows: notifyShows },
  });
  expect([200, 201]).toContain(sub.status());
  return ctx;
}

let tursoClient: import("@libsql/client").Client | null = null;
async function getTurso() {
  if (tursoClient) return tursoClient;
  dotenv.config({ path: ".env.local" });
  const { createClient } = await import("@libsql/client");
  tursoClient = createClient({
    url: process.env.TURSO_DATABASE_URL as string,
    authToken: process.env.TURSO_AUTH_TOKEN as string,
  });
  return tursoClient;
}

const typesOf = async (ctx: import("@playwright/test").BrowserContext) => {
  const me = await (await ctx.request.get(`${BASE_URL}/api/auth/me`)).json();
  const client = await getTurso();
  const res = await client.execute(
    "SELECT type FROM notifications WHERE user_id = ? ORDER BY created_at DESC",
    [me.id]
  );
  return (res.rows as unknown as { type: string }[]).map((r) => r.type);
};

test.describe("P4.6b: Fan-out a suscriptores QA", () => {
  test.describe.configure({ timeout: 900_000 });

  test("los suscriptores reciben los eventos de show y release respetando sus preferencias", async ({ browser }) => {
    const active = await registerSubscriber(browser, true);
    const silent = await registerSubscriber(browser, false);
    await new Promise((r) => setTimeout(r, 25_000));

    const artist = await browser.newContext();
    await loginAs(artist.request, ARTIST);

    const show = await (
      await artist.request.post(`${BASE_URL}/api/shows`, {
        data: { artist_id: ARTIST_ID, venue_name: `QA P46b Venue ${Date.now()}`, city: "Valencia", date: futureDate(20) },
      })
    ).json();
    createdShowIds.push(show.id);

    const admin = await browser.newContext();
    await loginAs(admin.request, ADMIN);

    const approve = await admin.request.patch(`${BASE_URL}/api/admin/shows/${show.id}`, { data: { action: "approve" } });
    expect(approve.status()).toBe(200);
    await expect
      .poll(async () => (await typesOf(active)).includes("new_show"), { timeout: 120_000 })
      .toBe(true);
    expect(await typesOf(silent)).not.toContain("new_show");

    const postpone = await artist.request.post(`${BASE_URL}/api/shows/${show.id}/postpone`, {
      data: { new_date: futureDate(30), reason: "Cambio de fecha por lluvia en la ciudad." },
    });
    expect(postpone.status()).toBe(200);
    await expect
      .poll(async () => (await typesOf(active)).includes("show_postponed"), { timeout: 120_000 })
      .toBe(true);
    expect(await typesOf(silent)).not.toContain("show_postponed");

    const cancel = await artist.request.post(`${BASE_URL}/api/shows/${show.id}/cancel`, {
      data: { reason: "El venue cancela el evento por climatologia.", refund_note: "Devolucion integra" },
    });
    expect(cancel.status()).toBe(200);
    await expect
      .poll(async () => (await typesOf(active)).includes("show_cancelled"), { timeout: 120_000 })
      .toBe(true);
    expect(await typesOf(silent)).not.toContain("show_cancelled");

    const reactivate = await artist.request.post(`${BASE_URL}/api/shows/${show.id}/reactivate`);
    expect(reactivate.status()).toBe(200);
    await expect
      .poll(async () => (await typesOf(active)).includes("show_reactivated"), { timeout: 120_000 })
      .toBe(true);
    expect(await typesOf(silent)).not.toContain("show_reactivated");

    const release = await (
      await artist.request.post(`${BASE_URL}/api/releases`, {
        data: { title: `QA P46b Release ${Date.now()}`, artist_name: "Angel Bandres", release_date: "2026-11-01", status: "pending" },
      })
    ).json();
    createdReleaseIds.push(release.id);

    let releaseNotified = false;
    for (let attempt = 0; attempt < 3 && !releaseNotified; attempt++) {
      if (attempt > 0) {
        await admin.request.put(`${BASE_URL}/api/admin/releases`, { data: { id: release.id, status: "revision", admin_notes: "Revisando de nuevo la ficha del release." } });
        await new Promise((r) => setTimeout(r, 2000));
      }
      const approveRelease = await admin.request.put(`${BASE_URL}/api/admin/releases`, {
        data: { id: release.id, status: "approved" },
      });
      expect(approveRelease.status()).toBe(200);
      await new Promise((r) => setTimeout(r, 8000));
      releaseNotified = (await typesOf(active)).includes("new_release");
    }
    expect(releaseNotified).toBe(true);
    expect(await typesOf(silent)).toContain("new_release");

    expect([200, 404]).toContain((await admin.request.delete(`${BASE_URL}/api/shows?id=${show.id}`)).status());
    expect([200, 404]).toContain((await admin.request.delete(`${BASE_URL}/api/tracks?id=${release.id}`)).status());

    await admin.close();
    await artist.close();
    await active.close();
    await silent.close();
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(420_000);
    const admin = await browser.newContext();
    await loginAs(admin.request, ADMIN);
    for (const id of createdShowIds) {
      const res = await admin.request.delete(`${BASE_URL}/api/shows?id=${id}`);
      if (res.ok()) console.log(`show eliminado ${id}`);
    }
    for (const id of createdReleaseIds) {
      const res = await admin.request.delete(`${BASE_URL}/api/tracks?id=${id}`);
      if (res.ok()) console.log(`release eliminado ${id}`);
    }
    createdShowIds.length = 0;
    createdReleaseIds.length = 0;
    await admin.close();

    const ctx = await browser.newContext();
    for (const email of createdEmails) {
      await throttle();
      const login = await ctx.request.post(`${BASE_URL}/api/auth/login`, {
        data: { email, password: PASSWORD, rememberMe: false },
      });
      if (!login.ok()) continue;
      if ((await ctx.request.delete(`${BASE_URL}/api/auth/me`)).ok()) console.log(`eliminada ${email}`);
    }
    createdEmails.length = 0;
    await ctx.close();
  });
});




