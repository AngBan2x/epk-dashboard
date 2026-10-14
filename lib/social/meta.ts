/**
 * RC.37 — La parte pura de OAuth de Meta, sin React y sin red.
 *
 * ## Por qué existe este fichero
 *
 * Porque las dos cosas que hay que acertar en este flujo son funciones, y
 * funciones se testean; componentes con `useEffect` no. La página de callback
 * (`app/auth/meta/callback/page.tsx`) y el script que resuelve las
 * credenciales (`scripts/meta-page-token.ts`) **importan de aquí**, así que lo
 * que se comprueba en los tests es literalmente lo que corre en el navegador y
 * en el script, no una copia suya.
 *
 * ## Lo que hay que evitar a toda costa
 *
 * **Elegir la Page equivocada en silencio.** `/me/accounts` devuelve *todas* las
 * Pages sobre las que el usuario tiene tareas. Si hay más de una y el código se
 * queda con la primera, el token es válido y las publicaciones salen en una Page
 * que nadie ha revisado. Por eso `elegirPage` devuelve un error con la lista en
 * vez de adivinar: no hay forma de saber cuál es la correcta sin preguntarle a
 * quien la eligió.
 *
 * ## Por qué `instagram_business_account` es opcional
 *
 * Porque una Page puede no tener Instagram vinculado, y eso no es un error de
 * la llamada: es una respuesta válida de Facebook. Se distingue de un fallo de
 * red, que sí lanza excepción, y de un token caducado, que es un error de API.
 */

export interface RespuestaCuentas {
  readonly data?: unknown;
  readonly error?: { readonly message?: unknown };
  /**
   * Meta lo devuelve siempre en las respuestas paginadas. No se lee: esta
   * paginación es sobre Pages, y quedarse con la primera tanda para "ver menos"
   * significaría elegir entre varias Pages sin querer.
   */
  readonly paging?: unknown;
}

/** Lo que el endpoint devuelve por cada Page. */
export interface CuentaDevuelta {
  readonly id: string;
  readonly nombre: string | null;
  readonly accessToken: string;
  readonly igUserId: string | null;
}

export interface PageElegida extends CuentaDevuelta {
  /** Las otras Pages, para que el error sea accionable y no solo decir "hay varias". */
  readonly otras: readonly { readonly id: string; readonly nombre: string | null }[];
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor !== "" ? valor : null;
}

/**
 * Convierte una entrada de `/me/accounts` en algo usable.
 *
 * Devuelve `null` si le falta el `id` o el `access_token`, que es lo único que
 * no se puede inventar: sin esas dos cosas la Page no sirve para publicar, y
 * devolver una entrada incompleta acabaría en un 401 más tarde, en producción,
 * sin saber de dónde salió.
 */
export function leerCuenta(bruta: unknown): CuentaDevuelta | null {
  if (typeof bruta !== "object" || bruta === null) return null;
  const r = bruta as Record<string, unknown>;

  const id = texto(r.id);
  const accessToken = texto(r.access_token);
  if (id === null || accessToken === null) return null;

  const ig = r.instagram_business_account;
  const igUserId =
    typeof ig === "object" && ig !== null ? texto((ig as Record<string, unknown>).id) : null;

  return {
    id,
    nombre: texto(r.name),
    accessToken,
    igUserId,
  };
}

/** Todas las cuentas utilizables de la respuesta, en el orden que devuelve Meta. */
export function leerCuentas(respuesta: RespuestaCuentas): CuentaDevuelta[] {
  const datos = respuesta.data;
  if (!Array.isArray(datos)) return [];
  return datos.map(leerCuenta).filter((c): c is CuentaDevuelta => c !== null);
}

export class ErrorDePage extends Error {
  readonly candidatas: readonly { readonly id: string; readonly nombre: string | null }[];

  constructor(candidatas: readonly { readonly id: string; readonly nombre: string | null }[]) {
    super(
      `/me/accounts devuelve ${candidatas.length} Pages y no hay forma de saber cuál es la correcta.\n` +
        `  Se puede pasar --page-id=<id> para elegir una a mano. No se elige la primera a ciegas:\n` +
        `  publicar en la Page equivocada es un error que no se ve hasta que sale el post.\n` +
        candidatas.map((c) => `    ${c.id}  ${c.nombre ?? "(sin nombre)"}`).join("\n")
    );
    this.name = "ErrorDePage";
    this.candidatas = candidatas;
  }
}

/**
 * Elige una Page, o falla si hay más de una y no se ha dicho cuál.
 *
 * `pageIdPedido` viene de `--page-id`. Si está, gana aunque haya más de una.
 */
