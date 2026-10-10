import {
  getArtistByName,
  getArtistCatalog,
  getTrackById,
  getTracksByReleaseId,
} from "@/lib/db";
import { releaseShape, type ReleaseShape } from "@/lib/release-page";
import type { Track } from "@/types/music";

/**
 * P2 · Ola 10 — la lectura de "un lanzamiento y sus pistas" vive aquí, no en la
 * página.
 *
 * ## Por qué NO hay SQL en este fichero
 *
 * La instrucción de AGENTS.md (REGLA, corregida en RC.31) es dos cosas a la vez,
 * y conviene separarlas porque aquí se cumple una y no la otra:
 *
 * 1. **No reimplementar lo que `lib/db.ts` ya sabe.** `parseTrack` NO está
 *    exportado, así que un `SELECT` aquí tendría que reconstruir el parseo de
 *    ~30 columnas a mano, incluida la diferencia entre "no hay dato" y `0` en
 *    `tracks.metrics` (RC.33). Dos parseos del mismo `SELECT *` divergen, y el
 *    que diverge es el nuevo.
 * 2. **Una sola fuente de verdad para decidir Turso vs local.** No hace falta
 *    aquí porque **no se decide**: `getTrackById` y `getTracksByReleaseId` ya
 *    ramifican internamente sobre `isTursoEnabled()`, que lee `process.env` en
 *    tiempo de llamada, y no hay una segunda fuente con la que discrepar. El
 *    patrón roto de GAP-B era exactamente tener las dos (una decidía, la otra
 *    ejecutaba) y que no pudieran coincidir. Aquí no hay dos.
 *
 * Consecuencia asumida: **dos consultas** donde una consulta con `LEFT JOIN`
 * bastaría. Es el mismo número que hacía la página antes de este cambio
 * (`getTrackById` y luego `getTracksByReleaseId`), así que no es una
 * regresión. Y la alternativa —escribir el SQL aquí con
 * `getTursoClientSync() !== null`— exigiría exportar `parseTrack` de
 * `lib/db.ts`, que en esta subfase está fuera de los ficheros con ownership.
 *
 * ## El nombre de la columna
 *
 * El enunciado de P2 habla de `parent_id`. **La columna se llama
 * `release_id`** (`lib/db.ts:218`, y `Track.release_id` la expone `parseTrack`
 * en `lib/db.ts:748`); `parent_id` no existe ni en el esquema ni en el tipo.
 * Todo lo de abajo usa el nombre real.
 */

export interface ReleaseWithTracks extends ReleaseShape {
  release: Track;
  /** Hijas en orden de disco y número de pista. Vacío = single suelto. */
  tracks: Track[];
}

/**
 * El lanzamiento con sus pistas, o `null` si la fila no existe.
 *
 * `null` es lo que distingue "no existe" de "existe y no tiene hijas", que son
 * dos cosas distintas y confundirlas es lo que hacía que un single suelto
 * desapareciera.
 */
export async function getReleaseWithTracks(id: string): Promise<ReleaseWithTracks | null> {
  const release = await getTrackById(id);
  if (!release) return null;

  const tracks = await getTracksByReleaseId(id);

  return { release, tracks, ...releaseShape(release, tracks) };
}

/**
 * ## El resultado de abrir `/track/[id]`, como unión discriminada
 *
 * Los cuatro casos son excluyentes y ninguno se deduce de otro, así que se
 * nombran. Un `Track | null` obligaba a volver a preguntar "¿y si es hija?" en
 * cada punto, y la respuesta dependía de si alguien se acordaba.
 *
 * - `missing`: no hay fila con ese id. La ruta responde 404.
 * - `track`: la fila existe y **no** es hija. **Rama de seguridad**: en este
 *   esquema no se alcanza hoy, porque toda fila sin `release_id` es cabecera de
 *   release y cae en `release`. Se conserva para que un futuro tipo de fila que
 *   no sea release tenga a donde ir.
 * - `release`: hay una página de release para este contenido. Cubre los dos
 *   casos: la fila es hija de un padre que existe, y la fila **es** la cabecera
 *   de su propio release. En ambos se redirige con 301, y el motivo de que
 *   exista `/track/[id]` es preservar los enlaces viejos, no ser una segunda
 *   puerta al mismo contenido.
 * - `orphan`: la fila es hija pero su padre **no existe**. Ver abajo.
 */
