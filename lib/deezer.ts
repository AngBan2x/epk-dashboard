/**
 * Lógica pura del backfill de audio por Deezer y de carátulas por
 * MusicBrainz / Cover Art Archive (RC.32 · agente G).
 *
 * ## Por qué este módulo existe y por qué está separado de los scripts
 *
 * Dos fuentes externas, una sola regla: **nada se escribe sin estar
 * confirmado**. La confirmación se decide con funciones puras —sin `fetch`, sin
 * `better-sqlite3`, sin `process.env`— para que `tests/unit/` pueda ejercitarlas
 * con `environment: "node"` y sin red. Los scripts
 * (`scripts/fetch-deezer-previews.ts`, `scripts/fetch-cover-art.ts`) son los que
 * leen, escriben y enseñan el dry-run; inyectan el verificador HTTP.
 *
 * Este módulo hospeda **las dos** lógicas aunque su nombre solo mentione
 * Deezer. Es deliberado: es el único fichero de `lib/` que el agente G posee,
 * y partir la lógica de carátulas en un `lib/cover-art.ts` sería meter un
 * fichero en el territorio de otro agente. La separación real es por sección,
 * no por fichero.
 *
 * ## MEDICIÓN 1 — Deezer NO necesita proxy por CORS
 *
 * El plan (`docs/PLAN_RC32.md:155`) decía "Deezer (con proxy por CORS)", igual
 * que se dijo de Spotify. **Eso se comprobó antes de construir nada** y es
 * falso. `curl -sI` con `Origin: https://epk-dashboard.vercel.app` contra una
 * URL de preview real:
 *
 * ```
 * cdnt-preview.dzcdn.net -> HTTP/1.1 200 OK
 *   Access-Control-Allow-Origin: *
 *   Access-Control-Allow-Headers: Range
 *   Accept-Ranges: bytes
 *   Content-Type: audio/mpeg
 *   Vary: Origin
 * ```
 *
 * El CDN de Deezer manda ACAO, y además `Allow-Headers: Range` y
 * `Accept-Ranges: bytes`: el `seek()` funciona. Mismo resultado que ya se había
 * medido para el CDN de Apple (`lib/audio-priority.ts:220-227`). **No hay que
 * escribir ningún proxy.** Lo que sí habría que hacer, y NO se hace aquí porque
 * `lib/audio-priority.ts` es del agente B, es añadir
 * `cdnt-preview.dzcdn.net` a `CORS_VERIFIED_AUDIO_HOSTS` para que el
 * visualizador pueda enganchar el grafo de Web Audio.
 *
 * ## MEDICIÓN 2 — pero la URL caduca a los 15 minutos
 *
 * Este es el hallazgo que **sí** cambia la decisión, y es la razón de que el
 * script no escriba previews de Deezer.
 *
 * La URL de preview no es un recurso estable: es un **recurso firmado** por
 * Akamai. Lleva `?hdnea=exp=…~acl=…~data=…~hmac=…`, y `exp` es un `exp` de
 * verdad:
 *
 * ```
 * exp - ahora = 900 s exactos  (15 minutos), medido dos veces con tokens frescos
 * ```
 *
 * Y la firma es **obligatoria**: la misma ruta sin la query firmada da
 *
 * ```
 * HTTP/1.1 403 Forbidden   Content-Type: text/html
 * ```
 *
 * Es decir: no hay forma de "estabilizar" la URL quitando la query. Y guardar
 * en `audio_preview_url` una URL que vive 15 minutos **reproduciría exactamente
 * el bug que `scripts/fetch-itunes-previews.ts` documenta en su cabecera**: las
 * 6 URLs escritas a mano en el seed caducaron, la tarjeta muestra "Reproducir"
 * y el `<audio>` responde "archivo no disponible". Es peor que no tener audio,
 * porque **parece** funcionar.
 *
 * Por eso `buildDeezerUpdate` devuelve `null` para toda URL de Deezer y el
 * script informa las 9 filas que sí consigue identificar, con su HTTP y su
 * TTL, para que la decisión de fondo (resolver en tiempo de ejecución, con un
 * endpoint propio) se tome knowing the number, no a ciegas.
 *
 * La API **no necesita `appId`**: `https://api.deezer.com/track/3135556`
 * responde 200 sin credencial (el token va incrustado con
 * `application_id=42`, el del reproductor web). Comprobado también que
 * `?app_id=` con un valor inventado **no** da 403, o sea que un 403 aquí nunca
 * significaría "falta la clave". Aun así el script acepta
 * `DEEZER_APP_ID` del entorno si algún día hace falta, y avisa si no lo hay.
 *
 * ## LA DESAMBIGUACIÓN, Y LOS CASOS REALES QUE LA PONEN A PRUEBA
 *
 * Este repo ya se equivocó dos veces al fiarse del primer resultado de iTunes
 * (retratos de artistas, `AI_LOG.md:5448-5449`). Con audio el coste es peor: un
 * preview de la grabación equivocada suena a otra canción y nadie lo nota.
 *
 * Lo que se comprobó **de verdad** contra Deezer antes de escribir esto:
 *
 * | Caso del catálogo | Lo que Deezer devuelve | Decisión |
 * |---|---|---|
 * | `Stonemilker (Strings)` (y las otras 4 hijas de Björk) | el álbum *"Vulnicura Strings (…Strings, Voice And Viola Organista Only)"* titula sus pistas **a secas**: `Stonemilker`, `Family`, `Lionsong`, `Black Lake`, `Notget` | **calificado**: el desajuste es solo del calificador, y el ancla de colección prueba cuál es la grabación |
 * | `Heroes` (padre e hija) | solo `"Heroes" (2017 Remaster)`, y algún live | **calificado**: `(2017 Remaster)` es un calificador de edición, no otra obra |
 * | `V-2 Schneider` | `V-2 Schneider` de un álbum de superhéroes y de un tribute, más `V-2 Schneider (2017 Remaster)` de `"Heroes"` | el ancla `Heroes` deja solo el remaster |
 * | `Tour de France` (Kraftwerk, 1983) | `Tour de France '03 (Version 1/2/3)` del **álbum de 2003**, y `Tour de France (Live)`. El single de 1983 a secas no aparece | **rechazado**: `(Version N)` y `'03` no son calificadores de edición |
 * | `The Model / Computer Love` | 0 resultados | `NO RESUELTO` |
 * | `The Wall`, `OK Computer`, `The Dark Side of the Moon`, `Vulnicura Strings` | el **álbum** como `type: "album"` | `NO RESUELTO`: un álbum no es una canción |
 *
 * ### La regla, en una frase
 *
 * **Artista exacto siempre. Título exacto siempre, y "calificado" solo con ancla
 * de colección probada. Un álbum nunca. Una URL que caduca nunca.**
 *
 * ## CARÁTULAS — por qué Cover Art Archive y no el thumbnail de YouTube
 *
 * MusicBrainz/Cover Art Archive no existía en el repo (0 hits) y es la fuente
 * correcta: gratis, sin clave, y con **licencia verificable** — el mismo
 * criterio que ya se aplicó a los retratos de artistas.
 *
 * Lo que **no** se usa, explícitamente, es el thumbnail de YouTube
 * (`youtube.com/vi/<id>/maxresdefault.jpg`, construido en `lib/youtube.ts:82-85`
 * y en uso). Es tentador porque ya está en el código y "funciona". Pero
 * `maxresdefault.jpg` es **el fotograma que el uploader exportó como miniatura
 * del vídeo**, no la carátula del disco: es una captura, normalmente del
 * visualizationizer o de un cartel de YouTube, y cambia con el vídeo. Puesta en
 * `cover_image` se hace pasar por artwork del disco. Es el mismo error que
 * poner una foto de banco, pero **con pinta de portada**, que es peor.
 *
 * MusicBrainz exige un `User-Agent` identificable y limita a ~1 req/s; el
 * script lo respeta y **no** paraleliza.
 */

