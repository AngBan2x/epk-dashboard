import { NextRequest, NextResponse } from "next/server";
import { getArtistById, getShowById } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import type { Show } from "@/types/music";

export interface ShowActor {
  userId: string;
  role: string;
}

export type ShowAuthResult =
  | { ok: true; actor: ShowActor; show: Show }
  | { ok: false; response: NextResponse };

export async function authorizeShowTransition(req: NextRequest, showId: string): Promise<ShowAuthResult> {
  const session = await validateRequest(req);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }

  const show = await getShowById(showId);
  if (!show) {
    return { ok: false, response: NextResponse.json({ error: "Show no encontrado" }, { status: 404 }) };
  }

  if (session.role !== "admin") {
    if (session.role !== "artist") {
      return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
    }
    const artist = await getArtistById(show.artist_id);
    if (!artist || artist.user_id !== session.userId) {
      return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
    }
  }

  return { ok: true, actor: { userId: session.userId, role: session.role }, show };
}

export function parseShowDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function isFutureDate(value: string): boolean {
  const date = parseShowDate(value);
  if (!date) return false;
  return date.getTime() > startOfToday().getTime();
}

export function hasFutureDate(value: string | null): boolean {
  if (!value) return false;
  return isFutureDate(value.slice(0, 10));
}
