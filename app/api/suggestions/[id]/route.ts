import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteSuggestion,
  getSuggestionById,
  isSuggestionStatus,
  updateSuggestionStatus,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * P4 · Acciones del admin sobre UNA sugerencia. Solo admin, comprobado aquí en
 * servidor.
 *
 * `PATCH` cambia estado y notas internas; `DELETE` borra. Van en dos verbos y no
 * en un `action` dentro del body (que es lo que hace `api/admin/approvals/[id]`)
 * porque aquí solo hay dos operaciones que no se parecen en nada: una muta y la
 * otra destruye. Un verbo por intención hace que un borrado no pueda colarse en
 * un cliente que solo quería editar.
 */

/**
 * 401 sin sesión, 403 con sesión de otro rol. La distinción no es cosmética: sin
 * sesión la respuesta es «no estás dentro»; con sesión de artista es «no te
 * toca». Un `artist` o un `subscriber` NO ven el buzón aunque tengan cuenta.
 */
async function requireAdmin(req: NextRequest): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await validateRequest(req);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }
  if (session.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    };
  }
  return { ok: true, userId: session.userId };
}

/** Máximo de las notas internas. El mensaje del usuario sí admite 5000. */
const ADMIN_NOTES_MAX = 2000;

const PatchSchema = z
  .object({
    status: z.string().optional(),
    admin_notes: z.string().max(ADMIN_NOTES_MAX, "Las notas son demasiado largas.").optional(),
  })
  .refine(
    (data) => data.status !== undefined || data.admin_notes !== undefined,
    "No hay nada que actualizar."
  );

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) return admin.response;

    const suggestion = await getSuggestionById(params.id);
    if (!suggestion) {
      return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
    }

    return NextResponse.json(suggestion, {
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
    });
  } catch (error) {
    console.error("GET suggestion detail error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * Cambio de estado y/o notas internas.
 *
 * El estado se valida contra la lista de la tabla (`isSuggestionStatus`) en lugar
 * de pasarse tal cual a la columna: sin ese filtro, un `{ status: "lo-que-sea" }`
 * deja una fila que la UI no sabe pintar y que el contador por estado no cuenta.
 * El motivo va en la respuesta y no solo en el log, para que el panel pueda
 * distinguirlo de un 500.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) return admin.response;

    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Datos no válidos." },
        { status: 400 }
      );
    }

    const { status, admin_notes: adminNotes } = parsed.data;

    if (status !== undefined && !isSuggestionStatus(status)) {
      return NextResponse.json({ error: `Estado no válido: ${status}` }, { status: 400 });
    }

    const current = await getSuggestionById(params.id);
    if (!current) {
      return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
    }

    const updated = await updateSuggestionStatus(params.id, status ?? current.status, adminNotes);
    if (!updated) {
      return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });
    }
    console.error("PATCH suggestion error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * Borrado. Es la única operación destructiva y por eso es un verbo aparte: un
 * cliente que solo quería editar no tiene forma de acabar aquí.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) return admin.response;

    const removed = await deleteSuggestion(params.id);
    if (!removed) {
      return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE suggestion error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}