export type TrackRoute =
  | { kind: "missing" }
  | { kind: "track"; track: Track }
  | { kind: "release"; href: string }
  | { kind: "orphan"; track: Track; missingParentId: string };

/**
 * ## La decisión, y su coste
 *
 * **Comprobar antes de redirigir**, no al revés.
 *
 * El enunciado señalaba el tradeoff: "redirect primero = una id que no existe da
 * 404 del padre, no de la hija; y cuesta un query de más si la pista no es
 * hija". Con `redirect()` de `next/navigation` en un Server Component **no hay
 * ese segundo coste**: decidir el caso exige la fila de la pista, y sin ella no
 * se sabe si es hija. El query extra solo se paga en el camino de la hija, que
 * es la minoridad de las visitas. Pagarlo en el camino del redirect primero
 * significaría que **toda** visita a `/track/<algo>` paga un query que la
 * mayoría no necesita, y encima aceptamos un 404 del padre para un id
 * inexistente —un 404 que además es *mentiroso*, porque dice que no existe una
 * página que el usuario nunca pidió.
 *
 * Y el orden inverso tampoco compra nada gratis: para el caso "hija cuyo padre
 * ya no existe" hay que consultar el padre **igual**. Con "comprobar primero"
 * esa consulta solo ocurre en la rama de la hija.
 *
 * ## Una hija sin padre
 *
 * `release_id` **no es una foreign key** (`lib/db.ts:218`, `release_id TEXT`
 * pelado, sin `REFERENCES`), y la cascada que borra las hijas al borrar un
 * release (`buildChildStatusCascade` es al revés; lo que borra es
 * `DELETE FROM tracks WHERE id = ?` en `app/api/releases`) no siempre corre:
 * un `PUT` de artista que deja `tracks: []` con filas existentes se rechaza, pero
 * un script o un `DELETE` directo dejan hijas apuntando al vacío.
 *
 * Redirigir a `/releases/<padre-inexistente>` produce un 404 en una URL que no
 * significa nada para quien la ve, y además el servidor acaba de gastar una
 * consulta para descubrirlo. Las tres alternativas son:
 *
 * - **404 aquí**: se pierde contenido que existe y es reproducible —y el
 *   visitante no distingue "no existe" de "existe pero la borraron".
 * - **Redirigir al padre**: 404 opaco, y crea un ciclo de redirección si el
 *   padre, a su vez, fuera hija.
 * - **`orphan`**: se renderiza la ficha de la pista CON UN AVISO de que su
 *   lanzamiento ya no está en el catálogo.
 *
 * Se elige `orphan`. El principio es el mismo que en el resto del repo desde
 * RC.31: **degradar y decir lo que pasa, en vez de fingir que el dato no
 * existe.** El contenido es real y se puede reproducir; lo único que se pierde
 * es un enlace, y el aviso lo explica en la primera línea de la página.
 */
export async function resolveTrackRoute(id: string): Promise<TrackRoute> {
  const track = await getTrackById(id);
  if (!track) return { kind: "missing" };

  const parentId = typeof track.release_id === "string" ? track.release_id.trim() : "";

  if (parentId === "") {
    // Sin padre: esta fila **es** un release. Un single es a la vez fila de
    // `tracks` y cabecera del release con el MISMO id (`getReleaseWithTracks` es
    // `getTrackById` + `getTracksByReleaseId`, sin tabla aparte), así que
    // `/track/<id>` y `/releases/<id>` sirven el mismo contenido con dos
    // plantillas distintas. Dos URLs para un solo contenido duplica el SEO, parte
    // las métricas y deja la ficha de 535 líneas de `/track/[id]` sin nada que
    // la enlace.
    //
    // No hace falta comprobar nada más: `/releases/<id>` resuelve siempre, porque
    // la fila que ya tengo ES la cabecera. Por eso es un 301 y no una decisión
    // condicional — no puede fallar.
    return { kind: "release", href: `/releases/${id}` };
  }

  const parent = await getTrackById(parentId);
  if (!parent) return { kind: "orphan", track, missingParentId: parentId };

  return { kind: "release", href: `/releases/${parentId}` };
}

