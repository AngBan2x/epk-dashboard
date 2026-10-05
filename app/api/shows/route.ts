import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllShows, getApprovedShows, getApprovedShowsByArtist, getApprovedShowById, getShowsByArtist, getShowById, createShow, updateShow, deleteShow, getArtistById, createNotification } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { sendNotificationEmail } from "@/lib/email";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyArtistSubscribers } from "@/lib/subscriber-notifications";
import { createDynamicStatusResolver } from "@/lib/show-dynamic-status";
import { SHOW_STATUS_SELECTABLE } from "@/lib/show-status";
import type { ShowStatus } from "@/types/music";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

/**
 * URL absoluta: impide que un valor relativo como "—" o "tu-sitio.com"
 * llegue a la DB y luego se renderice como `<a href>` roto (404).
 * `nullish` porque el campo es opcional: null/undefined siguen siendo validos.
 */
const OptionalUrl = z
  .string()
  .nullish()
  .refine((v) => v == null || v === "" || /^https?:\/\/\S+$/i.test(v), {
    message: "debe ser una URL absoluta (http:// o https://)",
  });

/**
 * C4 — el `z.enum` de `status` se **deriva** de `SHOW_STATUS_SELECTABLE` en vez
 * de reescribir los 13 literales, y por eso solo acepta los 6 elegibles: ni
 * `hoy` ni `pasado` (los pone la fecha) ni los que C4 retiró.
 *
 * Antes esta lista era una cuarta copia del vocabulario, y era la que de verdad
 * decidía: un cliente podía mandar `finalizado` o `en_venta` y el backend lo
 * aceptaba sin pestañear, con el tipo de TypeScript diciendo que no podía pasar.
 */
const ShowStatusInput = z.enum(SHOW_STATUS_SELECTABLE);

