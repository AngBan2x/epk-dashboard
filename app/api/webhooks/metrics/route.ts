import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { upsertMetricsHistory, getMetricsHistoryByTrack, getTrackById } from "@/lib/db";
import { verifyWebhookSignature, requireAdmin } from "@/lib/webhook-auth";

const MetricsWebhookSchema = z.object({
  track_id: z.string().min(1, "track_id requerido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  streams: z.number().int().min(0).default(0),
  saves: z.number().int().min(0).default(0),
  playlist_additions: z.number().int().min(0).default(0),
  top_countries: z.array(z.object({
    country: z.string(),
    pct: z.number().min(0).max(100),
  })).default([]),
  source: z.string().min(1, "source requerido"),
  signature: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headerSignature = req.headers.get("x-webhook-signature");

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const payload = parsed as Record<string, unknown>;
    const inBodySignature = typeof payload.signature === "string" ? payload.signature : null;
    const provided = headerSignature ?? inBodySignature;

    const authorized =
      (await verifyWebhookSignature(rawBody, headerSignature)) ||
      (inBodySignature !== null && (await verifyWebhookSignature(rawBody, inBodySignature)));

    if (!authorized) {
      const denied = await requireAdmin(req);
      if (denied) {
        return NextResponse.json(
          { error: "Falta la firma HMAC válida en x-webhook-signature o un rol de administrador" },
          { status: 401 }
        );
      }
    }

    const validated = MetricsWebhookSchema.parse(parsed);

    const track = await getTrackById(validated.track_id);
    if (!track) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    const id = randomUUID();
    const metrics = await upsertMetricsHistory({
      id,
      track_id: validated.track_id,
      date: validated.date,
      streams: validated.streams,
      saves: validated.saves,
      playlist_additions: validated.playlist_additions,
      top_countries: validated.top_countries,
      source: validated.source,
    });

    return NextResponse.json({ metrics, message: "Métricas actualizadas" }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("Webhook metrics error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const trackId = searchParams.get("track_id");
    const date = searchParams.get("date");
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    if (!trackId) {
      return NextResponse.json({ error: "track_id requerido" }, { status: 400 });
    }

    if (date) {
      // Query para fecha específica - necesitaríamos agregar esta función
      const history = await getMetricsHistoryByTrack(trackId);
      const filtered = history.filter(h => h.date === date);
      return NextResponse.json(filtered);
    }

    const history = await getMetricsHistoryByTrack(trackId);
    return NextResponse.json(history.slice(0, limit));
  } catch (error) {
    console.error("GET webhook metrics error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}