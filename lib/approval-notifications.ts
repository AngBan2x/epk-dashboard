import { createNotification, getUserNotifications } from "@/lib/db";
import { sendNotificationEmail } from "@/lib/email";
import { NotificationType } from "@/types/music";

interface NotifyApprovalDecisionInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  context: "track" | "show" | "release";
  adminNotes?: string;
}

function toEpochMs(value: string | null | undefined): number {
  if (!value) return 0;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function notifyApprovalDecision(input: NotifyApprovalDecisionInput): Promise<{
  notificationCreated: boolean;
  emailSent: boolean;
}> {
  const { userId, type, title, message, data, context, adminNotes } = input;

  const recentNotifications = await getUserNotifications(userId);
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

  const isDuplicate = recentNotifications.some(
    (n) =>
      n.type === type &&
      n.data === JSON.stringify(data) &&
      toEpochMs(n.created_at) >= fiveMinutesAgo
  );

  let notificationCreated = false;

  if (!isDuplicate) {
    const notificationId = crypto.randomUUID();
    await createNotification({
      id: notificationId,
      user_id: userId,
      type,
      title,
      message,
      data: JSON.stringify(data),
      read: false,
    });
    notificationCreated = true;
  }

  const emailResult = await sendNotificationEmail({
    userId,
    type,
    data: {
      userName: "",
      trackTitle: data.trackTitle as string,
      artistName: data.artistName as string,
      adminNotes: type === "submission_rejected" || type === "revision_requested" ? adminNotes : undefined,
      dashboardUrl: "/dashboard",
      context,
      showVenue: data.showVenue as string,
      showDate: data.showDate as string,
    },
  });

  return {
    notificationCreated,
    emailSent: emailResult.sent,
  };
}