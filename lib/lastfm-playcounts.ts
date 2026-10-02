import { normalizeOfficialText, stripVideoDecorations } from "./youtube";
import type { LastfmTopTrack } from "./lastfm";

/**
 * RC.34 — el cableado de `lastfmPlaycount` que faltaba.
 *
 * ## Por qué existe este módulo y no vive dentro de la Route Handler
 *
 * Las piezas que hacen falta son **puras** (normalizar un título, armar un
 * índice, buscar un número) y las necesitan tres superficies que no se ven entre
 * sí: la Route Handler que habla con Last.fm, un Server Component que arma el
 * lote, y dos componentes cliente que leen el resultado.
 *
 * No se pueden compartir desde `app/api/lastfm/route.ts` porque **Next.js no
 * permite que una Route Handler exporte otra cosa que no sea el handler**: el
 * typecheck de `.next/types` rechaza cualquier export extra con
 * `Type 'X' is incompatible with index signature`. Con las páginas de `app/`
 * pasa lo mismo. Es un límite del framework, no una convención del repo, y es la
 * razón de que el recorte del paréntesis final no acabara copiado en tres sitios:
 * copiar un normalizador es exactamente el fallo que `lib/youtube.ts:8-15`
 * documenta para no reimplementar `normalizeAudioText`.
 *
 * Es puro a propósito: ni `fetch`, ni `process.env`, ni nada de Node, así que lo
 * pueden importar igual un Route Handler y un `"use client"`. `LastfmTopTrack`
 * entra con `import type`, que el compilador borra, y así `lib/lastfm.ts`
 * (que lee `LASTFM_API_KEY` al cargarse) no llega al bundle del navegador.
 */

/**
 * Artistas aceptados por petición al modo `batch` de `/api/lastfm`.
 *
 * Tope de seguridad, no de cuota: cada artista cuesta una llamada upstream, así
 * que el modo `batch` no puede multiplicar `artist.gettoptracks` sin límite. El
 * catálogo completo son 12 artistas, así que una rejilla entera entra de sobra;
 * bajarlo de 12 dejaría artistas del catálogo sin scrobbles sin motivo.
 */
export const LASTFM_ARTIST_LIMIT = 20;

/**
 * Pistas que se piden por artista a `artist.gettoptracks`.
 *
 * El catálogo entero del proyecto (83 filas) cabe en 100 para cualquier
 * artista, con margen para que crezca sin tener que subir este número. Last.fm
 * admite varios cientos, así que no es el techo del proveedor: es el punto en el
 * que el índice deja de crecer de forma útil.
 */
export const LASTFM_TOP_TRACKS_LIMIT = 100;

/** `título normalizado -> playcount`. Objeto plano: sobrevive al límite RSC. */
export type LastfmPlaycountIndex = Record<string, number>;

/** `artista normalizado -> índice de sus pistas`. Lo que devuelve `batch`. */
export type LastfmByArtistRecord = Record<string, LastfmPlaycountIndex>;

/**
 * Grupo entre paréntesis o corchetes al FINAL del título.
 *
 * Se quita ANTES de normalizar porque `normalizeOfficialText` ya se come los
 * paréntesis y convertirlos en espacios los vuelve indistinguibles del resto
 * del texto.
 */
const TRAILING_GROUP = /\s*(?:\([^()]*\)|\[[^[\]]*\])\s*$/;

/**
 * ## Por qué hay que quitar el sufijo entre paréntesis
 *
 * Last.fm devuelve los títulos **sin** el calificador de edición que sí trae el
 * catálogo: Last.fm dice `"Army of Me"` y aquí la fila es `"Army of Me (2013)"`,
 * o `"Fake Plastic Trees (Acoustic Version)"`, o `"Subtitles (2009 Remaster)"`.
 *
 * `normalizeOfficialText("Army of Me (2013)")` es `"army of me 2013"` y
 * `normalizeOfficialText("Army of Me")` es `"army of me"`: dos claves
 * distintas, o sea la pista nunca casa y la tarjeta se queda en "—" para
 * siempre. Quitar el grupo final es lo que hace que ambos compartan clave.
 *
 * ## Lo que NO se distingue
 *
 * Un grupo final puede ser metadata de master **o** el nombre de otra
 * grabación, y aquí no se separa: `"Stonemilker (Strings)"` y `"Heroes (Live)"`
 * caen en la versión a secas. `lib/deezer.ts` sí distingue
 * (`TRANSPARENT_TITLE_QUALIFIERS`), pero allí un `(Strings)` es motivo de
 * **rechazar** porque la pista que se busca es exactamente esa grabación. Para
 * una tarjeta que muestra scrobbles agregados eso no sirve: el catálogo tiene
 * `"Fake Plastic Trees (Acoustic Version)"`, y `acoustic`/`version` no están en
 * esa lista a propósito porque allí cambian la obra. Se acepta el posible
 * false positive a cambio de que las pistas del catálogo tengan número.
 */
