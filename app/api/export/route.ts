import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildExportBundle, ExportError } from "@/lib/export-bundle";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// pdfkit lee ficheros con `fs` y escribe en un stream de Node: no corre en edge.
export const runtime = "nodejs";

/**
 * `POST /api/export` es publico (el DownloadCenter se monta tambien en la pagina
 * del artista, sin sesion) y cada peticion lee fresco de Turso, asi que sin limite
 * es abusable. 20 generaciones por minuto y IP: de sobra para prensa, y corta
 * los bucles de scraping.
 */
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const ExportBodySchema = z.object({
  format: z
    .enum(["html", "json", "pdf"], {
      errorMap: () => ({ message: 'format debe ser "html", "json" o "pdf"' }),
    })
    .optional(),
  artist_id: z
    .string({ invalid_type_error: "artist_id debe ser texto" })
    .trim()
    .min(1, "artist_id no puede estar vacío")
    .max(120, "artist_id no puede superar 120 caracteres")
    .optional(),
  include: z
    .array(
      z.enum(["dossier", "rider", "catalog"], {
        errorMap: () => ({ message: "include admite solo: dossier, rider, catalog" }),
      }),
      { errorMap: () => ({ message: "include debe ser un arreglo de secciones" }) }
    )
    .min(1, "include debe tener al menos una sección")
    .max(3, "include admite como máximo 3 secciones")
    .optional(),
});

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "cuerpo";
      if (issue.code === "invalid_enum_value") {
        return `${field}: valor no permitido (opciones: ${issue.options.join(", ")})`;
      }
      if (issue.code === "invalid_type") {
        return `${field}: se esperaba ${issue.expected}`;
      }
      if (issue.code === "too_small") {
        return `${field}: no cumple el mínimo permitido (${String(issue.minimum)})`;
      }
      if (issue.code === "too_big") {
        return `${field}: supera el máximo permitido (${String(issue.maximum)})`;
      }
      return `${field}: valor no válido`;
    })
    .join("; ");
}

export async function POST(req: NextRequest) {
  const blocked = enforceRateLimit(req, "export", null, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (blocked) return blocked;

  let rawBody: unknown = null;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de solicitud inválido: se esperaba JSON" }, { status: 400 });
  }

  const parsed = ExportBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Solicitud inválida — ${formatIssues(parsed.error.issues)}` },
      { status: 400 }
    );
  }

  try {
    const bundle = await buildExportBundle({
      format: parsed.data.format ?? "json",
      artistId: parsed.data.artist_id ?? null,
      include: parsed.data.include ?? null,
    });

    // `Buffer` es un `Uint8Array` y `BodyInit` lo acepta, pero se pasa
    // explicitamente: asi el tipo de la respuesta no depende de como Next.js
    // defina `BodyInit` en cada version.
    const body = typeof bundle.body === "string" ? bundle.body : new Uint8Array(bundle.body);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": bundle.contentType,
        "Content-Disposition": `attachment; filename="${bundle.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[API/Export] Error:", error);
    // TEMPORAL: expone el mensaje real para diagnosticar el 500 del PDF en
    // produccion, donde no hay acceso a los logs de Vercel desde el entorno de
    // trabajo. Se revierte en cuanto se encuentre la causa.
    return NextResponse.json(
      { error: "Error al generar la exportación", debug: String((error as Error)?.message ?? error) },
      { status: 500 }
    );
  }
}
