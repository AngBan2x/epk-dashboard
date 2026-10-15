/**
 * RC.45 — Vista previa de una publicación en Threads. **No publica nada.**
 *
 * ## Por qué esta ruta existe separada de la que publica
 *
 * Porque son dos operaciones con consecuencias opuestas. Esta lee, redacta,
 * valida y comprueba que Meta podrá descargar las imágenes: es gratis y
 * repetible. La de publicar escribe en una red social con miles de personas
 * viendo.
 *
 * La razón de estar separadas no es el estilo: es que una ruta que **no puede**
 * publicar es la unica forma de que "probar" un texto antes de mandarlo no tenga
 * ningun riesgo. Con un flag `publicar: true` dentro de la misma ruta, un
 * `true` de mas —un `?publicar=1` en la URL, un valor por defecto equivocado— es
 * una publicacion real. Con dos rutas, no hay ningun camino de este codigo que
 * escriba en Threads.
 *
 * ## Lo que devuelve
 *
 * El borrador ya recortado a 500 caracteres, la validacion con errores y avisos,
 * y el informe de cada imagen. `listoParaPublicar` es `true` solo si no hay
 * **errores**; los avisos no bloquean, porque son cosas que no se pueden
 * comprobar desde aqui.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { opcionesThreads } from "@/lib/social/config";
import { crearAdaptador } from "@/lib/social/threads";
import { comprobarImagenes } from "@/lib/social/imagenes";
import type { Imagen } from "@/lib/social/tipos";

export const dynamic = "force-dynamic";

interface Cuerpo {
  readonly titulo?: unknown;
  readonly cuerpo?: unknown;
  readonly enlace?: unknown;
  readonly imagenes?: unknown;
}

function textoDe(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function imagenesDe(valor: unknown): readonly Imagen[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((v): v is string => typeof v === "string" && v !== "")
    .map((url) => ({ url }));
}

async function admin(req: NextRequest): Promise<boolean> {
  const sesion = await validateRequest(req);
  return sesion !== null && sesion.role === "admin";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await admin(req))) {
    return NextResponse.json({ error: "Solo un administrador." }, { status: 403 });
  }

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await req.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }

  const config = opcionesThreads(fetch);
  if (!config.ok) {
    // Se devuelven **nombres** de variables, nunca valores.
    return NextResponse.json(
      {
        error: "Threads no está configurado en este entorno.",
        faltan: config.faltan,
        nota: "Un token que funciona en local no está en producción: hay que crear las variables allí también.",
      },
      { status: 503 }
    );
  }

  const contenido = {
    titulo: textoDe(cuerpo.titulo),
    cuerpo: textoDe(cuerpo.cuerpo),
    enlace: typeof cuerpo.enlace === "string" && cuerpo.enlace !== "" ? cuerpo.enlace : undefined,
    imagenes: imagenesDe(cuerpo.imagenes),
  };

  const adaptador = crearAdaptador(config.valor);
  const borrador = await adaptador.redactar(contenido);
  const validacion = adaptador.validar(borrador.publicacion);

  const informes =
    borrador.publicacion.imagenes.length > 0
      ? await comprobarImagenes(borrador.publicacion.imagenes.map((i) => i.url), fetch)
      : [];

  const problemasDeImagen = informes.filter((i) => !i.ok).map((i) => `${i.problema}`);

  const errores = [...validacion.errores, ...problemasDeImagen];
  const avisos = [
    ...validacion.avisos,
    ...informes.filter((i) => i.aviso !== null).map((i) => i.aviso as string),
  ];

  return NextResponse.json({
    plataforma: "threads",
    texto: borrador.publicacion.texto,
    caracteres: [...borrador.publicacion.texto].length,
    ajustes: borrador.ajustes,
    imagenes: informes,
    validacion: { ok: errores.length === 0, errores, avisos },
    listoParaPublicar: errores.length === 0,
    publicado: false,
  });
}
