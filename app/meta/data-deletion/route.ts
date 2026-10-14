/**
 * RC.42 — Callback de solicitud de eliminación de datos de Meta.
 *
 * ## Por qué esta ruta devuelve una página, no un JSON
 *
 * Porque Meta pide dos cosas distintas en este mismo sitio y una sola URL:
 *
 * 1. **Una dirección para los humanos.** Quien usa PressPlay y pide borrar sus
 *    datos tiene que poder leer qué pasa y cómo pedirlo. Si esta ruta fuera un
 *    endpoint que devuelve `200`, esa persona vería una página en blanco y se
 *    iría pensando que la han ignorado.
 * 2. **Un sitio donde Meta pueda hacer `POST`.** Cuando alguien usa el formulario
 *    de "tus datos en Meta", Meta envía una petición firmada a esta misma URL.
 *
 * Splittear eso en dos rutas obligaría a inventar la segunda; una sola ruta que
 * conteste a `GET` con la página y a `POST` con un `200` cubre las dos, que es
 * exactamente lo que Meta pide.
 *
 * ## Lo que todavía NO hace
 *
 * **No borra nada.** La petición de Meta llega firmada con `X-Hub-Signature-256`,
 * y validar esa firma es lo que distingue un `POST` real de uno cualquiera. Sin
 * esa comprobación, cualquiera que descubra esta URL podría escribir en ella.
 *
 * De momento se responde `200` y se registra la llegada. Cuando llegue la fase de
 * App Review habrá que: validar la firma, localizar al usuario por
 * `signed_request.user_id` y ejecutar el borrado en cascada. Está anotado en
 * `docs/PHASE_P13.md` para que no se pierda.
 *
 * ## Por qué `200` y no `501` aunque no borre
 *
 * Porque `501` hace que Meta marque la URL como rota y la quite de las
 * configuraciones. Un `200` con la petición registrada es un estado honesto:
 * "llegó, está pendiente", no "no existe".
 */

export const dynamic = "force-dynamic";

function pagina(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Eliminar tus datos — PressPlay</title>
  </head>
  <body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.6">
    <h1 style="font-size:1.5rem">Eliminar tus datos de PressPlay</h1>
    <p>
      Puedes pedir que borremos tus datos escribiendo a
      <a href="mailto:privacy@pressplay.app">privacy@pressplay.app</a> desde el
      mismo correo con el que te registraste.
    </p>
    <p>
      Borramos tu cuenta, tus releases, tus shows y los datos de métricas
      asociados. Las suscripciones a otros artistas se eliminan contigo. Puede
      tardar hasta 30 días, y en ese plazo ya no se puede recuperar nada.
    </p>
    <p>
      Si solo quieres desconectar PressPlay de Threads o Instagram, puedes
      revocar el acceso desde los ajustes de permisos de esa plataforma: no hace
      falta borrar la cuenta.
    </p>
  </body>
</html>`;
}

/** Lo que Meta espera al hacer `POST` con la petición firmada. */
function aceptado(): Response {
  return new Response(JSON.stringify({ ok: true, borrado: "pendiente" }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function GET(): Promise<Response> {
  return new Response(pagina(), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: Request): Promise<Response> {
  // Se lee el cuerpo para que Meta no se queje de una conexión abortada, pero no
  // se registra nada: si el cuerpo bringing datos personales a un log de Vercel
  // sería peor que ignorarlo.
  await request.text().catch(() => "");
  return aceptado();
}