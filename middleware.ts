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

function requireAuth(request: NextRequest): NextResponse | null {
  const sessionCookie = request.cookies.get("auth_session");
  const path = request.nextUrl.pathname;

  if (!sessionCookie) {
    return redirectToLogin(request, path);
  }

  const session = decodeSessionToken(sessionCookie.value);

  if (!session) {
    return redirectToLogin(request, path);
  }

  if (!isSessionValid(session)) {
    return clearExpiredSession(request);
  }

  return null; // OK
}

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("auth_session");
  const path = request.nextUrl.pathname;

  // Proteger /admin — solo admin
  if (path.startsWith("/admin")) {
    const redirect = requireAuth(request);
    if (redirect) return redirect;

    const session = decodeSessionToken(sessionCookie!.value);
    if (session!.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Proteger rutas autenticadas — cualquier rol
  const protectedPaths = ["/dashboard", "/profile", "/account", "/releases/new"];
  if (protectedPaths.some((p) => path === p || path.startsWith(p + "/"))) {
    const redirect = requireAuth(request);
    if (redirect) return redirect;
  }

  // Redirigir /login y /register si ya autenticado
  if (path === "/login" || path === "/register") {
    if (sessionCookie) {
      const session = decodeSessionToken(sessionCookie.value);

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
  matcher: ["/admin/:path*", "/login", "/register", "/dashboard", "/profile", "/account", "/releases/new"],
};
