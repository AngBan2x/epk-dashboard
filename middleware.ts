import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSessionToken, isSessionValid } from "@/lib/auth";

function redirectToLogin(request: NextRequest, path: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", path);
  return NextResponse.redirect(loginUrl);
}

function clearExpiredSession(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set("auth_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const sessionCookie = request.cookies.get("auth_session");
  const path = request.nextUrl.pathname;

  if (!sessionCookie) {
    return redirectToLogin(request, path);
  }

  const session = await decodeSessionToken(sessionCookie.value);

  if (!session) {
    return redirectToLogin(request, path);
  }

  if (!isSessionValid(session)) {
    return clearExpiredSession(request);
  }

  return null;
}

/**
 * Roles reconocidos. `SessionData.role` es `string`, no una unión, así que un
 * token con un rol desconocido no debe colarse por comparación laxa. Es el
 * mismo motivo por el que `app/api/submissions/route.ts` no hace
 * `session.role || "artist"`: un default permisivo no es un default.
 */
const KNOWN_ROLES = ["admin", "artist", "subscriber"] as const;
type KnownRole = (typeof KNOWN_ROLES)[number];

function isKnownRole(role: unknown): role is KnownRole {
  return typeof role === "string" && (KNOWN_ROLES as readonly string[]).includes(role);
}

/**
 * `requireAuth` + comprobación de ROL en servidor.
 *
 * `requireAuth` solo valida que el token HMAC esté bien firmado y sin expirar:
 * un `subscriber` autenticado lo supera igual que un admin. Eso dejaba
 * `/releases/:id/edit` —que sí estaba en `protectedPaths`— abierto a cualquier
 * cuenta, y el formulario de edición solo se cerraba en cliente, comparando el
 * nombre del artista en el navegador (`app/releases/[id]/edit/page.tsx:143-154`).
 * Defensa insuficiente: la comprobación real de escritura está en
 * `PUT /api/releases`, pero obligar al usuario a rellenar un formulario entero
 * para recibir un 403 no es una autorización.
 *
 * El middleware corre en Edge, así que aquí NO se puede consultar la base de
 * datos: la propiedad (`artists.user_id`) no es comprobable en esta capa. El rol
 * sí, y es el agujero que se estaba explotando. La propiedad se resuelve en
 * servidor dentro de `GET /api/releases?id=X` (admin o dueño verificado) y, de
 * nuevo, en el `PUT`.
 */
async function requireRole(
  request: NextRequest,
  allowed: ReadonlyArray<KnownRole>
): Promise<NextResponse | null> {
  const redirect = await requireAuth(request);
  if (redirect) return redirect;

  const sessionCookie = request.cookies.get("auth_session");
  const session = await decodeSessionToken(sessionCookie!.value);
  if (session && isKnownRole(session.role) && allowed.includes(session.role)) return null;

  return NextResponse.redirect(new URL("/dashboard", request.url));
}

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("auth_session");
  const path = request.nextUrl.pathname;

  if (path.startsWith("/admin")) {
    const redirect = await requireAuth(request);
    if (redirect) return redirect;

    const session = await decodeSessionToken(sessionCookie!.value);
    if (session!.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // El formulario de edición es de administración de catálogo: exige rol de
  // artista o admin, no solo "estar logueado". Ver `requireRole`.
  if (/^\/releases\/[^/]+\/edit$/.test(path)) {
    const redirect = await requireRole(request, ["admin", "artist"]);
    if (redirect) return redirect;
    return NextResponse.next();
  }

  // P16: el portal de envíos es la puerta de entrada del suscriptor a artista.
  // Cualquier usuario autenticado entra (un `artist` también puede enviar), así
  // que aquí solo hace falta `requireAuth`.
  if (path === "/submissions" || path.startsWith("/submissions/")) {
    const redirect = await requireAuth(request);
    if (redirect) return redirect;
    return NextResponse.next();
  }

  const protectedPaths = ["/profile", "/account", "/releases/new"];
  const isProtected = protectedPaths.some((p) => {
    if (p.includes(":")) {
      const rx = new RegExp("^" + p.replace(/:[^/]+/g, "[^/]+") + "$");
      return rx.test(path);
    }
    return path === p || path.startsWith(p + "/");
  });
  if (isProtected) {
    const redirect = await requireAuth(request);
    if (redirect) return redirect;
  }

  if (path === "/login" || path === "/register") {
    if (sessionCookie) {
      const session = await decodeSessionToken(sessionCookie.value);

      if (session) {
        if (!isSessionValid(session)) {
          return clearExpiredSession(request);
        }

        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/login",
    "/register",
    "/profile",
    "/account",
    "/releases/new",
    "/releases/:id/edit",
    "/submissions",
    "/submissions/:path*",
  ],
};