import {
  collectionMatches,
  hasITunesArtwork,
  normalizeAudioText,
} from "./seed-audio";

// ===========================================================================
// 1 · Deezer — previews de audio
// ===========================================================================

/** Resultado de `api.deezer.com/search` ya normalizado a lo que aquí importa. */
export interface DeezerCandidate {
  id: number;
  /** Título de la pista. */
  title: string;
  /** Intérprete de la pista (`data.artist.name`). */
  artistName: string;
  /** Título del álbum (`data.album.title`). */
  albumTitle: string;
  albumId?: number | undefined;
  /** `data.preview`. Viene ya **firmado** y con caducidad: ver `deezerPreviewTtlSeconds`. */
  previewUrl?: string | undefined;
  /** Fecha del lanzamiento. **Solo la trae `/track/{id}`**, no `/search`. */
  releaseDate?: string | null | undefined;
  /** `data.type`: `"track"` o `"album"`. Un álbum nunca es una canción. */
  type?: string | undefined;
}

/** La fila de `tracks` que se quiere resolver, con el contexto que hace falta. */
export interface DeezerWanted {
  id: string;
  title: string;
  artistName: string;
  /** `release_date` de la fila (`YYYY-MM-DD`), para desempatar reediciones. */
  releaseDate?: string | null | undefined;
  /**
   * Título de la colección que debe contener la pista, o `null` si no hay ancla.
   * Sale del release padre **cuando su portada se resolvió por iTunes**
   * (`mzstatic.com`). Sin ancla no hay prueba de cuál es la grabación.
   */
  expectedCollection?: string | null | undefined;
  /** Lo que ya hay escrito, para no tocar filas que ya están bien. */
  currentPreviewUrl?: string | null | undefined;
}

export type DeezerRejectReason =
  | "tipo-no-track"
  | "artista-distinto"
  | "titulo-distinto"
  | "titulo-parcial-sin-ancla"
  | "coleccion-distinta"
  | "sin-preview"
  | "http-no-200"
  | "content-type-no-audio"
  | "sin-acao"
  | "caduca-antes-de-guardar";

export interface RejectedDeezerCandidate {
  label: string;
  reason: DeezerRejectReason;
  detail: string;
}

