import { NextRequest, NextResponse } from "next/server";

const store = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000);

/**
 * Lee o consume la cuota de un bucket.
 *
 * P21.15 — `options.count` es **`true` por defecto**, así que todos los llamantes
 * que ya existen siguen comportándose igual. Ponerlo en `false` hace una
 * **lectura**: devuelve si la cuota queda, pero no la gasta.
 *
 * Hace falta porque el rate limit del login se aplicaba **antes** de validar la
 * contraseña: cinco intentos — fallidos o no — apagaban la IP durante 60 s. En
 * la CI, donde todos los specs comparten IP, eso se comía la corrida entera con
 * 429s; y en una NAT compartida, cinco logins válidos de cinco personas distintas
 * se bloqueaban entre sí.
 *
 * Un login **válido** no debe costar cuota. El que debe costar es el que falla.
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  options: { count?: boolean } = {}
): { allowed: boolean; remaining: number; resetAt: number } {
  const count = options.count !== false;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    if (!count) return { allowed: true, remaining: maxAttempts, resetAt };
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxAttempts - 1, resetAt };
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  if (!count) {
    return { allowed: true, remaining: maxAttempts - entry.count, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxAttempts - entry.count, resetAt: entry.resetAt };
}

/**
 * Consume una unidad de cuota **después** de saber que el intento falló.
 *
 * Es la segunda mitad del arreglo de P21.15: `checkRateLimit(..., {count:false})`
 * mira, y esta función castiga. Si el bucket ya está lleno no hace nada — el
 * 429 ya se devolvió antes y volver a contar solo retrasaría el reseteo.
 *
 * Se cuenta todo lo que es **fallo del cliente** (400 / 401 / 403). Un 500 no:
 * es un fallo nuestro, y bloquear a un usuario porque el servidor se cayó es
 * convertir un bug en un DoS.
 */
export function registerFailedAttempt(
  key: string,
  maxAttempts: number,
  windowMs: number
): { count: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { count: 1, resetAt };
  }

  if (entry.count >= maxAttempts) return { count: entry.count, resetAt: entry.resetAt };

  entry.count++;
  return { count: entry.count, resetAt: entry.resetAt };
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
}

export function rateLimitResponse(resetAt: number, message: string): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetAt),
      },
    }
  );
}

export function enforceRateLimit(
  req: NextRequest,
  scope: string,
  userId: string | null,
  maxAttempts: number,
  windowMs = 60_000
): NextResponse | null {
  const key = `${scope}:${userId ?? "anon"}:${clientIp(req)}`;
  const result = checkRateLimit(key, maxAttempts, windowMs);
  if (result.allowed) return null;
  return rateLimitResponse(
    result.resetAt,
    "Demasiadas solicitudes. Espera unos segundos antes de volver a intentarlo."
  );
}
