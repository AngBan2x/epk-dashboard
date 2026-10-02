import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  countSuggestionsByStatus,
  createNotification,
  createSuggestion,
  findRecentSuggestionByEmail,
  getAllUsers,
  getSuggestions,
  hashSuggestionFingerprint,
  isSuggestionStatus,
  normalizeSuggestionEmail,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { sendNotificationEmail } from "@/lib/email";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import type { SuggestionStatus } from "@/types/music";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// P4 · Buzón de sugerencias anónimo
//
// Dos métodos, dos audiencias y una asimetría deliberada:
//
//   POST  → PÚBLICA. No pide sesión: el buzón existe justo para pescar a quien
//           no tiene cuenta, que es quien tiene un problema que reportar.
//   GET   → ADMIN. Devuelve el buzón entero, incluidos correos y mensajes.
//
// La protección de verdad del GET está AQUÍ, en el servidor (401 sin sesión, 403
// con sesión que no sea admin). El `role !== "admin"` del cliente es UX, no
// autorización: está en `app/admin/page.tsx:191-195` y en `middleware.ts:93-101`,
// pero cualquiera de los dos se salta con un `curl`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Límite por IP, en mensajes por hora.
 *
 * ══ LA PARADOJA DEL NAT, y por qué este número es alto ══════════════════════
 *
 * La regla intuitiva («un mensaje por IP») es la que castiga a la gente
 * LEGÍTIMA. Una IP no identifica a una persona: identifica a una red. Detrás de
 * una sola IP puede haber una oficina con treinta personas, una facultad, un
 * hotel, o un móvil con CGNAT donde caen subscribers de la misma operadora. Con
 * un límite por IP bajo, el primer damnificado sería el usuario que más falta
 * hacía —el que reporta un problema y no tiene cuenta— y se llevaría un 429 sin
 * saber por qué.
 *
 * La regla que NO castiga a quien comparte red es la del CORREO: 1 por email
 * cada 24 h (`SUGGESTION_DEDUPE_WINDOW_MS`). Dos personas detrás del mismo NAT
 * tienen correos distintos, así que no se estorban; y contra el spam es MÁS
 * fuerte, porque un bot con granja de IPs que reuse el mismo correo se frena
 * igual.
 *
 * De ahí los números: el límite DURO es el del correo, y el de IP sube a 10 por
 * hora. Diez es holgado a propósito —cubre de sobra a una oficina entera— y aun
 * así frena el bucle automático, que es lo único para lo que existe.
 *
 * El coste de equivocarse es asimétrico y por eso se decide así: un falso
 * positivo del filtro por IP se traga un reporte real, y ese usuario no vuelve a
 * intentarlo; un falso negativo son diez mensajes más en una bandeja que el admin
 * ya filtra con el honeypot.
 */
const SUGGESTION_IP_LIMIT = 10;
const SUGGESTION_IP_WINDOW_MS = 60 * 60 * 1000;

/** Capa 4: un mensaje por correo cada 24 h. */
const SUGGESTION_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Capa 2: menos de 2 s desde que se pintó el formulario = no es una persona. */
const SUGGESTION_MIN_FILL_MS = 2000;

/** Tope del preview en la notificación in-app; el correo lleva el mensaje entero. */
const PREVIEW_LENGTH = 140;

/**
 * El nombre del campo trampa. Tiene que parecer un campo de verdad —para que un
 * bot lo rellene— pero no ser ninguno: ni `email`, ni `name`, ni `website`. Y no
 * puede ser un `name` que un gestor de contraseñas reconozca, porque el
 * autocompletado del navegador lo rellenaría solo y el honeypot se dispararía
 * contra usuarios honestos.
 */
const HONEYPOT_FIELD = "empresa";

const SuggestionSchema = z.object({
  email: z
    .string({ required_error: "Escribe tu correo." })
    .trim()
    .min(1, "Escribe tu correo para poder responderte.")
    // 254 es el máximo de una dirección SMTP (RFC 5321 §4.5.3.1). Más que eso no
    // es un correo: es un campo de texto con un `@` pegado.
    .max(254, "Ese correo es demasiado largo (máximo 254 caracteres).")
    .email("Ese correo no parece válido. Revísalo, por ejemplo: nombre@dominio.com"),
  message: z
    .string({ required_error: "Escribe tu mensaje." })
    .trim()
    // 20 como mínimo: por debajo no hay un problema que contar, y un bot que
    // escribe "test" dos veces es la firma más común de un formulario automatizado.
    .min(20, "Cuéntanos un poco más: al menos 20 caracteres.")
    .max(5000, "El mensaje es demasiado largo (máximo 5000 caracteres)."),
  // Las dos capas que NO devuelven error. Van en el esquema para declarar sus
  // tipos, pero se comprueban ANTES de validar y su resultado no se usa.
  [HONEYPOT_FIELD]: z.string().optional().default(""),
  form_started_at: z.number().optional(),
});

