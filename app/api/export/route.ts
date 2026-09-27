import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildExportBundle, ExportError } from "@/lib/export-bundle";

export const dynamic = "force-dynamic";

const ExportBodySchema = z.object({
  format: z
    .enum(["html", "json"], { errorMap: () => ({ message: 'format debe ser "html" o "json"' }) })
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

    return new NextResponse(bundle.body, {
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
    return NextResponse.json({ error: "Error al generar la exportación" }, { status: 500 });
  }
}
