import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const ARTIST = ["angab06@gmail.com", "12345678"] as const;
const ADMIN = ["admin@epk.local", "admin123"] as const;
const ARTIST_ID = "art-1788275587598";
const loginStamps: number[] = [];

async function throttle() {
  const now = Date.now();
  const recent = loginStamps.filter((t) => now - t < 62_000);
  loginStamps.length = 0;
  loginStamps.push(...recent);
  if (recent.length === 0) return;
  await new Promise((r) => setTimeout(r, 62_000 - (now - recent[0]) + 500));
}

async function loginAs(
  request: import("@playwright/test").APIRequestContext,
  creds: readonly [string, string]
) {
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

test.describe("P4.6: Transiciones de shows QA", () => {
  test.describe.configure({ timeout: 900_000 });

  test("ciclo completo con aprobacion, revision, posposicion, cancelacion y reactivacion", async ({ browser }) => {
    const artist = await browser.newContext();
    await loginAs(artist.request, ARTIST);
    const venue = `QA P46 Venue ${Date.now()}`;
    const created = await artist.request.post(`${BASE_URL}/api/shows`, {
      data: { artist_id: ARTIST_ID, venue_name: venue, city: "Valencia", date: futureDate(20) },
    });
    expect(created.status()).toBe(201);
    const show = await created.json();
    expect(show.approved).toBe(false);

    const admin = await browser.newContext();
    await loginAs(admin.request, ADMIN);

    expect((await admin.request.patch(`${BASE_URL}/api/admin/shows/${show.id}`, { data: { action: "approve" } })).status()).toBe(200);
    expect((await admin.request.patch(`${BASE_URL}/api/admin/shows/${show.id}`, { data: { action: "revision", reason: "corto" } })).status()).toBe(400);
    const revision = await admin.request.patch(`${BASE_URL}/api/admin/shows/${show.id}`, {
      data: { action: "revision", reason: "Falta confirmar la hora de inicio del evento." },
    });
    expect(revision.status()).toBe(200);
    expect((await revision.json()).action).toBe("revision");
    expect((await admin.request.patch(`${BASE_URL}/api/admin/shows/${show.id}`, { data: { action: "approve" } })).status()).toBe(200);

    expect((await artist.request.post(`${BASE_URL}/api/shows/${show.id}/postpone`, { data: { new_date: "2020-01-01", reason: "Cambio de fecha por clima adverso." } })).status()).toBe(400);
    expect((await artist.request.post(`${BASE_URL}/api/shows/${show.id}/postpone`, { data: { new_date: futureDate(30), reason: "corto" } })).status()).toBe(400);

    const postponed = await artist.request.post(`${BASE_URL}/api/shows/${show.id}/postpone`, {
      data: { new_date: futureDate(30), reason: "Cambio de fecha por clima adverso en la ciudad." },
    });
    expect(postponed.status()).toBe(200);
    const postponedShow = await postponed.json();
    expect(postponedShow.status).toBe("pospuesto");
    expect(postponedShow.date).toBe(futureDate(30));
    expect(postponedShow.postponement_reason).toContain("clima");

    const notifications = await (await artist.request.get(`${BASE_URL}/api/notifications`)).json();
    const today = new Date().toISOString().slice(0, 10);
    const todayNotifs = notifications.notifications.filter((n: { created_at: string }) => n.created_at.slice(0, 10) === today);
    expect(todayNotifs.some((n: { type: string }) => n.type === "revision_requested")).toBe(true);

    const cancelled = await artist.request.post(`${BASE_URL}/api/shows/${show.id}/cancel`, {
      data: { reason: "El promotor decidio finalizar el evento antes de tiempo.", refund_note: "Devolucion acordada" },
    });
    expect(cancelled.status()).toBe(200);
    expect((await cancelled.json()).status).toBe("cancelado");
    expect((await artist.request.post(`${BASE_URL}/api/shows/${show.id}/postpone`, { data: { new_date: futureDate(40), reason: "Deberia fallar porque esta cancelado." } })).status()).toBe(409);

    const reactivated = await artist.request.post(`${BASE_URL}/api/shows/${show.id}/reactivate`);
    expect(reactivated.status()).toBe(200);
    const back = await reactivated.json();
    expect(["confirmado", "proximamente", "disponible", "en_venta"]).toContain(back.status);
    expect(back.postponement_reason).toBeFalsy();

    expect([200, 404]).toContain((await admin.request.delete(`${BASE_URL}/api/shows?id=${show.id}`)).status());
    await admin.close();
    await artist.close();
  });

  test("suscriptor no puede transicionar y el admin crea shows ya aprobados sin notificar", async ({ browser }) => {
    const artist = await browser.newContext();
    await loginAs(artist.request, ARTIST);
    const venue = `QA P46 Sub ${Date.now()}`;
    const created = await artist.request.post(`${BASE_URL}/api/shows`, {
      data: { artist_id: ARTIST_ID, venue_name: venue, city: "Valencia", date: futureDate(15) },
    });
    expect(created.status()).toBe(201);
    const show = await created.json();

    const email = `p46-sub-${Date.now()}@example.com`;
    const reg = await artist.request.post(`${BASE_URL}/api/auth/register`, {
      data: { name: "QA P46", email, password: "TestPass123!", role: "subscriber" },
    });
    expect(reg.status()).toBe(201);
    const sub = await browser.newContext();
    await loginAs(sub.request, [email, "TestPass123!"]);

    expect((await sub.request.post(`${BASE_URL}/api/shows/${show.id}/postpone`, { data: { new_date: futureDate(30), reason: "Intento no autorizado del suscriptor." } })).status()).toBe(403);
    expect((await sub.request.post(`${BASE_URL}/api/shows/${show.id}/cancel`, { data: { reason: "Intento no autorizado del suscriptor." } })).status()).toBe(403);
    expect((await sub.request.post(`${BASE_URL}/api/shows/${show.id}/reactivate`)).status()).toBe(403);
    expect((await sub.request.post(`${BASE_URL}/api/shows`, { data: { artist_id: ARTIST_ID, venue_name: "QA P46 hack", approved: true } })).status()).toBe(403);

    const admin = await browser.newContext();
    await loginAs(admin.request, ADMIN);
    const before = await (await artist.request.get(`${BASE_URL}/api/notifications`)).json();
    const adminShow = await admin.request.post(`${BASE_URL}/api/shows`, {
      data: { artist_id: ARTIST_ID, venue_name: `QA P46 Admin ${Date.now()}`, city: "Caracas", date: futureDate(25), approved: true },
    });
    expect(adminShow.status()).toBe(201);
    expect((await adminShow.json()).approved).toBe(true);
    await new Promise((r) => setTimeout(r, 2000));
    const after = await (await artist.request.get(`${BASE_URL}/api/notifications`)).json();
    const pending = after.notifications.filter(
      (n: { type: string; title: string }) => n.type === "show_pending_review" && n.title.includes("QA P46 Admin")
    );
    expect(pending.length).toBe(0);
    expect(after.unread_count).toBe(before.unread_count);

    expect([200, 404]).toContain((await admin.request.delete(`${BASE_URL}/api/shows?id=${show.id}`)).status());
    const adminId = (await adminShow.json()).id;
    expect([200, 404]).toContain((await admin.request.delete(`${BASE_URL}/api/shows?id=${adminId}`)).status());

    const cleanup = await sub.request.delete(`${BASE_URL}/api/auth/me`);
    expect(cleanup.ok()).toBeTruthy();

    await admin.close();
    await sub.close();
    await artist.close();
  });
});