/**
 * La respuesta del camino feliz. Las cuatro capas de descarte devuelven
 * EXACTAMENTE este mismo objeto.
 *
 * No es un descuido, es el diseño entero del anti-spam: si el honeypot salta con
 * un 400 y el tiempo con un 429, un bot solo tiene que recorrer las cinco capas
 * en orden para descubrir cuáles existen y cuáles no, y las que no distinguirían
 * son justamente las que filtran. Aquí no hay ninguna diferencia observable entre
 * «guardado» y «tirado a la basura», y el cuerpo no lleva `id` ni `status` porque
 * un identificador devuelto sería un contador de cuántos mensajes hay —y con él,
 * la forma de enumerarlos.
 *
 * La ÚNICA excepción es el 429 del rate limit, y es deliberada: si compartes IP
 * con media oficina y te bloquean sin decir nada, no hay forma de saber que hay
 * que esperar. Un error que el usuario honesto no puede entender no es
 * protección, es ruido.
 */
function accepted(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Capa 1: el campo trampa vino relleno. Es un bot: se descarta sin escribir. */
function honeypotTriggered(raw: Record<string, unknown>): boolean {
  const value = raw[HONEYPOT_FIELD];
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== null;
}

/**
 * Capa 2: el tiempo que pasó desde que el componente se pintó.
 *
 * Se rechaza cuando el campo falta o no es un número (un bot que fabrica la
 * petición a mano no lo manda) y cuando el envío llega antes de los 2 s. Una
 * persona tiene que leer y escribir; un script que rellena el DOM lo hace en el
 * siguiente tick.
 *
 * CONSECUENCIA DOCUMENTADA: si el reloj del cliente va adelantado respecto al del
 * servidor, `elapsed` sale negativo y el envío se descarta en silencio. Es la
 * debilidad de esta capa y no se arregla comparando relojes sin un token del
 * servidor. Se asume que el reloj del navegador está en hora —porque lo está— y
 * que lo que llega con el reloj adelantado está manipulado. Las otras cuatro
 * capas no dependen de esto.
 */
function filledTooFast(startedAt: unknown): boolean {
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt) || startedAt <= 0) return true;
  return Date.now() - startedAt < SUGGESTION_MIN_FILL_MS;
}

/**
 * Aviso al admin: notificación in-app + email.
 *
 * BEST-EFFORT A PROPÓSITO, y este es el punto que no se debe cambiar después.
 * Se escribe PRIMERO la sugerencia y luego se avisa. Enganchar el aviso a la
 * escritura significaría que un 500 de Resend, o un `FROM_EMAIL` sin configurar,
 * se llevaran por delante el mensaje de alguien que solo quería reportar un
 * problema. Aquí el mensaje está en la tabla pase lo que pase con el correo, y un
 * fallo de aviso se registra como motivo y NO cambia la respuesta.
 *
 * Sin datos personales en el log: ni el correo del remitente ni su mensaje. Solo
 * el identificador de la sugerencia, que es lo único accionable.
 */
async function notifyAdmins(input: {
  suggestionId: string;
  email: string;
  message: string;
}): Promise<{ notified: number; attempted: boolean; reason: string | null }> {
  const reasons: string[] = [];
  let notified = 0;

  try {
    const admins = (await getAllUsers()).filter(
      (user) => user.role === "admin" && !user.deleted_at && Boolean(user.email)
    );

    if (admins.length === 0) {
      return { notified: 0, attempted: false, reason: "sin_admins_activos" };
    }

    const preview =
      input.message.length > PREVIEW_LENGTH
        ? `${input.message.slice(0, PREVIEW_LENGTH)}…`
        : input.message;
    const title = "Nueva sugerencia en el buzón";
    // El preview SÍ lleva el correo del remitente: es el dato con el que el admin
    // contesta, que es para lo que se pide. Va al buzón (solo admins), no al log.
    const notificationMessage = `De ${input.email}: ${preview}`;

    for (const admin of admins) {
      // In-app primero: es la vía que no depende de ningún servicio externo.
      try {
        await createNotification({
          id: crypto.randomUUID(),
          user_id: admin.id,
          type: "system",
          title,
          message: notificationMessage,
          data: JSON.stringify({ suggestionId: input.suggestionId }),
          read: false,
        });
        notified += 1;
      } catch (notificationError) {
        reasons.push(
          `notificación: ${notificationError instanceof Error ? notificationError.name : "error"}`
        );
      }

      // Email después, y su fallo es informativo: la notificación ya está escrita.
      try {
        const result = await sendNotificationEmail({
          userId: admin.id,
          type: "system",
          data: {
            userName: admin.name,
            trackTitle: "",
            artistName: "",
            notificationTitle: title,
            notificationMessage,
            dashboardUrl: `/admin/suggestions?focus=${encodeURIComponent(input.suggestionId)}`,
          },
        });
        if (!result.sent && result.reason) {
          reasons.push(`email: ${result.reason}`);
        }
      } catch (emailError) {
        reasons.push(`email: ${emailError instanceof Error ? emailError.name : "error"}`);
      }
    }

    return { notified, attempted: true, reason: reasons.length > 0 ? reasons.join("; ") : null };
  } catch (error) {
    // Cualquier fallo unexpectedo se registra sin datos personales y NO revierte
    // la sugerencia, que ya está guardada.
    console.error(
      `[pressplay:suggestions] aviso al admin falló (sugerencia=${input.suggestionId}):`,
      error instanceof Error ? error.name : "error"
    );
    return { notified, attempted: true, reason: "aviso_fallido" };
  }
}

