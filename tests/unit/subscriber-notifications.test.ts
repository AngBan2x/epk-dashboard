import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import path from "path";
import {
  createArtist,
  createSubscription,
  createUser,
  deleteUser,
  getUserNotifications,
} from "@/lib/db";
import {
  MAX_FANOUT_RECIPIENTS,
  notifyArtistOwner,
  notifyArtistSubscribers,
} from "@/lib/subscriber-notifications";
import { getEmailTemplate, type NotificationType as EmailNotificationType } from "@/lib/email-templates";
import type { NotificationType } from "@/types/music";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

const DEFAULT_PREFS = {
  email_notifications: true,
  push_notifications: true,
  new_release_alerts: true,
  show_alerts: true,
  marketing_emails: false,
};

const createdUserIds: string[] = [];

function cleanTestData() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = OFF");
  for (const userId of [...createdUserIds]) {
    db.exec(`DELETE FROM subscriptions WHERE subscriber_id = '${userId}'`);
    db.exec(`DELETE FROM notifications WHERE user_id = '${userId}'`);
    db.exec(
      `DELETE FROM subscriptions WHERE artist_id IN (SELECT id FROM artists WHERE user_id = '${userId}')`
    );
    db.exec(`DELETE FROM shows WHERE artist_id IN (SELECT id FROM artists WHERE user_id = '${userId}')`);
    db.exec(`DELETE FROM artists WHERE user_id = '${userId}'`);
    db.exec(`DELETE FROM users WHERE id = '${userId}'`);
  }
  createdUserIds.length = 0;
  db.close();
}

interface Fixture {
  artistId: string;
  artistUserId: string;
}

async function createFixture(): Promise<Fixture> {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const artistUserId = `fanout-${randomUUID()}`;
  createdUserIds.push(artistUserId);
  await createUser({
    id: artistUserId,
    name: "Artista Fanout",
    email: `fanout-artist-${suffix}@example.com`,
    password_hash: "x",
    role: "artist",
    preferences: { ...DEFAULT_PREFS },
    avatar: null,
    email_verified: false,
    deleted_at: null,
    last_login: null,
  });
  const artist = await createArtist({ name: `Artista Fanout ${suffix}`, userId: artistUserId });
  return { artistId: artist.id, artistUserId };
}

async function createSubscriber(
  artistId: string,
  options: { notify_releases: boolean; notify_shows: boolean; push?: boolean }
): Promise<string> {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const userId = `fanout-${randomUUID()}`;
  createdUserIds.push(userId);
  await createUser({
    id: userId,
    name: "Suscriptor Fanout",
    email: `fanout-sub-${suffix}@example.com`,
    password_hash: "x",
    role: "subscriber",
    preferences: { ...DEFAULT_PREFS, push_notifications: options.push ?? true },
    avatar: null,
    email_verified: false,
    deleted_at: null,
    last_login: null,
  });
  await createSubscription({
    id: `fanout-${randomUUID()}`,
    subscriber_id: userId,
    artist_id: artistId,
    notify_releases: options.notify_releases,
    notify_shows: options.notify_shows,
  });
  return userId;
}

const EVENT = {
  kind: "show_update" as const,
  title: "Show pospuesto",
  message: 'El show "Sala Prueba" fue pospuesto al 2026-12-31. Motivo: problemas técnicos',
  data: {
    show_id: "show-test-fanout",
    showId: "show-test-fanout",
    venue_name: "Sala Prueba",
    showVenue: "Sala Prueba",
    showDate: "2026-12-31",
    reason: "problemas técnicos",
    dashboardUrl: "/shows",
  },
  emailType: "show_postponed" as NotificationType,
};