/** Lo que devolvió DE VERDAD la petición HTTP a la URL de preview. */
export interface VerifiedAudioProbe {
  ok: true;
  url: string;
  httpStatus: number;
  contentType: string;
  /** `Access-Control-Allow-Origin` de la respuesta, o `null`. */
  accessControlAllowOrigin: string | null;
}

export interface FailedAudioProbe {
  ok: false;
  reason: DeezerRejectReason;
  detail: string;
}

export type AudioProbe = VerifiedAudioProbe | FailedAudioProbe;

/**
 * Verificador inyectable. El script pasa el HTTP real; los tests pasan un doble,
 * así que **ningún test depende de la red** y se puede simular el 404 o la
 * caducidad sin esperar a que el CDN conteste.
 */
export type AudioProbeFn = (url: string) => Promise<AudioProbe>;

export interface DeezerResolution {
  wanted: DeezerWanted;
  /** El candidato elegido, o `null` si nada pasó la verificación. */
  chosen: DeezerCandidate | null;
  verified: VerifiedAudioProbe | null;
  /** Por qué no se resolvió. Vacío cuando sí se resolvió. */
  reason: string;
  /** Candidatos que pasaron el filtro pero no la prueba HTTP. */
  httpRejected: RejectedDeezerCandidate[];
  /** Candidatos descartados por no coincidir. */
  rejected: RejectedDeezerCandidate[];
  /**
   * `true` cuando el título no coincidió **exacto** y se aceptó porque el ancla
   * de colección probaba la grabación. Se imprime siempre: es la decisión que
   * más caro sale si se equivoca.
   */
  usedQualifiedTitle: boolean;
  /**
   * Vida restante de la URL en el momento de resolverla, en segundos, o `null`
   * si no se pudo leer la caducidad. Con `exp` a 900 s, esto es lo que impide
   * escribirla.
   */
  ttlSeconds: number | null;
}

export type DeezerTitleMatch =
  /** Coinciden tal cual. Siempre aceptable. */
  | "exacto"
  /** Solo difieren en calificadores, y hay ancla que prueba la grabación. */
  | "calificado"
  /** Coincide en parte. **Nunca** se acepta: indica otra grabación. */
  | "parcial"
  | "distinto";

export { normalizeAudioText as normalizeDeezerText, hasITunesArtwork, collectionMatches };

/**
 * Un resultado de búsqueda solo sirve si es una pista.
 *
 * `api.deezer.com/search` devuelve también **`type: "album"`**, y para este
 * catálogo eso es exactamente el caso que hay que descartar: `The Wall`,
 * `OK Computer`, `The Dark Side of the Moon` y `Vulnicura Strings` son
 * títulos de álbum, así que Deezer los devuelve tal cual y "coincidirían".
 * Un álbum no es una canción.
 */
export function isTrackResult(candidate: { type?: string | undefined } | null | undefined): boolean {
  return !!candidate && typeof candidate.type === "string" && candidate.type.toLowerCase() === "track";
}

/**
 * El intérprete tiene que coincidir **exactamente**.
 *
 * Copia de la decisión de `lib/seed-audio.ts` (`audioArtistMatches`) y por el
 * mismo motivo: una coincidencia parcial de artista significa preview de otro
 * intérprete. Björk aparece como "Björk &…" en colaboraciones, y David Bowie
 * como "David Bowie (Tribute)". Se reexporta el normalizador pero **no** se
 * reimplementa la comparación: dos copias divergirían.
 */
export function deezerArtistMatches(candidate: string, wanted: string): boolean {
  const a = normalizeAudioText(candidate);
  const b = normalizeAudioText(wanted);
  if (!a || !b) return false;
  return a === b;
}

/**
 * Palabras que describen **la edición o el master**, no **la obra**.
 *
 * Un calificador de esta lista se puede quitar al comparar títulos porque no
 * cambia qué se está escuchando: el `(2017 Remaster)` de `"Heroes"` es el
 * mismo tema de 1977, remasterizado. Es el motivo de que `Heroes` y
 * `V-2 Schneider` se puedan resolver: sin esta lista, el unico resultado de
 * Deezer para `Heroes` seria `Heroes (2017 Remaster)` y la fila se quedaria
 * sin audio. Y no es una holgura: `version` esta deliberadamente **fuera**.
 *
 * Lo que **no** está en la lista y por qué:
 *
 * - `"version"` → `Tour de France '03 (Version 3)` es **otra obra** (la versión
 *   de 2003), no una edición. Ese caso lo frenan **dos** guards a la vez: `version`
 *   no es transparente y `3` no es un año de 4 cifras, así que ninguno de los
 *   dos basta por sí solo; el test que aísla la decisión usa `(Version 2003)`.
 * - `"live"` → es otra grabación, aunque sea el mismo tema. Se descarta.
 * - `"strings"` → es otra versión interpretada (`Stonemilker (Strings)`).
 */
export const TRANSPARENT_TITLE_QUALIFIERS: ReadonlySet<string> = new Set([
  "remaster",
  "remastered",
  "remasterisation",
  "remasterizacion",
  "reissue",
  "deluxe",
  "edition",
  "mono",
  "stereo",
  "anniversary",
]);

