import { NextRequest, NextResponse } from "next/server";
import { getUserNotifications, getUnreadNotificationCount } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { safeParseJSON } from "@/lib/null-safe";
import type { Notification } from "@/types/music";

const NOTIFICATIONS_LIMIT = 50;

function toNotificationDto(notification: Notification) {
  const rawData = safeParseJSON<unknown>(notification.data, null);
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: rawData !== null && typeof rawData === "object" ? (rawData as Record<string, unknown>) : null,
    read: notification.read === true,
    created_at: notification.created_at,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateRequest(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const unreadParam = searchParams.get("unread");
    const unreadOnly = unreadParam === "1" || unreadParam === "true";

    const [notifications, unread_count] = await Promise.all([
      getUserNotifications(session.userId, unreadOnly),
      getUnreadNotificationCount(session.userId),
    ]);

    return NextResponse.json({
      notifications: notifications.slice(0, NOTIFICATIONS_LIMIT).map(toNotificationDto),
      unread_count,
    });
  } catch (error) {
    console.error("GET notifications error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
