import { test, expect } from "@playwright/test";
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const ADMIN = ["admin@epk.local", "admin123"] as const;
const PASSWORD = "TestPass123!";
const loginStamps: number[] = [];
const createdEmails: string[] = [];
let turso: import("@libsql/client").Client | null = null;

async function getTurso() {
  if (turso) return turso;
  dotenv.config({ path: ".env.local" });
  const { createClient } = await import("@libsql/client");
  turso = createClient({
    url: process.env.TURSO_DATABASE_URL as string,
    authToken: process.env.TURSO_AUTH_TOKEN as string,
  });
  return turso;
}

async function throttle() {
  const now = Date.now();
  const recent = loginStamps.filter((t) => now - t < 62_000);
  loginStamps.length = 0;
  loginStamps.push(...recent);
  if (recent.length === 0) return;
  await new Promise((r) => setTimeout(r, 62_000 - (now - recent[0]) + 500));
}

async function loginAs(request: import("@playwright/test").APIRequestContext, email: string, password: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email, password, rememberMe: false },
    });
    if (res.ok()) {
      loginStamps.push(Date.now());
      return;
    }
    if (res.status() !== 429) expect(res.ok(), `login ${email} -> ${res.status()}`).toBeTruthy();
    await new Promise((r) => setTimeout(r, 70_000));
  }
  throw new Error(`login fallido para ${email}`);
}

test.describe("P4.8: Broadcast de plataforma QA", () => {
  test.describe.configure({ timeout: 600_000 });

  test("API: permisos, validacion y entrega a todos los usuarios", async ({ browser }) => {
    const guest = await browser.newContext();
    const anonymous = await guest.request.post(`${BASE_URL}/api/admin/broadcast`, {
      data: { title: "Aviso de prueba anonimo", message: "No deberia llegar", sendEmail: false },
    });
    expect(anonymous.status()).toBe(401);
    await guest.close();

    const email = `p48-${Date.now()}@example.com`;
    const reg = await browser.newContext();
    const registration = await reg.request.post(`${BASE_URL}/api/auth/register`, {
      data: { name: "QA Broadcast", email, password: PASSWORD, role: "subscriber" },
    });
    expect(registration.status()).toBe(201);
    createdEmails.push(email);
    await loginAs(reg.request, email, PASSWORD);

    const forbidden = await reg.request.post(`${BASE_URL}/api/admin/broadcast`, {
      data: { title: "Aviso no autorizado", message: "Intento de suscriptor", sendEmail: false },
    });
    expect(forbidden.status()).toBe(403);
    expect((await forbidden.json()).error).toMatch(/administradores/i);

    const admin = await browser.newContext();
    await loginAs(admin.request, ADMIN[0], ADMIN[1]);

    const invalid = await admin.request.post(`${BASE_URL}/api/admin/broadcast`, {
      data: { title: "ab", message: "corto", sendEmail: false },
    });
    expect(invalid.status()).toBe(400);
    const invalidBody = await invalid.json();
    expect(invalidBody.error).toMatch(/3 caracteres/);
    expect(Array.isArray(invalidBody.issues)).toBe(true);

    const title = `QA Broadcast ${Date.now()}`;
    const sent = await admin.request.post(`${BASE_URL}/api/admin/broadcast`, {
      data: { title, message: "Aviso oficial de verificacion de la fase P4.8.", sendEmail: false },
    });
    expect(sent.status()).toBe(201);
    const summary = await sent.json();
    expect(summary.notified).toBeGreaterThan(0);
    expect(summary.emailsQueued).toBe(0);
    expect(Array.isArray(summary.failures)).toBe(true);

    await expect
      .poll(
        async () => {
          const res = await reg.request.get(`${BASE_URL}/api/notifications`);
          const body = await res.json();
          return body.notifications.some((n: { type: string; title: string }) => n.type === "platform_release" && n.title === title);
        },
        { timeout: 120_000 }
      )
      .toBe(true);

    const notifs = await (await reg.request.get(`${BASE_URL}/api/notifications`)).json();
    const broadcast = notifs.notifications.find((n: { type: string }) => n.type === "platform_release");
    expect(broadcast.message).toContain("P4.8");

    await admin.close();
    await reg.close();
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(300_000);
    const client = await getTurso();
    const rows = await client.execute(
      "SELECT id, user_id FROM notifications WHERE type = 'platform_release' AND title LIKE 'QA Broadcast %'"
    );
    for (const row of rows.rows as unknown as { id: string }[]) {
      await client.execute("DELETE FROM notifications WHERE id = ?", [row.id]);
    }
    console.log(`notificaciones de broadcast borradas: ${(rows.rows as unknown[]).length}`);

    const ctx = await browser.newContext();
    for (const mail of createdEmails) {
      await throttle();
      const login = await ctx.request.post(`${BASE_URL}/api/auth/login`, {
        data: { email: mail, password: PASSWORD, rememberMe: false },
      });
      if (!login.ok()) continue;
      if ((await ctx.request.delete(`${BASE_URL}/api/auth/me`)).ok()) console.log(`eliminada ${mail}`);
    }
    createdEmails.length = 0;
    await ctx.close();

    const left = await client.execute(
      "SELECT COUNT(*) as c FROM notifications WHERE type = 'platform_release' AND title LIKE 'QA Broadcast %'"
    );
    console.log("restantes:", JSON.stringify(left.rows));
  });
});