function stripBracketed(text: string, open: string, close: string): string {
  let out = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === open) {
      depth += 1;
      continue;
    }
    if (ch === close && depth > 0) {
      depth -= 1;
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

/** Elimina `(...)` y `[...]`. Se hace **antes** de normalizar, porque
 *  `normalizeAudioText` ya se come los paréntesis y después no se puede saber
 *  qué parte estaba entre paréntesis. */
function stripParentheticals(raw: string): string {
  return stripBracketed(stripBracketed(raw, "(", ")"), "[", "]");
}

/** Tokens alfanuméricos de un grupo entre paréntesis, ya normalizados. */
function parentheticalTokens(raw: string): string[][] {
  const groups: string[][] = [];
  const re = /\(([^)]*)\)|\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    groups.push(normalizeAudioText(m[1] ?? m[2] ?? "").split(" ").filter(Boolean));
  }
  return groups;
}

const FOUR_DIGIT_YEAR = /^(19|20)\d{2}$/;

/**
 * ¿Este grupo entre paréntesis es un calificador de edición?
 *
 * Solo si **todos** sus tokens son o una palabra de
 * `TRANSPARENT_TITLE_QUALIFIERS` o un año de 4 cifras, **y** contiene al menos
 * una de esas palabras. El año solo no basta:
 * `"(2017 Remaster)"` es transparente, `"(2003)"` no lo es (un año a secas no
 * dice si es reedición u obra nueva).
 */
function isTransparentGroup(tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  let hasQualifier = false;
  for (const token of tokens) {
    if (TRANSPARENT_TITLE_QUALIFIERS.has(token)) {
      hasQualifier = true;
      continue;
    }
    if (FOUR_DIGIT_YEAR.test(token)) continue;
    return false;
  }
  return hasQualifier;
}

/** Título del candidato con **solo** los grupos transparentes eliminados. */
function titleWithoutTransparentGroups(raw: string): string {
  const groups = parentheticalTokens(raw);
  let transparent: string[][] = [];
  for (const tokens of groups) {
    if (isTransparentGroup(tokens)) transparent.push(tokens);
  }
  let text = raw;
  // Se vuelve a barrer para quitar exactamente esos grupos, en orden.
  const re = /\(([^)]*)\)|\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const tokens = normalizeAudioText(m[1] ?? m[2] ?? "").split(" ").filter(Boolean);
    if (isTransparentGroup(tokens)) {
      text = text.replace(m[0], " ");
    }
  }
  return normalizeAudioText(text);
}

/**
 * ¿Cómo encaja el título de un candidato con el que se busca?
 *
 * Dos direcciones, y **las dos exigen ancla** para devolver `"calificado"`:
 *
 * - **A — el wanted trae el calificador y el candidato va a secas.**
 *   `"Stonemilker (Strings)"` vs `"Stonemilker"`. Aquí el desajuste es inofensivo
 *   **solo si el ancla ya dijo de qué álbum sale**: sin ancla, un `"Stonemilker"`
 *   a secas es la versión de estudio de *Homogenic*, que es justo el error que
 *   este repo ya pagó (`AI_LOG.md:5448-5449`).
 * - **B — el candidato trae el calificador y el wanted va a secas.**
 *   `"Heroes"` vs `"Heroes" (2017 Remaster)`. Solo si el calificador es de
 *   edición; `(Version 3)`, `(Live)` y `'03` no lo son.
 *
 * `"parcial"` nunca se acepta. Existe para poder **describir** el descarte.
 */
export function matchDeezerTitle(candidate: string, wanted: string, hasAnchor: boolean): DeezerTitleMatch {
  const a = normalizeAudioText(candidate);
  const b = normalizeAudioText(wanted);
  if (!a || !b) return "distinto";
  if (a === b) return "exacto";

  const qualified = hasAnchor ? "calificado" : "parcial";

  // Dirección A: el wanted con sus paréntesis quitados == el candidato tal cual.
  const wantedBare = normalizeAudioText(stripParentheticals(wanted));
  if (wantedBare && a === wantedBare) return qualified;

  // Dirección B: el candidato sin sus grupos transparentes == el wanted tal cual.
  const candidateBare = titleWithoutTransparentGroups(candidate);
  if (candidateBare && candidateBare === b) return qualified;

  return a.includes(b) || b.includes(a) ? "parcial" : "distinto";
}

