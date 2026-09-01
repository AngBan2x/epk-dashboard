import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

    let session: { userId: string; exp: number; role?: string } | null = null;
    try {
      const decoded = atob(sessionCookie.value);
      session = JSON.parse(decoded);
    } catch {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }

    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }

    // Verificar expiración
    if (session.exp < Date.now()) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      const response = NextResponse.redirect(loginUrl);
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
    if (!session.role || session.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Redirigir /login y /register si ya autenticado
  if (path === "/login" || path === "/register") {
    if (sessionCookie) {
      let session: { exp: number } | null = null;
      try {
        const decoded = atob(sessionCookie.value);
        session = JSON.parse(decoded);
      } catch {
        // Sesión inválida, permitir acceso a login
      }

      if (session && session.exp > Date.now()) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  // Proteger /upload — solo artistas autenticados
  if (path === "/upload") {
    if (!sessionCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }

    let session: { userId: string; exp: number; role?: string } | null = null;
    try {
      const decoded = atob(sessionCookie.value);
      session = JSON.parse(decoded);
    } catch {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }

    if (!session || session.exp < Date.now()) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }

    // Solo artistas y admin pueden subir música
    if (session.role !== "artist" && session.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/upload", "/login", "/register"],
};