const CreateShowSchema = z.object({
  artist_id: z.string().min(1, "artist_id requerido"),
  venue_name: z.string().min(1, "venue_name requerido"),
  approved: z.boolean().optional(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  date: z.string().nullish(),
  time: z.string().nullish(),
  price_range: z.string().nullish(),
  status: ShowStatusInput.optional(),
  ticket_url: OptionalUrl,
  payment_methods: z.array(z.object({ type: z.enum(["cash", "card", "transfer", "ticket_platform", "other"]), details: z.string().optional(), platform_url: z.string().optional() })).nullish(),
  postponement_reason: z.string().nullish(),
  flyer_url: OptionalUrl,
  ticket_link: OptionalUrl,
  description: z.string().nullish(),
  guest_artists: z.array(z.object({ name: z.string(), role: z.string().optional() })).nullish(),
  notes: z.string().nullish(),
});

const UpdateShowSchema = z.object({
  id: z.string().min(1, "id requerido"),
  venue_name: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  date: z.string().nullish(),
  time: z.string().nullish(),
  price_range: z.string().nullish(),
  status: ShowStatusInput.optional(),
  ticket_url: OptionalUrl,
  payment_methods: z.array(z.object({ type: z.enum(["cash", "card", "transfer", "ticket_platform", "other"]), details: z.string().optional(), platform_url: z.string().optional() })).nullish(),
  postponement_reason: z.string().nullish(),
  flyer_url: OptionalUrl,
  ticket_link: OptionalUrl,
  description: z.string().nullish(),
  guest_artists: z.array(z.object({ name: z.string(), role: z.string().optional() })).nullish(),
  notes: z.string().nullish(),
});

/**
 * RC.33 Ola 5 — la regla de "el estado se recalcula por fecha" ya no vive aquí:
 * vive en `lib/show-dynamic-status.ts` y la aplica TAMBIÉN `/api/dashboard`. Esta
 * ruta solo la invoca, con un instante de referencia único por petición.
 */
export async function GET(req: NextRequest) {
  try {
    /**
     * Instante de referencia único para toda la petición. Con `new Date()` por
     * llamada, una respuesta que cruzara medianoche podía pintar el MISMO show
     * como "hoy" en una fila y "pasado" en otra.
     */
    const resolveStatus = createDynamicStatusResolver();
    const { searchParams } = new URL(req.url);
    const artistId = searchParams.get("artist_id");
    const showId = searchParams.get("id");

    const session = await validateSession(req);

    // Moderación: un admin autenticado conserva el alcance completo, que es lo
    // que necesita para aprobar/rechazar. Sin sesión, o con una sesión que no
    // es de admin, TODA la lectura pasa por los lectores de alcance público.
    const isAdmin = session?.role === "admin";
    const ownsShow = async (showArtistId: string): Promise<boolean> => {
      if (!session || session.role !== "artist") return false;
      const artist = await getArtistById(showArtistId);
      return artist?.user_id != null && artist.user_id === session.userId;
    };

    if (showId) {
      if (isAdmin) {
        const show = await getShowById(showId);
        if (!show) {
          return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
        }
        return NextResponse.json({ ...show, status: resolveStatus(show) });
      }
      // Aprobado y no borrado → anyone.
      const approved = await getApprovedShowById(showId);
      if (approved) {
        return NextResponse.json({ ...approved, status: resolveStatus(approved) });
      }
      // Sin aprobar: solo su dueño.
      const owned = await getShowById(showId);
      if (owned && (await ownsShow(owned.artist_id))) {
        return NextResponse.json({ ...owned, status: resolveStatus(owned) });
      }
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }

    if (artistId) {
      const shows = isAdmin
        ? await getShowsByArtist(artistId)
        : await getApprovedShowsByArtist(artistId);
      return NextResponse.json({ shows: shows.map(s => ({ ...s, status: resolveStatus(s) })) });
    }

    // S0/P12b: `/shows` NO está en el `matcher` de `middleware.ts`, así que la
    // página es pública. Antes esta ruta devolvía `getAllShows()`, que es
    // `SELECT * FROM shows ORDER BY date ASC` sin `approved = 1` ni
    // `deleted_at IS NULL`: un show recién enviado por un artista salía en el
    // catálogo público, porque `POST /api/shows:144` lo crea con
    // `approved = 0` salvo que lo cree un admin con `approved: true`.
    const shows = isAdmin ? await getAllShows() : await getApprovedShows();
    return NextResponse.json({ shows: shows.map(s => ({ ...s, status: resolveStatus(s) })) }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("GET shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (session.role !== "admin" && session.role !== "artist") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const blocked = enforceRateLimit(req, "shows", session.userId, 10);
    if (blocked) return blocked;

    const body = await req.json();
    const validated = CreateShowSchema.parse(body);

    // FK validation: verify artist_id exists
    const artist = await getArtistById(validated.artist_id);
    if (!artist) {
      return NextResponse.json({ error: "Artista no encontrado" }, { status: 400 });
    }

    // Artists can only create shows for themselves; admins can create for anyone
    if (session.role === "artist" && artist.user_id !== session.userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const approved = session.role === "admin" && validated.approved === true;
    const show = await createShow({ ...validated, approved });

    // Create notification for the artist
    const artistForNotification = approved ? null : await getArtistById(validated.artist_id);
    if (artistForNotification && artistForNotification.user_id) {
      await createNotification({
        id: randomUUID(),
        user_id: artistForNotification.user_id,
        type: "show_pending_review",
        title: "Show enviado para revisión",
        message: `Tu show en ${validated.venue_name} ha sido enviado para revisión. Será publicado tras aprobación del equipo.`,
        data: JSON.stringify({ show_id: show.id, venue_name: validated.venue_name }),
        read: false,
      });

      void sendNotificationEmail({
        userId: artistForNotification.user_id,
        type: "show_pending_review",
        data: {
          userName: "",
          trackTitle: validated.venue_name,
          artistName: artistForNotification.name,
          dashboardUrl: "/dashboard",
          context: "show",
          showVenue: validated.venue_name,
          showDate: validated.date ?? undefined,
        },
      });
    }

    return NextResponse.json(show, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const validated = UpdateShowSchema.parse(body);
    const { id, ...rawData } = validated;
    // Strip null values — DB functions expect undefined for missing fields
    const data = Object.fromEntries(Object.entries(rawData).filter(([, v]) => v !== null));

    if (session.role !== "admin" && session.role !== "artist") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // Ownership check: artists can only update their own shows; admins can update any
    const existing = await getShowById(id);
    if (!existing) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }
    if (session.role === "artist") {
      const artist = await getArtistById(existing.artist_id);
      if (!artist || artist.user_id !== session.userId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    const show = await updateShow(id, data);
    if (!show) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }

    const RELEVANT_FIELDS = [
      "venue_name", "city", "country", "date", "time", "status",
      "price_range", "ticket_url", "ticket_link", "flyer_url",
    ];
    const previous = existing as unknown as Record<string, unknown>;
    const next = data as Record<string, unknown>;
    const changedFields = RELEVANT_FIELDS.filter(
      (field) => Object.prototype.hasOwnProperty.call(next, field) && previous[field] !== next[field]
    );

    if (changedFields.length > 0) {
      try {
        await notifyArtistSubscribers({
          artistId: show.artist_id,
          kind: "show_update",
          title: "Show actualizado",
          message: `El show en ${show.venue_name} fue actualizado.${show.date ? ` Nueva fecha: ${show.date}.` : ""}`,
          data: {
            show_id: show.id,
            showId: show.id,
            venue_name: show.venue_name,
            showVenue: show.venue_name,
            showDate: show.date,
            changed_fields: changedFields,
            dashboardUrl: "/shows",
          },
          emailType: "system",
          emailData: {
            showVenue: show.venue_name,
            showDate: show.date ?? undefined,
            dashboardUrl: "/shows",
          },
        });
      } catch (fanOutError) {
        console.error("PUT shows fan-out (no fatal):", fanOutError);
      }
    }

    return NextResponse.json(show);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("PUT shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    if (session.role !== "admin" && session.role !== "artist") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // Ownership check: artists can only delete their own shows; admins can delete any
    if (session.role === "artist") {
      const existing = await getShowById(id);
      if (!existing) {
        return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
      }
      const artist = await getArtistById(existing.artist_id);
      if (!artist || artist.user_id !== session.userId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    const deleted = await deleteShow(id);
    if (!deleted) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