/** Año de una fecha `YYYY-MM-DD`. `null` si no hay fecha. */
export function yearOf(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

/**
 * Ordena los candidatos que YA pasaron artista+título+colección.
 *
 * Dos criterios, en este orden y por este motivo:
 *
 * 1. **Título exacto sobre calificado.** Un candidato con el título clavado gana
 *    a otro que se aceptó quitándole un calificador. A igualdad de todo, es la
 *    coincidencia más fuerte que se puede hacer.
 * 2. **Año.** El seed trae `release_date`; con dos reediciones del mismo tema
 *    gana la del año del seed y no la más reciente. Es lo que separa el single
 *    de 1983 del disco de 2003.
 */
export function rankDeezerCandidate(
  candidate: DeezerCandidate,
  wanted: DeezerWanted,
  titleMatch: DeezerTitleMatch
): number {
  let score = titleMatch === "exacto" ? 80 : 30;
  const wantedYear = yearOf(wanted.releaseDate);
  const gotYear = yearOf(candidate.releaseDate);
  if (wantedYear != null && gotYear != null) {
    if (gotYear === wantedYear) score += 40;
    else if (Math.abs(gotYear - wantedYear) === 1) score += 15;
    else score -= 30;
  }
  // A igualdad de todo, la colección más simple es la edición original.
  score -= Math.min(normalizeAudioText(candidate.albumTitle).length, 60) / 10;
  return score;
}

/** Texto para identificar un candidato en la salida. */
export function describeDeezerCandidate(candidate: DeezerCandidate): string {
  return `"${candidate.title}" de ${candidate.artistName} [${candidate.albumTitle}]`;
}

// ---------------------------------------------------------------------------
// La caducidad: el motivo por el que no se escribe (MEDIDO)
// ---------------------------------------------------------------------------

/**
 * Vida del token `exp` de una URL de preview de Deezer, en segundos.
 * **Medida, no documentada**: dos tokens frescos dieron `exp - ahora = 900`.
 */
export const DEEZER_PREVIEW_TOKEN_TTL_SECONDS = 900;

/**
 * Umbral por debajo del cual una URL no se considera guardable.
 *
 * Siete días. Es un criterio depgsql deliberadamente exigente: si una URL no
 * sobrevive más que a la sesión en la que se escribió, escribirla produce una
 * tarjeta que **parece** reproducible y no lo es. El audio ausente al menos no
 * miente.
 */
export const MIN_DURABLE_PREVIEW_TTL_SECONDS = 7 * 24 * 60 * 60;

/** `exp` de la query firmada, en ms epoch. `null` si la URL no lo lleva. */
export function deezerPreviewExpiryMs(url: string | null | undefined): number | null {
  if (typeof url !== "string") return null;
  const match = url.match(/[?&]hdnea=[^~]*?exp=(\d{9,})/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value * 1000 : null;
}

/**
 * Segundos que le quedan a una URL de preview, o `null` si no se puede saber.
 *
 * `null` significa **desconocido, no infinito**: ninguna URL sin `exp` legible
 * pasa el filtro de durabilidad, porque no hay forma de demostrar que sea
 * estable. Preferiría no escribir a escribir una URL que caduca.
 */
export function deezerPreviewTtlSeconds(url: string | null | undefined, nowMs: number): number | null {
  const expiry = deezerPreviewExpiryMs(url);
  if (expiry === null) return null;
  return Math.round((expiry - nowMs) / 1000);
}

/** ¿La URL sobrevive más que `minTtlSeconds`? */
export function isDurablePreviewUrl(
  url: string | null | undefined,
  nowMs: number,
  minTtlSeconds: number = MIN_DURABLE_PREVIEW_TTL_SECONDS
): boolean {
  const ttl = deezerPreviewTtlSeconds(url, nowMs);
  return ttl !== null && ttl > minTtlSeconds;
}

/**
 * Resuelve una pista en Deezer. **Nunca escribe**: devuelve qué se escribiría y
 * con qué prueba, o por qué no se resolvió.
 *
 * `probe` es inyectable para que los tests nodependan de la red.
 *
 * Se recorren los candidatos válidos en orden y **se verifica HTTP cada uno**
 * hasta que uno pasa: si el mejor tiene la URL caducada pero el segundo está
 * vivo, se usa el segundo. La pregunta es "¿hay audio que reproduzca?", no
 * "¿el primero de la lista funcionaba?".
 */
export async function resolveDeezerPreview(
  wanted: DeezerWanted,
  candidates: readonly DeezerCandidate[],
  probe: AudioProbeFn,
  nowMs: number
): Promise<DeezerResolution> {
  const rejected: RejectedDeezerCandidate[] = [];
  const viable: Array<{ candidate: DeezerCandidate; titleMatch: DeezerTitleMatch }> = [];
  const hasAnchor = !!normalizeAudioText(wanted.expectedCollection);

  for (const candidate of candidates) {
    const label = describeDeezerCandidate(candidate);

    if (!isTrackResult(candidate)) {
      rejected.push({
        label,
        reason: "tipo-no-track",
        detail: `viene como "${candidate.type ?? "sin tipo"}"`,
      });
      continue;
    }

    if (!deezerArtistMatches(candidate.artistName, wanted.artistName)) {
      rejected.push({
        label,
        reason: "artista-distinto",
        detail: `artista "${candidate.artistName}" ≠ "${wanted.artistName}"`,
      });
      continue;
    }

    const titleMatch = matchDeezerTitle(candidate.title, wanted.title, hasAnchor);
    if (titleMatch === "distinto") {
      rejected.push({
        label,
        reason: "titulo-distinto",
        detail: `"${candidate.title}" ≠ "${wanted.title}"`,
      });
      continue;
    }
    if (titleMatch === "parcial") {
      rejected.push({
        label,
        reason: "titulo-parcial-sin-ancla",
        detail:
          `"${candidate.title}" solo coincide parcialmente con "${wanted.title}"` +
          (hasAnchor
            ? ""
            : " y no hay ancla de colección que pruebe cuál es la grabación"),
      });
      continue;
    }

    if (hasAnchor && !collectionMatches(candidate.albumTitle, wanted.expectedCollection)) {
      rejected.push({
        label,
        reason: "coleccion-distinta",
        detail: `está en "${candidate.albumTitle || "(sin colección)"}", no en "${wanted.expectedCollection}"`,
      });
      continue;
    }

    const url = (candidate.previewUrl ?? "").trim();
    if (!url) {
      rejected.push({
        label,
        reason: "sin-preview",
        detail: "Deezer no trae preview para esta pista",
      });
      continue;
    }

    viable.push({ candidate, titleMatch });
  }

  viable.sort((a, b) => {
    const diff =
      rankDeezerCandidate(b.candidate, wanted, b.titleMatch) -
      rankDeezerCandidate(a.candidate, wanted, a.titleMatch);
    // Empate estable por id: dos candidatos con la misma puntuación no pueden
    // depender del orden en que los devolviera la búsqueda.
    return diff !== 0 ? diff : a.candidate.id - b.candidate.id;
  });

  const httpRejected: RejectedDeezerCandidate[] = [];

  for (const { candidate, titleMatch } of viable) {
    const url = (candidate.previewUrl ?? "").trim();
    const result = await probe(url);
    if (!result.ok) {
      httpRejected.push({
        label: describeDeezerCandidate(candidate),
        reason: result.reason,
        detail: result.detail,
      });
      continue;
    }

    const ttl = deezerPreviewTtlSeconds(result.url, nowMs);
    // La fila se **identifica** pero no se **escribe**: la URL caduca a los
    // 900 s. Se devuelve la resolución con `chosen` para que el script la
    // imprima, y `reason` explica por qué no es escribible.
    const durable = ttl !== null && ttl > MIN_DURABLE_PREVIEW_TTL_SECONDS;
    return {
      wanted,
      chosen: candidate,
      verified: result,
      reason: durable
        ? ""
        : `identificada, pero NO escribible: la URL de preview de Deezer caduca en ` +
          `${ttl ?? "?"} s (el token hdnea expira a los ${DEEZER_PREVIEW_TOKEN_TTL_SECONDS} s ` +
          `y la firma es obligatoria: sin la query da 403). Se necesita resolverla en tiempo de ejecución.`,
      httpRejected,
      rejected,
      usedQualifiedTitle: titleMatch === "calificado",
      ttlSeconds: ttl,
    };
  }

  let reason: string;
  if (candidates.length === 0) {
    reason = "Deezer no devolvió ningún resultado para esta búsqueda";
  } else if (viable.length === 0) {
    reason = `ningún resultado pasó la verificación de artista + título${
      hasAnchor ? " + colección" : ""
    } (${rejected.length} descartado(s))`;
  } else {
    reason = `los ${viable.length} candidato(s) con título y artista exactos no pasaron la prueba HTTP`;
  }

  return {
    wanted,
    chosen: null,
    verified: null,
    reason,
    httpRejected,
    rejected,
    usedQualifiedTitle: false,
    ttlSeconds: null,
  };
}

/** Lo que se escribiría en `tracks`. `null` cuando no hay nada que escribir. */
export interface DeezerUpdate {
  id: string;
  audio_preview_url: string;
  verified: VerifiedAudioProbe;
}

/**
 * La fila a escribir, o `null` si no hay nada que escribir.
 *
 * ## Por qué **no** se escribe `itunes_track_id`
 *
 * Porque no hay columna `deezer_track_id` en `tracks` (comprobado en el
 * esquema de `lib/db.ts`) y **no se inventa un campo**. Rellenar
 * `itunes_track_id` con un id de Deezer dejaría una columna que dice "iTunes"
 * guardando un número de Deezer, y `lib/downloadable-assets.ts:299` la lee para
 * construir el enlace de Apple Music: produciría un enlace a otra canción. Es
 * peor que dejar la columna a null.
 */
export function buildDeezerUpdate(resolution: DeezerResolution): DeezerUpdate | null {
  const { wanted, chosen, verified } = resolution;
  if (!chosen || !verified) return null;
  // Durabilidad: una URL que caduca antes de que la vuelva a abrir alguien no
  // se escribe. Es el punto donde los 900 s del token se convierten en "no".
  if (!isDurablePreviewUrl(verified.url, Date.now())) return null;
  return {
    id: wanted.id,
    audio_preview_url: verified.url,
    verified,
  };
}

/**
 * Filtra un plan de escrituras: solo lo verificado, solo lo **durable** y solo
 * lo que cambia. Sin el segundo filtro, `--apply` reescribiría filas idénticas
 * y el recuento de "filas aplicadas" dejaría de significar nada.
 */
export function selectDeezerUpdates(
  resolutions: readonly DeezerResolution[],
  nowMs: number
): DeezerUpdate[] {
  const updates: DeezerUpdate[] = [];
  for (const resolution of resolutions) {
    const { wanted, chosen, verified } = resolution;
    if (!chosen || !verified) continue;
    if (!isDurablePreviewUrl(verified.url, nowMs)) continue;
    const current = (wanted.currentPreviewUrl ?? "").trim();
    if (current === verified.url) continue;
    updates.push({ id: wanted.id, audio_preview_url: verified.url, verified });
  }
  return updates;
}

// ===========================================================================
// 2 · MusicBrainz / Cover Art Archive — carátulas
// ===========================================================================

/** Un `release` de MusicBrainz, reducido a lo que decide. */
export interface MusicBrainzRelease {
  id: string;
  title: string;
  /** Nombres de `artist-credit`, ya unidos. */
  artistNames: string[];
  /** `date` (puede ser solo el año). */
  date?: string | null | undefined;
  /** `"Official"` / `"Promotion"` / … */
  status?: string | null | undefined;
  primaryType?: string | null | undefined;
}

export interface CoverWanted {
  id: string;
  title: string;
  artistName: string;
  /** `release_date` de la fila. Desempata *Tour de France* (1983) del disco de 2003. */
  releaseDate?: string | null | undefined;
  /** Lo que hay ahora en `cover_image`. */
  currentCoverImage?: string | null | undefined;
}

export type CoverRejectReason =
  | "artista-distinto"
  | "titulo-distinto"
  | "no-es-un-lanzamiento"
  | "sin-portada"
  | "no-es-imagen"
  | "es-thumbnail-de-youtube"
  | "ya-esta-bien";

export interface RejectedCoverCandidate {
  label: string;
  reason: CoverRejectReason;
  detail: string;
}

export interface VerifiedImageProbe {
  ok: true;
  /** URL **final**, tras seguir la redirección de CAA. Es la estable. */
  url: string;
  httpStatus: number;
  contentType: string;
  bytes: number;
}

export interface FailedImageProbe {
  ok: false;
  reason: CoverRejectReason;
  detail: string;
}

export type ImageProbe = FailedImageProbe | VerifiedImageProbe;

export type ImageProbeFn = (url: string) => Promise<ImageProbe>;

export interface CoverResolution {
  wanted: CoverWanted;
  release: MusicBrainzRelease | null;
  verified: VerifiedImageProbe | null;
  reason: string;
  rejected: RejectedCoverCandidate[];
  usedQualifiedTitle: boolean;
}

export interface CoverUpdate {
  id: string;
  cover_image: string;
  verified: VerifiedImageProbe;
}

/**
 * El thumbnail de YouTube **no** es una carátula.
 *
 * `lib/youtube.ts:82-85` construye
 * `https://img.youtube.com/vi/<id>/maxresdefault.jpg`, y el catálogo lo usa
 * como `cover_image`. Es tentador porque ya está escrito y "funciona", pero es
 * **el fotograma que el uploader exportó como miniatura del vídeo**: una
 * captura del visualizationizer, un cartelAutomatico de YouTube o un fondo que
 * el canal cambió. No es la portada del disco, y en `cover_image` se hace pasar
 * por si lo fuera.
 *
 * Se rechaza por **host**, no por nombre de fichero, para que también caiga un
 * `i.ytimg.com` o un `youtube.com/vi/…`.
 */
export function isYouTubeThumbnailUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string" || url.trim() === "") return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return (
      host === "img.youtube.com" ||
      host.endsWith(".ytimg.com") ||
      host === "ytimg.com" ||
      host === "i.ytimg.com"
    );
  } catch {
    return false;
  }
}

