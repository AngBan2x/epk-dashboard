import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSessionToken, isSessionValid } from "@/lib/auth";

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("auth_session");
  const path = request.nextUrl.pathname;

  // Proteger /admin
  if (path.startsWith("/admin")) {
    if (!sessionCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }

    const session = decodeSessionToken(sessionCookie.value);

    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }

    if (!isSessionValid(session)) {
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

    // Verificar rol admin
    if (session.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Redirigir /login y /register si ya autenticado
  if (path === "/login" || path === "/register") {
    if (sessionCookie) {
      const session = decodeSessionToken(sessionCookie.value);

      if (session) {
        if (!isSessionValid(session)) {
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

        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/register"],
};
