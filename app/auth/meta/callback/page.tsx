"use client";

/**
 * RC.37 — Callback del login de Meta.
 *
 * ## Por qué esto es una página y no un route handler
 *
 * Porque el token vuelve **en el fragmento** de la URL:
 *
 *     https://tu-callback?#access_token=...&long_lived_token=...&expires_in=...
 *                          ↑ esto no viaja en la petición HTTP
 *
 * El navegador no manda el fragmento al servidor. Un `route.ts` de Next.js,
 * por muy bien escrito que esté, recibiría la petición **sin token** y no
 * tendría forma de saber que faltó algo. Solo una página de cliente puede
 * leer `window.location.hash`.
 *
 * ## Por qué borra la URL nada más leerla
 *
 * Un token de Facebook en la barra de direcciones se queda en el historial del
 * navegador, y desde ahí se cuela en el `Referer` de cualquier recurso que se
 * cargue después. Se limpia con `replaceState`, que **reemplaza** la entrada
 * en vez de añadir otra: con `pushState` el token seguiría en el historial.
 *
 * ## Por qué este fichero imprime un secreto
 *
 * `scripts/social-check.ts` existe precisamente para no imprimir credenciales.
 * Esta página es **la excepción deliberada**, y la razón es que no hay otro
 * sitio del que sacar el token: vive en la barra de direcciones del navegador y
 * nadie más que JavaScript puede leerlo.
 *
 * Está aquí documentado para que la contradicción esté escrita. Si algún día
 * esta ruta se expone en producción, lo que hay que hacer es **eliminarla**,
 * no protegerla con una contraseña: el token es corto y de un solo uso, pero
 * quien llegue a la página lo lee.
 */

import { useEffect, useRef, useState } from "react";
import {
  esCancelacion,
  leerFragmento,
  leerQuery,
  type CallbackQuery,
  type TokenFragmento,
} from "@/lib/social/meta";

function clase(caja: React.ReactNode): string {
  return "mx-auto max-w-2xl rounded-lg border border-gray-200 p-6";
}

/** Lo que se leyó de la URL, de las dos mitades a la vez. */
interface Callback {
  readonly fragmento: TokenFragmento;
  readonly query: CallbackQuery;
}

function leerCallback(): Callback {
  return {
    fragmento: leerFragmento(window.location.hash),
    query: leerQuery(window.location.search),
  };
}