/** Fotos de banco. Mala fuente, pero al menos no miente sobre qué son. */
export function isStockPhotoUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string" || url.trim() === "") return false;
  return /images\.unsplash\.com|images\.pexels\.com|cdn\.pixabay\.com/i.test(url);
}

/**
 * ¿Merece la pena sustituir la portada actual?
 *
 * Solo si está vacía o es una foto de banco. Una portada que ya viene de iTunes
 * (`mzstatic.com`) o de CAA **no se toca**: cambiarla por otra edición sería
 * hacer a mano lo que este script existe para no hacer.
 */
export function shouldReplaceCover(currentCoverImage: string | null | undefined): boolean {
  const current = (currentCoverImage ?? "").trim();
  if (current === "") return true;
  if (isYouTubeThumbnailUrl(current)) return false;
  return isStockPhotoUrl(current);
}

/**
 * `image/*` y nada más.
 *
 * Se excluye `image/svg+xml` a propósito: un SVG es un documento activo, y
 * ponerlo en `cover_image` lo acaba sirviendo el navegador como imagen de la
 * portada. Un JPEG de CAA es lo esperado.
 */
export function isImageContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (!ct.startsWith("image/")) return false;
  return ct !== "image/svg+xml";
}

/**
 * ¿Es este candidato la misma obra?
 *
 * Solo **coincidencia exacta** del título y del artista, más el año como
 * desempate. Aquí **no** hay qualified-title: a diferencia del audio, el
 * catálogo de portada es pequeño y conocido, y el ancla de iTunes que justificaba
 * aquella holgura no existe en esta fuente. Si no cuadra exactamente, es
 * `NO RESUELTO`.
 */
