import { createNotification, getArtistById, getSubscriptionsByArtist, getUserById, getUserNotifications } from "@/lib/db";
import { sendNotificationEmail } from "@/lib/email";
import type { EmailTemplateData } from "@/lib/email-templates";
import type { NotificationType } from "@/types/music";

export type SubscriberEventKind = "release" | "show" | "show_update";

export interface NotifyArtistSubscribersInput {
  artistId: string;
  kind: SubscriberEventKind;
  title: string;
  message: string;
  data: Record<string, unknown>;
  emailType?: NotificationType;
  emailData?: Partial<EmailTemplateData>;
  maxRecipients?: number;
}

export interface NotifyArtistOwnerInput {
  artistId: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  emailType: NotificationType;
  emailData?: Partial<EmailTemplateData>;
}

export interface FanOutSummary {
  notified: number;
  emailsSent: number;
  skipped: number;
  failures: string[];
}

export const MAX_FANOUT_RECIPIENTS = 200;
export const FANOUT_DEDUP_WINDOW_MS = 5 * 60 * 1000;

const LOG_PREFIX = "[pressplay:fanout]";
const CONSTRAINT_RETRY_DELAYS_MS = [800, 2000];
const EMPTY_READ_RETRY_DELAY_MS = 1500;

async function getSubscriptionsWithRetry(artistId: string) {
  const first = await getSubscriptionsByArtist(artistId);
  if (first.length > 0) return first;
  await new Promise((resolve) => setTimeout(resolve, EMPTY_READ_RETRY_DELAY_MS));
  const second = await getSubscriptionsByArtist(artistId);
  if (second.length > 0 && first.length === 0) {
    console.info(`${LOG_PREFIX} lecturas de suscripciones reintentadas (${first.length} -> ${second.length})`);
  }
  return second;
}

function isConstraintError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("foreign key") || message.includes("constraint");
}

async function createNotificationWithRetry(params: {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: string;
  read: boolean;
}): Promise<void> {
  try {
    await createNotification(params);
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    for (const delay of CONSTRAINT_RETRY_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await createNotification(params);
        return;
      } catch (retryError) {
        if (!isConstraintError(retryError)) throw retryError;
      }
    }
    throw error;
  }
}

const EMAIL_TYPE_BY_KIND: Record<SubscriberEventKind, NotificationType> = {
  release: "new_release",
  show: "new_show",
  show_update: "show_postponed",
};