export default function MetaCallbackPage() {
  const [datos, setDatos] = useState<Callback | null>(null);
  const [copiado, setCopiado] = useState(false);
  const limpioHecho = useRef(false);

  useEffect(() => {
    // `useEffect` puede dispararse dos veces en StrictMode. Sin este ref, la
    // segunda pasada intentaría copiar un fragmento que ya no está, y dejaría
    // el token a medias en la pantalla en lugar de mostrarlo limpio.
    if (limpioHecho.current) return;
    limpioHecho.current = true;

    const leido = leerCallback();

    // Se limpia **siempre**, incluso si el usuario canceló el login: el
    // `error_description` también puede traer texto que no queremos en el
    // historial.
    //
    // Se borran query **y** fragmento porque los dos viajan. En Facebook está
    // el token en el hash; en Threads está el code en la query y un `#_` en el
    // hash. `pathname` a secas se lleva los dos.
    window.history.replaceState(null, "", window.location.pathname);

    setDatos(leido);
  }, []);

  const fragmento = datos?.fragmento ?? null;
  const query = datos?.query ?? null;

  const longLived = fragmento?.longLivedToken ?? null;
  const expiraEn = fragmento?.expiresIn ?? null;
  const token = longLived ?? fragmento?.accessToken ?? null;
  const code = query?.code ?? null;

  // El code de Threads es un credencial de un solo uso y una hora de vida, así
  // que se ofrece en pantalla igual que el token: no hay otro sitio de donde
  // sacarlo.
  const valorACopiar = code ?? token;

  const hayErrorFragmento = fragmento !== null && fragmento.error !== null;
  const hayErrorQuery = query !== null && esCancelacion(query);
  const sinNada =
    datos !== null &&
    !hayErrorFragmento &&
    !hayErrorQuery &&
    valorACopiar === null;

  async function copiar(): Promise<void> {
    if (!valorACopiar) return;
    try {
      await navigator.clipboard.writeText(valorACopiar);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // El portapapeles puede estar bloqueado por permisos. No es un error
      // recuperable: el valor está en pantalla para copiarlo a mano, y eso
      // sigue funcionando.
      setCopiado(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold">Callback de Meta</h1>
      <p className="mb-8 text-sm text-gray-600">
        <strong className="text-amber-700">Solo para desarrollo.</strong> Esta
        página existe para sacar el token o el code del navegador. No la
        publiques en producción.
      </p>

      {datos === null && <p className={clase("text-gray-600")}>Leyendo la URL…</p>}

      {(hayErrorFragmento || hayErrorQuery) && (
        <div className={clase("border-red-300 bg-red-50")}>
          <h2 className="mb-2 font-semibold text-red-800">
            El login devolvió un error
          </h2>
          <p className="font-mono text-sm text-red-700">
            {query?.error ?? fragmento?.error}
          </p>
          {query?.errorReason && (
            <p className="mt-2 text-sm text-red-700">
              Motivo: <span className="font-mono">{query.errorReason}</span>
            </p>
          )}
          {query?.errorDescription && (
            <p className="mt-1 text-sm text-red-700">{query.errorDescription}</p>
          )}
          {fragmento?.errorDescription && (
            <p className="mt-2 text-sm text-red-700">{fragmento.errorDescription}</p>
          )}
        </div>
      )}

      {sinNada && (
        <div className={clase("border-amber-300 bg-amber-50")}>
          <p className="text-amber-900">
            No hay ni token ni code en la URL. Es lo que pasa si se abre la
            página directamente, sin venir del login.
          </p>
        </div>
      )}

      {code !== null && (
        <div className="space-y-4">
          <div className={clase("border-green-300 bg-green-50")}>
            <p className="mb-3 font-semibold text-green-900">
              Authorization code de Threads (usa este)
            </p>

            <code className="block max-h-40 overflow-y-auto break-all rounded border border-green-200 bg-white p-3 font-mono text-xs dark:bg-slate-900 dark:text-slate-100">
              {code}
            </code>

            <button
              type="button"
              onClick={copiar}
              className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>

            <p className="mt-4 text-sm text-green-900">
              Es de un solo uso y dura <strong>1 hora</strong>. Threads añade un{" "}
              <code className="font-mono">#_</code> al final de la URL:{" "}
              <strong>no forma parte del code</strong>, y este valor ya viene
              limpio.
            </p>
          </div>

          <div className={clase("bg-gray-50")}>
            <h2 className="mb-2 font-semibold">Siguiente paso</h2>
            <p className="mb-2 text-sm text-gray-700">
              Pasa el code por la variable de entorno (no por la línea de
              comandos, que lo deja en el historial):
            </p>
            <code className="mt-2 block rounded border bg-white p-3 font-mono text-xs dark:bg-slate-900 dark:text-slate-100">
              THREADS_AUTH_CODE=PEQUE_CODE npx tsx scripts/threads-token.ts --apply
            </code>
          </div>
        </div>
      )}

      {token !== null && (
        <div className="space-y-4">
          <div className={clase("border-green-300 bg-green-50")}>
            <p className="mb-3 font-semibold text-green-900">
              {longLived !== null ? "Token de larga duración (usa este)" : "Token de corta duración"}
            </p>

            <code className="block max-h-40 overflow-y-auto break-all rounded border border-green-200 bg-white p-3 font-mono text-xs dark:bg-slate-900 dark:text-slate-100">
              {token}
            </code>

            <button
              type="button"
              onClick={copiar}
              className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>

          {expiraEn !== null && (
            <p className="text-sm text-gray-600">
              Caduca en {Math.round(expiraEn / 60)} minutos.
            </p>
          )}

          <div className={clase("bg-gray-50")}>
            <h2 className="mb-2 font-semibold">Siguiente paso</h2>
            <p className="mb-2 text-sm text-gray-700">
              Pega el token en <code className="font-mono">.env.local</code> como{" "}
              <code className="font-mono">META_USER_ACCESS_TOKEN</code>.
            </p>
            <p className="text-sm text-gray-700">
              Luego, el script sacará el token de Page y el ID de Instagram:
            </p>
            <code className="mt-2 block rounded border bg-white p-3 font-mono text-xs dark:bg-slate-900">
              npx tsx scripts/meta-page-token.ts --apply
            </code>
          </div>
        </div>
      )}
    </main>
  );
}