describe("P4.6b notifyArtistSubscribers", () => {
  beforeAll(() => {
    delete process.env.RESEND_API_KEY;
    cleanTestData();
  });

  afterAll(() => {
    cleanTestData();
  });

  beforeEach(() => {
    cleanTestData();
  });

  it("notifica a los suscriptores con notify_shows y excluye al dueño del artista", async () => {
    const fixture = await createFixture();
    const subscriberId = await createSubscriber(fixture.artistId, {
      notify_releases: true,
      notify_shows: true,
    });
    await createSubscription({
      id: `fanout-${randomUUID()}`,
      subscriber_id: fixture.artistUserId,
      artist_id: fixture.artistId,
      notify_releases: true,
      notify_shows: true,
    });

    const summary = await notifyArtistSubscribers({
      artistId: fixture.artistId,
      ...EVENT,
    });

    expect(summary.notified).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failures).toEqual([]);

    const subscriberNotifications = await getUserNotifications(subscriberId);
    expect(subscriberNotifications).toHaveLength(1);
    expect(subscriberNotifications[0].type).toBe("show_postponed");
    expect(subscriberNotifications[0].title).toBe(EVENT.title);
    expect(subscriberNotifications[0].message).toContain("pospuesto");
    expect(JSON.parse(subscriberNotifications[0].data ?? "{}").show_id).toBe("show-test-fanout");

    const ownerNotifications = await getUserNotifications(fixture.artistUserId);
    expect(ownerNotifications).toHaveLength(0);

    await deleteUser(fixture.artistUserId);
    await deleteUser(subscriberId);
  });

  it("respeta notify_shows y notify_releases de cada suscripcion", async () => {
    const fixture = await createFixture();
    const showsOff = await createSubscriber(fixture.artistId, {
      notify_releases: true,
      notify_shows: false,
    });
    const releasesOff = await createSubscriber(fixture.artistId, {
      notify_releases: false,
      notify_shows: true,
    });

    const showSummary = await notifyArtistSubscribers({ artistId: fixture.artistId, ...EVENT });
    expect(showSummary.notified).toBe(1);
    expect(showSummary.skipped).toBe(1);
    expect(await getUserNotifications(showsOff)).toHaveLength(0);
    expect(await getUserNotifications(releasesOff)).toHaveLength(1);

    const releaseSummary = await notifyArtistSubscribers({
      artistId: fixture.artistId,
      kind: "release",
      title: "Nuevo release publicado",
      message: '"Single Prueba" ya está disponible en PressPlay.',
      data: {
        releaseId: "track-test-fanout",
        trackTitle: "Single Prueba",
        artistName: "Artista Fanout",
        dashboardUrl: "/releases",
      },
      emailType: "new_release",
    });
    expect(releaseSummary.notified).toBe(1);
    expect(releaseSummary.skipped).toBe(1);
    expect(await getUserNotifications(showsOff)).toHaveLength(1);
    expect(await getUserNotifications(releasesOff)).toHaveLength(1);

    await deleteUser(fixture.artistUserId);
    await deleteUser(showsOff);
    await deleteUser(releasesOff);
  });

  it("deduplica eventos identicos dentro de los 5 minutos", async () => {
    const fixture = await createFixture();
    const subscriberId = await createSubscriber(fixture.artistId, {
      notify_releases: true,
      notify_shows: true,
    });

    const first = await notifyArtistSubscribers({ artistId: fixture.artistId, ...EVENT });
    expect(first.notified).toBe(1);

    const second = await notifyArtistSubscribers({ artistId: fixture.artistId, ...EVENT });
    expect(second.notified).toBe(0);
    expect(second.skipped).toBe(1);
    expect(await getUserNotifications(subscriberId)).toHaveLength(1);

    const otherEvent = await notifyArtistSubscribers({
      artistId: fixture.artistId,
      ...EVENT,
      data: { ...EVENT.data, show_id: "show-fanout-2", showId: "show-fanout-2" },
    });
    expect(otherEvent.notified).toBe(1);
    expect(await getUserNotifications(subscriberId)).toHaveLength(2);

    await deleteUser(fixture.artistUserId);
    await deleteUser(subscriberId);
  });

  it("no crea notificacion in-app cuando push_notifications esta desactivado", async () => {
    const fixture = await createFixture();
    const pushOff = await createSubscriber(fixture.artistId, {
      notify_releases: true,
      notify_shows: true,
      push: false,
    });

    const summary = await notifyArtistSubscribers({ artistId: fixture.artistId, ...EVENT });
    expect(summary.notified).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(await getUserNotifications(pushOff)).toHaveLength(0);

    await deleteUser(fixture.artistUserId);
    await deleteUser(pushOff);
  });

  it("acota el fan-out al limite de destinatarios", async () => {
    expect(MAX_FANOUT_RECIPIENTS).toBe(200);
    const fixture = await createFixture();
    const first = await createSubscriber(fixture.artistId, {
      notify_releases: true,
      notify_shows: true,
    });
    const second = await createSubscriber(fixture.artistId, {
      notify_releases: true,
      notify_shows: true,
    });
    const third = await createSubscriber(fixture.artistId, {
      notify_releases: true,
      notify_shows: true,
    });

    const summary = await notifyArtistSubscribers({
      artistId: fixture.artistId,
      ...EVENT,
      maxRecipients: 1,
    });
    expect(summary.notified).toBe(1);
    expect(summary.skipped).toBe(2);

    await deleteUser(fixture.artistUserId);
    await deleteUser(first);
    await deleteUser(second);
    await deleteUser(third);
  });

  it("notifyArtistOwner avisa al artista dueño del evento", async () => {
    const fixture = await createFixture();

    const summary = await notifyArtistOwner({
      artistId: fixture.artistId,
      title: EVENT.title,
      message: EVENT.message,
      data: EVENT.data,
      emailType: "show_postponed",
      emailData: { showVenue: "Sala Prueba", showDate: "2026-12-31" },
    });

    expect(summary.notified).toBe(1);
    expect(summary.failures).toEqual([]);
    const ownerNotifications = await getUserNotifications(fixture.artistUserId);
    expect(ownerNotifications).toHaveLength(1);
    expect(ownerNotifications[0].type).toBe("show_postponed");

    await deleteUser(fixture.artistUserId);
  });

  it("no lanza excepciones ante un artista inexistente", async () => {
    const summary = await notifyArtistSubscribers({
      artistId: "art-que-no-existe",
      ...EVENT,
    });
    expect(summary.notified).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.failures).toEqual([]);

    const ownerSummary = await notifyArtistOwner({
      artistId: "art-que-no-existe",
      title: EVENT.title,
      message: EVENT.message,
      data: EVENT.data,
      emailType: "show_postponed",
    });
    expect(ownerSummary.notified).toBe(0);
    expect(ownerSummary.skipped).toBe(1);
  });
});

