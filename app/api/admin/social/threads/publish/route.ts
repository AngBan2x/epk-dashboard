/**
 * RC.45 — Publicar de verdad en Threads.
 *
 * ## Las cuatro cosas que hacen esta ruta distinta de un `publicar()` suelto
 *
 * **1. Solo admin.** `validateRequest` y `role === "admin"`. No hay ningún otro
 * rol que pueda llegar aqui, ni aunque el token se filtre.
 *
 * **2. `confirmar: true` es obligatorio.** Y no es un formality check: es lo que
 * separa "quiero ver que se publica" de "quiero publicar". Un `POST` sin ese campo
 * se responde con `400` y no se toca la red de Threads.
 *
 * **3. Vuelve a validar.** No confía en lo que el navegador le dijera al
 * `preview`. El texto puede haber cambiado entre una llamada y otra, y validar es
 * gratis mientras que publicar no. Un cliente que no haya pasado por el preview
 * puede publicar igual, pero nunca con un texto que no se haya validado ahora.
 *
 * **4. Vuelve a comprobar las imágenes.** Por lo mismo: una URL que ayer
 * respondía 200 hoy puede estar caída, y el fallo de Threads al descargar el
 * medio deja la publicación a medias.
 *
 * ## Por qué no hay modo "programado"
 *
 * Porque un post programado es un post que sale solo, sin nadie mirando. Eso pide
 * una cola, un reintento y un panel: es trabajo de otra fase, y meter un
 * `programar: <fecha>` aquí sin nada de eso sería escribir un campo que no
 * funciona.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { opcionesThreads } from "@/lib/social/config";
import { crearAdaptador } from "@/lib/social/threads";
import { comprobarImagenes } from "@/lib/social/imagenes";
import type { Imagen, Publicacion } from "@/lib/social/tipos";

export const dynamic = "force-dynamic";

interface Cuerpo {
  readonly texto?: unknown;
  readonly imagenes?: unknown;
  readonly confirmar?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sesion = await validateRequest(req);
  if (sesion === null || sesion.role !== "admin") {
    return NextResponse.json({ error: "Solo un administrador." }, { status: 403 });
  }

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await req.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }

  // Va **antes** de mirar nada mas. Un `confirmar` ausente se responde sin
  // leer credenciales ni tocar la red de Threads.
  if (cuerpo.confirmar !== true) {
    return NextResponse.json(
      {
        error: "Falta `confirmar: true`.",
        nota: "Esta es la ruta que escribe en Threads. Pasa el preview primero.",
        publicado: false,
      },
      { status: 400 }
    );
  }

  const config = opcionesThreads(fetch);
  if (!config.ok) {
    return NextResponse.json(
      { error: "Threads no está configurado en este entorno.", faltan: config.faltan },
      { status: 503 }
    );
  }

  const texto = typeof cuerpo.texto === "string" ? cuerpo.texto : "";
  const imagenes: readonly Imagen[] = Array.isArray(cuerpo.imagenes)
    ? cuerpo.imagenes
        .filter((v): v is string => typeof v === "string" && v !== "")
        .map((url) => ({ url }))
    : [];

  const publicacion: Publicacion = { texto, imagenes };
  const adaptador = crearAdaptador(config.valor);

  // Se revalida aqui, no se confia en el preview.
  const validacion = adaptador.validar(publicacion);
  if (!validacion.ok) {
    return NextResponse.json(
      {
        error: "La publicación no es válida y no se ha enviado nada.",
        validacion,
        publicado: false,
      },
      { status: 400 }
    );
  }

  if (imagenes.length > 0) {
    const informes = await comprobarImagenes(
      imagenes.map((i) => i.url),
      fetch
    );
    const malos = informes.filter((i) => !i.ok);
    if (malos.length > 0) {
      return NextResponse.json(
        {
          error: "Alguna imagen no se podrá descargar, y el post se quedaría a medias.",
          imagenes: informes,
          publicado: false,
        },
        { status: 400 }
      );
    }
  }

  // A partir de aqui ya se escribe en una red social real.
  const resultado = await adaptador.publicar(publicacion);

  return NextResponse.json({
    plataforma: "threads",
    publicado: true,
    id: resultado.id,
    url: resultado.url,
    caracteres: [...texto].length,
    imagenes: imagenes.length,
    nota:
      resultado.url === null
        ? "Un post de solo texto no trae permalink: se ha guardado el id."
        : undefined,
  });
}