export async function POST(req: NextRequest) {
  try {
    // ── Capa 3 · rate limit por IP (el único 429) ────────────────────────────
    const ip = clientIp(req);
    const limited = enforceRateLimit(
      req,
      "suggestions",
      null,
      SUGGESTION_IP_LIMIT,
      SUGGESTION_IP_WINDOW_MS
    );
    if (limited) return limited;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      // JSON malformado no es una de las cinco capas: es una petición rota, y
      // decirselo al cliente no le enseña nada sobre el anti-spam.
      return NextResponse.json({ error: "No hemos podido leer el mensaje." }, { status: 400 });
    }

    const raw = (body ?? {}) as Record<string, unknown>;

    // ── Capa 1 · honeypot ─────────────────────────────────────────────────────
    if (honeypotTriggered(raw)) return accepted();

    // ── Capa 2 · tiempo de formulario ────────────────────────────────────────
    if (filledTooFast(raw.form_started_at)) return accepted();

    // ── Capa 5 · validación ──────────────────────────────────────────────────
    // ÚNICA capa que devuelve 400 con detalle, y tiene que devolverlo: aquí el
    // usuario necesita corregir algo, y un error de validación no le dice a un
    // bot si el honeypot existe.
    const parsed = SuggestionSchema.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.errors) {
        const key = String(issue.path[0] ?? "");
        if (key && !fields[key]) fields[key] = issue.message;
      }
      const first = parsed.error.errors[0]?.message ?? "Revisa los campos del formulario.";
      return NextResponse.json({ error: first, fields }, { status: 400 });
    }

    const email = normalizeSuggestionEmail(parsed.data.email);
    const message = parsed.data.message;

    // ── Capa 4 · una por correo cada 24 h ────────────────────────────────────
    const windowStart = new Date(Date.now() - SUGGESTION_DEDUPE_WINDOW_MS).toISOString();
    const recent = await findRecentSuggestionByEmail(email, windowStart);
    if (recent) return accepted();

    // El buzón es anónimo, pero si quien escribe tenía sesión se guarda el
    // `userId` como contexto para el admin. Nunca como condición para escribir:
    // sin sesión se acepta igual, que es el objetivo del buzón.
    const session = await validateRequest(req);

    // ── Escritura ────────────────────────────────────────────────────────────
    // Primero la fila. Todo lo que viene después es aviso, y el aviso se descarta.
    const suggestion = await createSuggestion({
      id: crypto.randomUUID(),
      email,
      message,
      user_id: session?.userId ?? null,
      ip_hash: await hashSuggestionFingerprint(ip),
    });

    // ── Aviso al admin (best-effort, ya escrito) ─────────────────────────────
    const outcome = await notifyAdmins({ suggestionId: suggestion.id, email, message });
    if (outcome.reason) {
      // Solo el motivo y el id de la sugerencia. El mensaje y el correo del
      // remitente no salen de aquí.
      //
      // `sin_admins_activos` NO es un fallo del aviso: es un estado del
      // despliegue (no hay a quién avisar), y por eso es `info` y no `warn`. Un
      // `warn` por cada mensaje recibido llenaría el log de un estado que no
      // cambia por sí solo.
      const line = `[pressplay:suggestions] aviso incompleto (sugerencia=${suggestion.id}, notificados=${outcome.notified}): ${outcome.reason}`;
      if (outcome.attempted) console.warn(line);
      else console.info(line);
    }

    return accepted();
  } catch (error) {
    console.error(
      "[pressplay:suggestions] error inesperado:",
      error instanceof Error ? error.name : "error"
    );
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * 401 sin sesión, 403 con sesión de otro rol. La distinción no es cosmética: sin
 * sesión la respuesta es «no estás dentro»; con sesión de artista es «no te
 * toca». Y un `artist` (o un `subscriber`) NO ve el buzón aunque tenga cuenta.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await validateRequest(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get("status");
    const status: SuggestionStatus | "all" = isSuggestionStatus(rawStatus) ? rawStatus : "all";
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10);

    const [result, counts] = await Promise.all([
      getSuggestions({
        status,
        page: Number.isFinite(page) ? page : 1,
        limit: Number.isFinite(limit) ? limit : 20,
      }),
      countSuggestionsByStatus(),
    ]);

    return NextResponse.json(
      { ...result, stats: counts },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("GET suggestions error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

