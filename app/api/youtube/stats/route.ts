import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getVideoStats, getVideoStatsBatch, YOUTUBE_BATCH_LIMIT } from "@/lib/youtube";
import { enforceRateLimit } from "@/lib/rate-limit";
import { httpStatusForReason, reasonApiMessageEs } from "@/lib/integration-reasons";

export const dynamic = "force-dynamic";

/**
 * Fase E. `ids` acepta hasta 100 video ids (2 lotes de 50) para que una
 * rejilla entera del dashboard entre en una sola llamada a nuestra API. Cada
 * id se valida con el formato real de YouTube antes de tocar la red.
 */
const MAX_IDS_PER_REQUEST = 100;
const VideoId = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/, "formato de video id inválido");

const IdsParam = z
  .string()
  .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
  .pipe(z.array(VideoId).min(1).max(MAX_IDS_PER_REQUEST));

/**
 * Dos modos, por compatibilidad:
 *  - `?videoId=X`  → devuelve las stats planas de un video (lo que esperaba
 *                    `UnifiedMetrics` antes de la Fase E).
 *  - `?ids=A,B,C`  → devuelve `{ stats: { id: {...} }, reason }`. Es lo que
 *                    usan las rejillas: N tracks → 1 llamada, no N.
 */
export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, "youtube-stats", null, 60, 60_000);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const videoIdParam = searchParams.get("videoId");
  const idsParam = searchParams.get("ids");

  if (!videoIdParam && !idsParam) {
    return NextResponse.json(
      { error: "Se requiere videoId o ids" },
      { status: 400 },
    );
  }

  if (idsParam) {
    const parsed = IdsParam.safeParse(idsParam);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `ids inválidos (máximo ${MAX_IDS_PER_REQUEST}, separados por comas)`,
          reason: "not_found",
        },
        { status: 400 },
      );
    }

    const result = await getVideoStatsBatch(parsed.data);
    if (!result.ok) {
      return NextResponse.json(
        {
          stats: {},
          reason: result.reason,
          error: reasonApiMessageEs(result.reason, "YouTube"),
        },
        { status: httpStatusForReason(result.reason) },
      );
    }

    const stats: Record<string, { viewCount: number; likeCount: number }> = {};
    for (const [id, value] of result.data) {
      stats[id] = { viewCount: value.viewCount, likeCount: value.likeCount };
    }
    return NextResponse.json(
      { stats, reason: null, batchSize: parsed.data.length, maxBatch: YOUTUBE_BATCH_LIMIT },
      { status: 200 },
    );
  }

  const parsedId = VideoId.safeParse((videoIdParam as string).trim());
  if (!parsedId.success) {
    return NextResponse.json({ error: "videoId inválido" }, { status: 400 });
  }

  const result = await getVideoStats(parsedId.data);
  if (!result.ok) {
    const status = httpStatusForReason(result.reason);
    return NextResponse.json(
      {
        error: reasonApiMessageEs(result.reason, "YouTube"),
        reason: result.reason,
        // Un `not_found` con 200 es "este video no tiene datos", no un error.
        ...(result.reason === "not_found" ? { viewCount: null, likeCount: null } : {}),
      },
      { status },
    );
  }
  return NextResponse.json({ ...result.data, reason: null }, { status: 200 });
}
