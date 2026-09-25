import { describe, it, expect } from "vitest";
import { getEmailTemplate, escapeHtml, type NotificationType } from "@/lib/email-templates";

const ALL_TYPES: NotificationType[] = [
  "submission_approved",
  "submission_rejected",
  "new_release",
  "track_liked",
  "system",
  "show_pending_review",
];

const DATA = {
  userName: "Ana <script>alert(1)</script>",
  trackTitle: `Canción "Rara" & <b>negrita</b>`,
  artistName: `DJ <img src=x onerror=alert(2)>`,
  adminNotes: `Nota con <iframe src=evil></iframe>`,
  dashboardUrl: "/dashboard",
  notificationTitle: "Titulo <b>system</b>",
  notificationMessage: 'Mensaje "con comillas" & <u>subrayado</u>',
  showVenue: `Sala <b>Roca</b> & "Madness"`,
  showDate: "2026-10-01",
};

describe("P4.4 templates", () => {
  it("cubre todos los tipos en uso", () => {
    for (const type of ALL_TYPES) {
      const t = getEmailTemplate(type, DATA);
      expect(t.subject.length).toBeGreaterThan(0);
      expect(t.html).toContain("<!DOCTYPE html>");
      expect(t.text.length).toBeGreaterThan(0);
    }
  });

  it("escapa datos dinamicos en el HTML", () => {
    for (const type of ALL_TYPES) {
      const t = getEmailTemplate(type, DATA);
      expect(t.html).not.toContain("<script>");
      expect(t.html).not.toContain("<img src=x");
      expect(t.html).not.toContain("<iframe");
      expect(t.html).toContain("&lt;script&gt;");
    }
  });

  it("escapa comillas en el href del CTA", () => {
    const t = getEmailTemplate("submission_approved", {
      ...DATA,
      dashboardUrl: '/dashboard?q="x"',
    });
    expect(t.html).toContain("q=&quot;x&quot;");
    expect(t.html).not.toContain('q="x"');
    expect(escapeHtml(`"a"'b'`)).toBe("&quot;a&quot;&#39;b&#39;");
  });

  it("platform_release esta definido pero sin logica (P4.8)", () => {
    expect(() => getEmailTemplate("platform_release", DATA)).toThrow(/P4\.8/);
  });

  it("usa contexto show para shows", () => {
    const t = getEmailTemplate("submission_approved", { ...DATA, context: "show" });
    expect(t.subject).toContain("show");
    expect(t.html).toContain("Show Aprobado");
  });
});

describe("P4.4 sendEmail", () => {
  it("rechaza destinatario invalido sin enviar", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import("@/lib/email");
    const res = await sendEmail({ to: "no-es-un-email", subject: "Hola", html: "<p>hola</p>" });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe("destinatario_invalido");
  });

  it("reporta RESEND_API_KEY ausente con log explicito", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail, getEmailConfig, isEmailConfigured } = await import("@/lib/email");
    expect(isEmailConfigured()).toBe(false);
    const res = await sendEmail({ to: "destino@example.com", subject: "Hola", html: "<p>hola</p>" });
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("RESEND_API_KEY");
    const config = getEmailConfig();
    expect(config.missing).toContain("RESEND_API_KEY");
  });

  it("reporta FROM_EMAIL ausente en la configuracion", async () => {
    delete process.env.FROM_EMAIL;
    const { getEmailConfig, getFromAddress } = await import("@/lib/email");
    const config = getEmailConfig();
    expect(config.missing).toContain("FROM_EMAIL");
    expect(config.configured).toBe(false);
    expect(getFromAddress()).toContain("@");
  });

  it("registra destinatario invalido en stats", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail, getEmailStats } = await import("@/lib/email");
    const before = getEmailStats().skipped;
    await sendEmail({ to: "malo", subject: "Hola", html: "<p>x</p>" });
    expect(getEmailStats().skipped).toBe(before + 1);
  });
});

