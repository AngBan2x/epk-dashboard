import { NextRequest, NextResponse } from "next/server";
import { getAllArtists, getPublicArtists } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

/**
 * `ORDER BY created_at DESC`, pero en el consumo y no con SQL duplicado.
 *
 * `parseArtist` pasa `created_at` por `String(...)`, así que una fila sin fecha
 * llega como la cadena `"undefined"`/`"null"`, que comparada como texto sortea
 * POR DELANTE de cualquier fecha. En SQL los NULL son los menores y en un
 * `DESC` caen al final, que es lo que se veía antes. Este comparador devuelve
 * `""` para esos tres casos para reproducir ese orden.
 */
function createdAtKey(value: string | null | undefined): string {
  if (!value || value === "null" || value === "undefined") return "";
  return value;
}

function byCreatedAtDesc(
  a: { created_at: string | null | undefined },
  b: { created_at: string | null | undefined }
): number {
  const av = createdAtKey(a.created_at);
  const bv = createdAtKey(b.created_at);
  if (!av && !bv) return 0;
  if (!av) return 1; // sin fecha, al final
  if (!bv) return -1;
  return av < bv ? 1 : av > bv ? -1 : 0;
}

// GET /api/artists — Listar artistas: admin ve todos, público solo aprobados
export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req);
    const isAdmin = session?.role === "admin";

    // UNA sola fuente de verdad para la decisión Turso/local.
    //
    // Antes esta ruta mezclaba dos que no pueden coincidir: `isTursoConfigured()`
    // de `@/lib/db` (alias de `isTursoEnabled()`, lee `process.env` en TIEMPO DE
    // LLAMADA) elegía la rama, y `getTursoClient()` de `@/lib/turso` (lee
    // `process.env` al IMPORTAR el módulo, `lib/turso.ts:31-32`) ejecutaba la
    // consulta. Si el env llegaba después de esa primera evaluación —el caso
    // normal en un bundle de Vercel— la primera decía "turso" y la segunda
    // devolvía `null`: la línea siguiente lanzaba y la ruta respondía 500 en vez
    // de caer al SQLite local. La causa de fondo no era el flag, sino que la ruta
    // no tenía caso Turso real: en local sin `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`
    // servía la réplica de `data/music_catalog.db`, que no es un espejo (39 filas
    // de artistas de QA, 0 pistas), y por eso los ids cambiaban entre entornos.
    //
    // `getAllArtists()` ya ramifica con `isTursoEnabled()` por los dos lados
    // (`tursoExec` con cliente nuevo por llamada / `getLocalDb()` de solo
    // lectura), así que desaparece la discrepancia y con ella `getDbWrite()` y
    // `getTursoClient()`.
    const all = await getAllArtists();
    // P17: el público lee por el lector de alcance (`getPublicArtists`), que
    // ya filtra `is_active = 1` y `deleted_at IS NULL` **en el SQL** y no
    // expone `user_id`. Antes esta ruta traía la lista entera y filtraba en
    // JavaScript, lo que dejaba el filtro en un sitio distinto del que
    // aplica el resto de la web — y la web, que usaba `getAllArtists()`, no
    // filtraba nada. Dos rutas, dos reglas.
    const publicArtists = isAdmin ? [] : await getPublicArtists();

    let artists;
    if (isAdmin) {
      // Sin cambios: el admin ve también los inactivos y con `user_id`
      // (`tests/unit/security-sweep.test.ts:241` afirma exactamente eso).
      artists = all;
    } else {
      artists = [...publicArtists].sort(byCreatedAtDesc);
    }

    return NextResponse.json({ artists }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("[API/artists] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener artistas" }, { status: 500 });
  }
}