export function matchReleaseIdentity(
  release: MusicBrainzRelease,
  wanted: CoverWanted
): { ok: boolean; detail: string } {
  const artist = release.artistNames.join(", ");
  if (!deezerArtistMatches(artist, wanted.artistName)) {
    return {
      ok: false,
      detail: `artista "${artist}" ≠ "${wanted.artistName}"`,
    };
  }
  const titleMatch = matchDeezerTitle(release.title, wanted.title, false);
  if (titleMatch !== "exacto") {
    return {
      ok: false,
      detail:
        titleMatch === "calificado"
          ? `"${release.title}" solo encaja quitándole un calificador, y en carátulas no se admite`
          : `"${release.title}" ≠ "${wanted.title}"`,
    };
  }
  return { ok: true, detail: "" };
}

/** Ordena releases: el del año del seed primero, después la edición más simple. */
export function rankMusicBrainzRelease(release: MusicBrainzRelease, wanted: CoverWanted): number {
  let score = 0;
  const wantedYear = yearOf(wanted.releaseDate);
  const gotYear = yearOf(release.date);
  if (wantedYear != null && gotYear != null) {
    if (gotYear === wantedYear) score += 100;
    else if (Math.abs(gotYear - wantedYear) === 1) score += 40;
    else score -= 60;
  }
  if (typeof release.status === "string" && /^official$/i.test(release.status)) score += 15;
  score -= Math.min(normalizeAudioText(release.title).length, 60) / 10;
  return score;
}