function toEpochMs(value: string | null | undefined): number {
  if (!value) return 0;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function asText(value: unknown, fallback = ""): string {
  const str = value === null || value === undefined ? "" : String(value).trim();
  return str || fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildEmailData(
  kind: SubscriberEventKind,
  title: string,
  message: string,
  data: Record<string, unknown>,
  artistName: string,
  extra?: Partial<EmailTemplateData>
): EmailTemplateData {
  const venue = asText(data.showVenue ?? data.venue_name);
  const date = asText(data.showDate ?? data.date);
  return {
    userName: "",
    trackTitle: asText(data.trackTitle ?? data.title ?? data.releaseTitle ?? venue, title),
    artistName: asText(data.artistName, artistName),
    dashboardUrl: asText(data.dashboardUrl, "/dashboard"),
    context: kind === "release" ? "release" : "show",
    showVenue: venue || undefined,
    showDate: date || undefined,
    notificationTitle: title,
    notificationMessage: message,
    ...(extra ?? {}),
  };
}

function queueEmail(
  summary: FanOutSummary,
  userId: string,
  type: NotificationType,
  data: EmailTemplateData
): Promise<void> {
  return sendNotificationEmail({ userId, type, data })
    .then((result) => {
      if (result.sent) summary.emailsSent += 1;
    })
    .catch((error) => {
      summary.failures.push(`${userId}: email: ${errorMessage(error)}`);
    });
}

async function notifyUser(
  summary: FanOutSummary,
  jobs: Promise<void>[],
  input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data: Record<string, unknown>;
    emailData: EmailTemplateData;
  }
): Promise<void> {
  try {
    const user = await getUserById(input.userId);
    if (!user) {
      summary.skipped += 1;
      return;
    }

    const payload = JSON.stringify(input.data);
    const recent = await getUserNotifications(user.id);
    const fiveMinutesAgo = Date.now() - FANOUT_DEDUP_WINDOW_MS;
    const isDuplicate = recent.some(
      (n) =>
        n.type === input.type &&
        n.data === payload &&
        toEpochMs(n.created_at) >= fiveMinutesAgo
    );
    if (isDuplicate) {
      summary.skipped += 1;
      return;
    }

    const wantsInApp = user.preferences?.push_notifications !== false;
    if (wantsInApp) {
      await createNotificationWithRetry({
        id: crypto.randomUUID(),
        user_id: user.id,
        type: input.type,
        title: input.title,
        message: input.message,
        data: payload,
        read: false,
      });
      summary.notified += 1;
    } else {
      summary.skipped += 1;
    }

    jobs.push(
      queueEmail(summary, user.id, input.type, {
        ...input.emailData,
        userName: input.emailData.userName || user.name,
      })
    );
  } catch (error) {
    summary.failures.push(`${input.userId}: ${errorMessage(error)}`);
  }
}

function logSummary(scope: string, summary: FanOutSummary, jobs: number): void {
  console.info(
    `${LOG_PREFIX} ${scope} notified=${summary.notified} emails=${summary.emailsSent} queued=${jobs} skipped=${summary.skipped} failures=${summary.failures.length}`
  );
  if (summary.failures.length > 0) {
    console.warn(`${LOG_PREFIX} ${scope} fallos: ${summary.failures.join(" | ")}`);
  }
}

export async function notifyArtistSubscribers(
  input: NotifyArtistSubscribersInput
): Promise<FanOutSummary> {
  const summary: FanOutSummary = { notified: 0, emailsSent: 0, skipped: 0, failures: [] };
  const jobs: Promise<void>[] = [];

  try {
    const artist = await getArtistById(input.artistId);
    const ownerUserId = artist?.user_id ?? null;
    const prefKey = input.kind === "release" ? "notify_releases" : "notify_shows";
    const subscriptions = await getSubscriptionsWithRetry(input.artistId);
    const eligible = subscriptions.filter((subscription) => subscription[prefKey]);
    summary.skipped += subscriptions.length - eligible.length;

    const limit = input.maxRecipients ?? MAX_FANOUT_RECIPIENTS;
    const truncated = Math.max(0, eligible.length - limit);
    const targets = eligible.slice(0, Math.max(0, limit));
    if (truncated > 0) {
      summary.skipped += truncated;
      console.warn(
        `${LOG_PREFIX} truncado: ${truncated} de ${eligible.length} destinatarios omitidos (límite ${limit})`
      );
    }

    const emailType = input.emailType ?? EMAIL_TYPE_BY_KIND[input.kind];
    const emailData = buildEmailData(
      input.kind,
      input.title,
      input.message,
      input.data,
      artist?.name ?? "",
      input.emailData
    );

    for (const subscription of targets) {
      if (ownerUserId && subscription.subscriber_id === ownerUserId) {
        summary.skipped += 1;
        continue;
      }
      await notifyUser(summary, jobs, {
        userId: subscription.subscriber_id,
        type: emailType,
        title: input.title,
        message: input.message,
        data: input.data,
        emailData,
      });
    }

    logSummary(`subscriptores artist=${input.artistId} kind=${input.kind}`, summary, jobs.length);
  } catch (error) {
    summary.failures.push(errorMessage(error));
    console.error(`${LOG_PREFIX} error en fan-out: ${errorMessage(error)}`);
  }

  if (jobs.length > 0) {
    void Promise.allSettled(jobs).then(() => {
      console.info(
        `${LOG_PREFIX} emails resueltos artist=${input.artistId} sent=${summary.emailsSent} failures=${summary.failures.length}`
      );
    });
  }

  return summary;
}

export async function notifyArtistOwner(input: NotifyArtistOwnerInput): Promise<FanOutSummary> {
  const summary: FanOutSummary = { notified: 0, emailsSent: 0, skipped: 0, failures: [] };
  const jobs: Promise<void>[] = [];

  try {
    const artist = await getArtistById(input.artistId);
    const userId = artist?.user_id ?? null;
    if (!userId) {
      summary.skipped += 1;
      console.warn(`${LOG_PREFIX} sin usuario dueño para artist=${input.artistId}`);
      return summary;
    }

    await notifyUser(summary, jobs, {
      userId,
      type: input.emailType,
      title: input.title,
      message: input.message,
      data: input.data,
      emailData: buildEmailData(
        "show",
        input.title,
        input.message,
        input.data,
        artist?.name ?? "",
        input.emailData
      ),
    });

    logSummary(`artista owner artist=${input.artistId}`, summary, jobs.length);
  } catch (error) {
    summary.failures.push(errorMessage(error));
    console.error(`${LOG_PREFIX} error notificando al artista: ${errorMessage(error)}`);
  }

  if (jobs.length > 0) {
    void Promise.allSettled(jobs).then(() => {
      console.info(
        `${LOG_PREFIX} email artista resuelto artist=${input.artistId} sent=${summary.emailsSent}`
      );
    });
  }

  return summary;
}