describe("P4.6b plantillas de email nuevas", () => {
  const DATA = {
    userName: "Ana <script>alert(1)</script>",
    trackTitle: 'Sala <b>Roca</b> & "Madness"',
    artistName: `DJ <img src=x onerror=alert(2)>`,
    dashboardUrl: "/shows",
    context: "show" as const,
    showVenue: 'Sala <b>Roca</b> & "Madness"',
    showDate: "2026-12-31",
    reason: `Motivo <iframe src=evil></iframe> & "raro"`,
    refundNote: `Reembolso <script>evil()</script>`,
    notificationTitle: "Tu show ya pasó",
    notificationMessage: 'Mensaje "con comillas" & <u>subrayado</u>',
  };

  const NEW_TYPES: EmailNotificationType[] = [
    "show_postponed",
    "show_cancelled",
    "show_reactivated",
    "new_show",
    "new_release",
  ];

  it("genera asunto, html y texto para cada tipo nuevo", () => {
    for (const type of NEW_TYPES) {
      const template = getEmailTemplate(type, DATA);
      expect(template.subject.length).toBeGreaterThan(0);
      expect(template.html).toContain("<!DOCTYPE html>");
      expect(template.text.length).toBeGreaterThan(0);
    }
  });

  it("escapa los datos dinamicos en los tipos nuevos", () => {
    for (const type of NEW_TYPES) {
      const template = getEmailTemplate(type, DATA);
      expect(template.html).not.toContain("<script>");
      expect(template.html).not.toContain("<img src=x");
      expect(template.html).not.toContain("<iframe");
      expect(template.html).toContain("&lt;script&gt;");
    }
  });

  it("incluye el motivo y el aviso de reembolso en la cancelacion", () => {
    const template = getEmailTemplate("show_cancelled", DATA);
    expect(template.subject).toContain("cancelado");
    expect(template.html).toContain("Reembolso:");
    expect(template.html).toContain("Motivo:");
    expect(template.text).toContain("Motivo: ");
  });

  it("incluye la nueva fecha en el pospuesto", () => {
    const template = getEmailTemplate("show_postponed", DATA);
    expect(template.subject).toContain("pospuesto");
    expect(template.html).toContain("2026-12-31");
    expect(template.text).toContain("Nueva fecha: 2026-12-31");
  });
});