export function elegirPage(
  cuentas: readonly CuentaDevuelta[],
  pageIdPedido?: string
): PageElegida {
  if (cuentas.length === 0) {
    throw new Error(
      `/me/accounts no devolvió ninguna Page.\n` +
        "  Tres causas posibles, y se distinguen por el mensaje de la API:\n" +
        "  - El token no tiene `pages_show_list`: el usuario no ha autorizado la app.\n" +
        "  - El token caducó:suele salir un 190 con 'Session has expired'.\n" +
        "  - El usuario no administra ninguna Page."
    );
  }

  if (pageIdPedido !== undefined && pageIdPedido !== "") {
    const elegida = cuentas.find((c) => c.id === pageIdPedido);
    if (!elegida) {
      throw new Error(
        `--page-id=${pageIdPedido} no está entre las Pages que devuelve /me/accounts.\n` +
          cuentas.map((c) => `    ${c.id}  ${c.nombre ?? "(sin nombre)"}`).join("\n")
      );
    }
    return { ...elegida, otras: [] };
  }

  if (cuentas.length > 1) {
    throw new ErrorDePage(cuentas.map((c) => ({ id: c.id, nombre: c.nombre })));
  }

  return { ...cuentas[0], otras: [] };
}

// ── El fragmento del login ─────────────────────────────────────────────────

export interface TokenFragmento {
  readonly accessToken: string | null;
  readonly longLivedToken: string | null;
  readonly expiresIn: number | null;
  readonly dataAccessExpiration: string | null;
  readonly error: string | null;
  readonly errorDescription: string | null;
}

export const SIN_TOKEN: TokenFragmento = {
  accessToken: null,
  longLivedToken: null,
  expiresIn: null,
  dataAccessExpiration: null,
  error: null,
  errorDescription: null,
};

/**
 * Lee el fragmento `#access_token=...` que devuelve el login de Meta.
 *
 * Se admite el hash con o sin `#` porque los tests pasan las dos formas y
 *la diferencia importa: una aserción que solo funciona con el `#` no comprueba el caso en
 * que `window.location.hash` llega sin él.
 */
export function leerFragmento(hash: string): TokenFragmento {
  const limpio = hash.startsWith("#") ? hash.slice(1) : hash;
  if (limpio === "") return SIN_TOKEN;

  const p = new URLSearchParams(limpio);

  const error = texto(p.get("error"));
  if (error !== null) {
    return { ...SIN_TOKEN, error, errorDescription: texto(p.get("error_description")) };
  }

  const bruto = texto(p.get("expires_in"));
  const expiraEn = bruto === null ? Number.NaN : Number(bruto);

  return {
    accessToken: texto(p.get("access_token")),
    longLivedToken: texto(p.get("long_lived_token")),
    expiresIn: Number.isFinite(expiraEn) ? expiraEn : null,
    dataAccessExpiration: texto(p.get("data_access_expiration_time")),
    error: null,
    errorDescription: null,
  };
}

// ── La query del Authorization Window de Threads ──────────────────────────

export interface CallbackQuery {
  readonly code: string | null;
  readonly state: string | null;
  readonly error: string | null;
  readonly errorReason: string | null;
  readonly errorDescription: string | null;
}

export const SIN_QUERY: CallbackQuery = {
  code: null,
  state: null,
  error: null,
  errorReason: null,
  errorDescription: null,
};

/**
 * Lee la query `?code=...` que devuelve el Authorization Window de Threads.
 *
 * ## Por qué esto vive al lado de `leerFragmento` y no dentro
 *
 * Porque son **la misma página** las dos que devuelven datos: `/auth/meta/callback`
 * sirve tanto al login de Facebook (token en el fragmento) como al de Threads
 * (code en la query). Se leen por separado y se mezclan en el componente.
 *
 * ## Lo que Meta manda de más
 *
 * **El `#_` del final.** Threads redirige a
 *
 *     https://tu-callback/?code=AQBx-hBsH3...#_
 *                                        ↑ esto
 *
 * y documenta que "no forma parte del code, quítalo". Aquí no hay nada que quitar:
 * el code viene en la query, no en el fragmento. Lo que sí hay que evitar es que
 * alguien interprete ese `#_` como si fuera un token, y por eso `leerFragmento`
 * tiene un test con `#_` que devuelve `SIN_TOKEN` en vez de inventarse un valor.
 *
 * ## El `error` de Threads
 *
 * Cuando el usuario cancela, Threads manda `error=access_denied` **y** además
 * `error_reason=user_denied` y `error_description`. La tabla de la documentación
 * escribe el valor con una errata (`acceess_denied`, tres ceses) mientras que el
 * ejemplo de más abajo lleva `access_denied`. Se leen los dos campos tal cual
 * llegan y no se normaliza ninguno: el texto se muestra al usuario, y un
 * `acceess` → `access` "arreglado" por nosotros escondería un cambio real de Meta.
 */
export function leerQuery(search: string): CallbackQuery {
  const limpio = search.startsWith("?") ? search.slice(1) : search;
  if (limpio === "") return SIN_QUERY;

  const p = new URLSearchParams(limpio);

  return {
    code: texto(p.get("code")),
    state: texto(p.get("state")),
    error: texto(p.get("error")),
    errorReason: texto(p.get("error_reason")),
    errorDescription: texto(p.get("error_description")),
  };
}

/**
 * ¿Es esto un error de cancelación de Threads?
 *
 * Se mira `error` y `error_reason` por separado porque los dos vienen rellenos y
 * solo uno es el que dice por qué pasó. Se considera cancelación cualquier cosa
 * que no sea `null`: una lista de valores aceptados sería una lista que se queda
 * corta el día que Meta añada uno.
 */
export function esCancelacion(q: CallbackQuery): boolean {
  return q.error !== null || q.errorReason !== null;
}