function stripTrailingGroups(raw: string): string {
  let text = raw;
  for (;;) {
    const next = text.replace(TRAILING_GROUP, "");
    if (next === text) return text.trim();
    text = next;
  }
}

/**
 * Clave con la que se indexa el `gettoptracks` de un artista y con la que se
 * busca una fila del catálogo. Si las dos no coinciden, las tarjetas vuelven a
 * "—" sin que nada falle: es el fallo que hay que poder ver, y por eso
 * `tests/unit/lastfm-wiring.test.ts` fija los casos con y sin sufijo.
 *
 * Reutiliza la normalización que ya existía en vez de escribir una tercera:
 * `normalizeOfficialText` es el reexport de `normalizeAudioText`
 * (`lib/youtube.ts` → `lib/seed-audio.ts`) y `stripVideoDecorations` quita
 * `"… [Official Video]"`, que es la decoración más habitual en un título.
 */
export function lastfmTitleKey(title: string | null | undefined): string {
  if (typeof title !== "string") return "";
  return normalizeOfficialText(stripTrailingGroups(stripVideoDecorations(title)));
}

/**
 * Clave de artista. Sin recortar nada: un nombre de artista no lleva
 * calificador de master, y `"Björk"` tiene que seguir casando consigo misma.
 */
export function lastfmArtistKey(artist: string | null | undefined): string {
  return normalizeOfficialText(artist);
}

/**
 * Índice `título normalizado -> playcount` a partir del `gettoptracks` de UN
 * artista.
 *
 * Cuando Last.fm trae dos títulos que colapsan en la misma clave —`"Army of Me"`
 * y `"Army of Me (Live)"`— gana **el más escuchado**, no el primero: el número
 * que se pinta responde a "cuánto se escuchó esta obra", y quedarse con el 12 de
 * la variante menos escuchada daría una cifra arbitraria.
 *
 * Un `0` de Last.fm se conserva. `0` es un dato (`resolveMetrics` lo trata como
 * tal); la ausencia la representa la clave que no existe, no el valor.
 */
export function buildLastfmPlaycountIndex(
  topTracks: readonly LastfmTopTrack[],
): LastfmPlaycountIndex {
  const index: LastfmPlaycountIndex = {};
  for (const track of topTracks) {
    const key = lastfmTitleKey(track.name);
    if (!key) continue;
    const playcount = Number.isFinite(track.playcount) ? Math.max(0, track.playcount) : 0;
    const current = index[key];
    if (current === undefined || playcount > current) index[key] = playcount;
  }
  return index;
}

/**
 * El número de una pista, o `null` cuando no lo hay.
 *
 * **`null` y nunca `0`.** `null` es "no lo sabemos" (Last.fm no respondió, no
 * conoce la pista, o no la trajo en el top) y es lo que `resolveMetrics`
 * traduce al "—" con su tooltip. Un `0` aquí afirmaría que nadie escuchó nunca
 * la pista, que es justo el bug que `lib/metrics-source.ts` documenta.
 */
export function lastfmPlaycountFor(
  index: LastfmPlaycountIndex | null | undefined,
  title: string | null | undefined,
): number | null {
  if (!index) return null;
  const key = lastfmTitleKey(title);
  if (!key) return null;
  const value = index[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Fila con `artista normalizado + título normalizado` → `number | null`, tal
 * como lo consume `EPKCard`.
 *
 * Vive aquí para que un componente cliente pueda tener su propio lote en estado
 * (el dashboard) sin reimplementar las dos búsquedas: una función, un sitio, y
 * el mismo comportamiento de "ausencia = `null`" en las tres superficies.
 */
export function lastfmPlaycountForRow(
  index: LastfmByArtistRecord,
  artist: string | null | undefined,
  title: string | null | undefined,
): number | null {
  const perArtist = index[lastfmArtistKey(artist)];
  return perArtist ? lastfmPlaycountFor(perArtist, title) : null;
}