/**
 * Resuelve una carátula. **Nunca escribe.**
 *
 * Se recorren los releases válidos en orden y se **verifica HTTP cada uno**
 * hasta que uno devuelva una imagen real. Cover Art Archive es un
 * **redirector**: `https://coverartarchive.org/release/<mbid>/front` devuelve
 * 307 → 302 a `archive.org/download/mbid-…jpg`. La URL de archive.org es la
 * que se guarda, porque es estable; la de CAA se volvería a resolver en cada
 * carga.
 */
export async function resolveCoverArt(
  wanted: CoverWanted,
  releases: readonly MusicBrainzRelease[],
  probe: ImageProbeFn
): Promise<CoverResolution> {
  const rejected: RejectedCoverCandidate[] = [];
  const viable: MusicBrainzRelease[] = [];

  for (const release of releases) {
    const label = `"${release.title}" (${release.id})`;
    const identity = matchReleaseIdentity(release, wanted);
    if (!identity.ok) {
      rejected.push({
        label,
        reason: identity.detail.startsWith("artista") ? "artista-distinto" : "titulo-distinto",
        detail: identity.detail,
      });
      continue;
    }
    if (typeof release.status === "string" && !/^official$/i.test(release.status)) {
      rejected.push({
        label,
        reason: "no-es-un-lanzamiento",
        detail: `estado "${release.status}"`,
      });
      continue;
    }
    viable.push(release);
  }

  viable.sort((a, b) => {
    const diff = rankMusicBrainzRelease(b, wanted) - rankMusicBrainzRelease(a, wanted);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  for (const release of viable) {
    // La ruta canónica de CAA para la portada frontal. No se inventa un
    // endpoint: es el documentado y el que ya se midió con `curl`.
    const probeUrl = `https://coverartarchive.org/release/${release.id}/front`;
    const result = await probe(probeUrl);
    if (!result.ok) {
      rejected.push({
        label: `"${release.title}" (${release.id})`,
        reason: result.reason,
        detail: result.detail,
      });
      continue;
    }
    if (isYouTubeThumbnailUrl(result.url)) {
      rejected.push({
        label: `"${release.title}" (${release.id})`,
        reason: "es-thumbnail-de-youtube",
        detail: `${result.url}`,
      });
      continue;
    }
    return {
      wanted,
      release,
      verified: result,
      reason: "",
      rejected,
      usedQualifiedTitle: false,
    };
  }

  let reason: string;
  if (releases.length === 0) {
    reason = "MusicBrainz no devolvió ningún release para esta búsqueda";
  } else if (viable.length === 0) {
    reason = `ningún release pasó la verificación de artista + título exactos (${rejected.length} descartado(s))`;
  } else {
    reason = `los ${viable.length} release(s) con título y artista exactos no tienen portada en Cover Art Archive`;
  }

  return { wanted, release: null, verified: null, reason, rejected, usedQualifiedTitle: false };
}

/** La fila a escribir, o `null` si no hay nada que escribir. */
export function buildCoverUpdate(resolution: CoverResolution): CoverUpdate | null {
  const { wanted, verified } = resolution;
  if (!verified) return null;
  if (!shouldReplaceCover(wanted.currentCoverImage)) return null;
  if (!isImageContentType(verified.contentType)) return null;
  return { id: wanted.id, cover_image: verified.url, verified };
}

/** Igual que `buildCoverUpdate` pero en lote, filtrando lo que no cambia. */
export function selectCoverUpdates(resolutions: readonly CoverResolution[]): CoverUpdate[] {
  const updates: CoverUpdate[] = [];
  for (const resolution of resolutions) {
    const update = buildCoverUpdate(resolution);
    if (!update) continue;
    const current = (resolution.wanted.currentCoverImage ?? "").trim();
    if (current === update.cover_image) continue;
    updates.push(update);
  }
  return updates;
}
