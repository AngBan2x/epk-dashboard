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

  const protectedPaths = ["/profile", "/account", "/releases/new", "/releases/:id/edit"];
  const isProtected = protectedPaths.some((p) => {
    if (p.includes(":")) {
      // Simple param matcher: /releases/:id/edit
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
  matcher: ["/admin/:path*", "/login", "/register", "/profile", "/account", "/releases/new", "/releases/:id/edit"],
};
