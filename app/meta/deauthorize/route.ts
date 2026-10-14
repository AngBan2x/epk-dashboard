/**
 * RC.42 — Callback de desautorización de Meta.
 *
 * ## Qué es esto
 *
 * Meta avisa por aquí cuando alguien **desautoriza** la app desde Threads o
 * Instagram. No es un callback de OAuth: no trae ningún token y no hay nada que
 * canjear. Solo hay que responder `200` para que Meta deje de reintentar.
 *
 * ## Por qué devuelve HTML y no un JSON
 *
 * Porque a veces Meta la abre en el navegador del usuario, no la llama por
 * servidor. Si devolviera `application/json` sin más, alguien vería un
 * `{"ok":true}` en crudo y pensaría que algo se ha roto.
 *
 * ## Lo que NO hace
 *
 * **No revoca el token.** Este endpoint es una casilla para Meta. El token que
 * tenemos en `.env.local` sigue vivo hasta que caduque o hasta que se revoque
 * desde el propio panel. Escribir en la base de datos desde aquí exigiría
 * validar la firma de la petición de Meta, que es un trabajo de otra fase; hasta
 * entonces, un `200` honesto es mejor que un `200` que miente sobre lo que ha
 * hecho.
 */

export const dynamic = "force-dynamic";

const RESPUESTA = `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><title>PressPlay</title></head>
  <body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
    <h1 style="font-size:1.25rem">Autorización revocada</h1>
    <p>Has desconectado PressPlay de Threads. Ya no publicaremos en tu nombre.</p>
  </body>
</html>`;

/**
 * Meta manda GET y POST según el flujo. Se responden los dos porque responder
 * `405` a un método que no se esperaba hace que Meta reintente y lo marque como
 * un fallo de configuración, no como un acierto.
 */
function responder(): Response {
  return new Response(RESPUESTA, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(): Promise<Response> {
  return responder();
}

export async function POST(): Promise<Response> {
  return responder();
}