describe("P4.4 sendNotificationEmail", () => {
  it("no lanza excepcion con usuario inexistente", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendNotificationEmail } = await import("@/lib/email");
    const res = await sendNotificationEmail({
      userId: "user-que-no-existe-xyz",
      type: "system",
      data: { userName: "", trackTitle: "", artistName: "", dashboardUrl: "/dashboard" },
    });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe("usuario_no_encontrado");
  });

  it("respeta email_notifications: false", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendNotificationEmail } = await import("@/lib/email");
    const dbModule = await import("@/lib/db");
    if (dbModule.isTursoConfigured()) return;
    const db = dbModule.getDbWrite();
    const tempId = "tmp-p44-email-test";
    db.prepare("DELETE FROM users WHERE id = ?").run(tempId);

    const prefs = {
      email_notifications: true,
      push_notifications: false,
      new_release_alerts: true,
      show_alerts: true,
      marketing_emails: false,
    };

    try {
      await dbModule.createUser({
        id: tempId,
        name: "Temp P44",
        email: "temp-p44@example.com",
        password_hash: "x",
        role: "subscriber",
        preferences: prefs,
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      const enabled = await sendNotificationEmail({
        userId: tempId,
        type: "system",
        data: { userName: "", trackTitle: "", artistName: "", dashboardUrl: "/dashboard" },
      });
      expect(enabled.sent).toBe(false);
      expect(enabled.reason).not.toBe("email_notifications_desactivado");

      await dbModule.updateUserPreferences(tempId, { ...prefs, email_notifications: false });

      const disabled = await sendNotificationEmail({
        userId: tempId,
        type: "system",
        data: { userName: "", trackTitle: "", artistName: "", dashboardUrl: "/dashboard" },
      });
      expect(disabled.sent).toBe(false);
      expect(disabled.reason).toBe("email_notifications_desactivado");
    } finally {
      await dbModule.deleteUser(tempId);
      expect(await dbModule.getUserById(tempId)).toBeNull();
      const leftover = db.prepare("SELECT COUNT(*) as c FROM users WHERE id = ?").get(tempId) as {
        c: number;
      };
      expect(leftover.c).toBe(0);
    }
  });
});

describe("P4.4 trigger POST /api/shows", () => {
  it("crea show + notificacion in-app + intenta email al artista dueño", async () => {
    delete process.env.RESEND_API_KEY;
    const dbModule = await import("@/lib/db");
    if (dbModule.isTursoConfigured()) return;
    const db = dbModule.getDbWrite();
    const userId = "tmp-p44-show-user";
    const adminId = "tmp-p44-admin";
    const venue = "Sala Smoke P4.4";

    const count = (sql: string, ...args: unknown[]) =>
      (db.prepare(sql).get(...args) as { c: number }).c;

    db.prepare("DELETE FROM notifications WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM shows WHERE venue_name = ?").run(venue);
    db.prepare("DELETE FROM artists WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);

    try {
      await dbModule.createUser({
        id: userId,
        name: "Artista Smoke",
        email: "smoke-p44@example.com",
        password_hash: "x",
        role: "artist",
        preferences: {
          email_notifications: true,
          push_notifications: false,
          new_release_alerts: true,
          show_alerts: true,
          marketing_emails: false,
        },
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      const artist = await dbModule.createArtist({ name: "Artista Smoke P44", userId });

      const { createSessionToken } = await import("@/lib/auth");
      const token = await createSessionToken({
        userId: adminId,
        email: "admin@epk.local",
        role: "admin",
        exp: Date.now() + 3600_000,
      });

      const { NextRequest } = await import("next/server");
      const req = new NextRequest("http://localhost:3000/api/shows", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `auth_session=${token}` },
        body: JSON.stringify({ artist_id: artist.id, venue_name: venue, date: "2026-12-31" }),
      });

      const { POST } = await import("@/app/api/shows/route");
      const { getEmailStats } = await import("@/lib/email");
      const skippedBefore = getEmailStats().skipped;
      const res = await POST(req);
      expect(res.status).toBe(201);

      const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ?").all(userId) as {
        type: string;
      }[];
      expect(notifs.some((n) => n.type === "show_pending_review")).toBe(true);

      const deadline = Date.now() + 3000;
      while (getEmailStats().skipped === skippedBefore && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(getEmailStats().skipped).toBeGreaterThan(skippedBefore);
      expect(count("SELECT COUNT(*) as c FROM shows WHERE venue_name = ?", venue)).toBe(1);
    } finally {
      await dbModule.deleteUser(userId);
      expect(count("SELECT COUNT(*) as c FROM users WHERE id = ?", userId)).toBe(0);
      expect(count("SELECT COUNT(*) as c FROM artists WHERE user_id = ?", userId)).toBe(0);
      expect(count("SELECT COUNT(*) as c FROM shows WHERE venue_name = ?", venue)).toBe(0);
      expect(count("SELECT COUNT(*) as c FROM notifications WHERE user_id = ?", userId)).toBe(0);
    }
  });
});
