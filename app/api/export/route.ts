import { NextRequest, NextResponse } from "next/server";
import { getAllTracks } from "@/lib/db";
import { safeString, safeNumber, safeArray } from "@/lib/null-safe";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { format?: string };
    const format = body.format === "html" ? "html" : "json";

    const tracks = getAllTracks();

    if (format === "json") {
      const exportData = {
        exported_at: new Date().toISOString(),
        version: "F9-2026",
        catalog: {
          total_tracks: tracks.length,
          tracks: tracks.map((t) => ({
            id: t.id,
            title: safeString(t.title),
            release_type: safeString(t.release_type),
            release_date: safeString(t.release_date),
            duration: safeString(t.duration),
            metrics: {
              streams: safeNumber(t.metrics?.streams),
              saves: safeNumber(t.metrics?.saves),
              playlist_additions: safeNumber(t.metrics?.playlist_additions),
              top_countries: safeArray(t.metrics?.top_countries),
            },
            production_details: t.production_details,
            lyrics: t.lyrics ?? null,
            spotify_url: t.spotify_url ?? null,
            youtube_video_id: t.youtube_video_id ?? null,
            itunes_track_id: t.itunes_track_id ?? null,
            video_embed_url: t.video_embed_url ?? null,
            stems_available: t.stems_urls !== null,
            gallery_images_count: t.gallery_images?.length ?? 0,
          })),
        },
      };

      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="EPK_Dossier_${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    // HTML export — ficha técnica imprimible
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EPK Dossier de Prensa</title>
  <style>
    body { font-family: 'Georgia', serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #0f172a; }
    h1 { font-size: 2.5rem; border-bottom: 4px solid #db2777; padding-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; color: #be185d; margin-top: 2rem; }
    .track { border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; margin: 1rem 0; }
    .badge { display: inline-block; background: #fce7f3; color: #be185d; border-radius: 9999px; padding: 0.2rem 0.8rem; font-size: 0.8rem; font-weight: bold; margin-bottom: 0.5rem; }
    .meta { color: #475569; font-size: 0.9rem; margin: 0.3rem 0; }
    .stats { display: flex; gap: 2rem; margin: 1rem 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #db2777; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }
    @media print { body { padding: 1rem; } }
  </style>
</head>
<body>
  <h1>🎵 PressPlay — Dossier de Prensa</h1>
  <p class="meta">Generado el ${new Date().toLocaleDateString("es-VE", { year: "numeric", month: "long", day: "numeric" })}</p>
  <p class="meta">Total de tracks en catálogo: <strong>${tracks.length}</strong></p>

  ${tracks
    .map(
      (t) => `
  <div class="track">
    <span class="badge">${safeString(t.release_type)}</span>
    <h2>${safeString(t.title)}</h2>
    <div class="stats">
      <div class="stat"><div class="stat-value">${new Intl.NumberFormat("es-VE").format(safeNumber(t.metrics?.streams))}</div><div class="stat-label">Streams</div></div>
      <div class="stat"><div class="stat-value">${new Intl.NumberFormat("es-VE").format(safeNumber(t.metrics?.saves))}</div><div class="stat-label">Saves</div></div>
      <div class="stat"><div class="stat-value">${t.duration}</div><div class="stat-label">Duración</div></div>
    </div>
    <p class="meta"><strong>Lanzamiento:</strong> ${safeString(t.release_date)}</p>
    ${t.production_details?.daw ? `<p class="meta"><strong>DAW:</strong> ${safeString(t.production_details.daw)}</p>` : ""}
    ${t.production_details?.key ? `<p class="meta"><strong>Tonalidad:</strong> ${safeString(t.production_details.key)}</p>` : ""}
    ${t.spotify_url ? `<p class="meta"><strong>Spotify:</strong> <a href="${t.spotify_url}" target="_blank">${t.spotify_url}</a></p>` : ""}
    ${t.stems_urls ? `<p class="meta">✅ Stems multicanal disponibles</p>` : ""}
  </div>`
    )
    .join("\n")}
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="EPK_Dossier_${new Date().toISOString().slice(0, 10)}.html"`,
      },
    });
  } catch (error) {
    console.error("[API/Export] Error:", error);
    return NextResponse.json({ error: "Error al generar el dossier" }, { status: 500 });
  }
}
