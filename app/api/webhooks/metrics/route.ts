import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { upsertMetricsHistory, getMetricsHistoryByTrack } from "@/lib/db";

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
  signature: z.string().optional(), // Para verificación HMAC futura
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = MetricsWebhookSchema.parse(body);

    // Verificar que el track existe
    const trackExists = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/tracks/${validated.track_id}`, {
      headers: { Accept: "application/json" },
    });
    if (!trackExists.ok) {
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