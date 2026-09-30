/**
 * Lógica del backfill de audio por iTunes (P3, RC.31) — **pura y testeable**.
 *
 * POR QUÉ ESTE MÓDULO EXISTE Y POR QUÉ ESTÁ SEPARADO DEL SCRIPT
 *
 * El fallo que se arregla no es de CORS. El agente D1 lo midió con `curl -I`
 * mandando `Origin: https://epk-dashboard.vercel.app`:
 *
 *   audio-ssl.itunes.apple.com -> 200 OK
 *     Access-Control-Allow-Origin: *
 *     Access-Control-Allow-Headers: range
 *     Accept-Ranges: bytes
 *
 * El CDN **sí** manda ACAO. El arreglo anotado en `AI_LOG.md:1268` ("removido
 * crossOrigin para evitar CORS con CDN Apple") resolvía un problema que no
 * existía. Lo que sí falla es que las URLs de preview escritas a mano en
 * `scripts/seed-f9-catalog.ts` **caducaron**: las 6 dan 404 hoy (verificado con
 * `curl -I`). El error "Error al iniciar reproducción — archivo no disponible"
 * que sale en pantalla es **URL muerta**, no CORS.
 *
 * Y la diferencia entre 404 y 200 en este catálogo no se puede decidir leyendo
 * la URL: `scripts/seed-itunes-fresh.ts` ya reemplazó 6 de ellas por otras que
 * hoy dan 200, así que la tabla quedó con una mezcla. Por eso la verificación
 * es **una petición HTTP de verdad antes de ofrecer la URL**, y una URL que no
 * dé 200 no se escribe.
 *
 * LA DESAMBIGUACIÓN ES OBLIGATORIA, Y YA SE PAGÓ DOS VECES
 *
 * Este repo ya cometió dos veces el error de fiarse del primer resultado de
 * iTunes (retratos de artistas, `AI_LOG.md:5448-5449`). Con audio el coste es
 * peor: un preview de la grabación equivocada suena a la canción equivocada y
 * no hay forma de que nadie lo note. Casos que van a colar:
 *
 *  - Björk tiene **varias versiones de cada tema**. Las 5 hijas de *Vulnicura
 *    Strings* se llaman `"Stonemilker (Strings)"`, pero el álbum de cuerdas de
 *    iTunes titula sus pistas `"Stonemilker"` a secas: coincide **parcial**,
 *    nunca exacto. Con un `includes()` se escribiría el preview de la versión de
 *    estudio.
 *  - Kraftwerk *The Model* y *Computer Love* son lados A/B del mismo single.
 *  - *Tour de France* tiene un álbum de 2003 con el mismo nombre 20 años
 *    después; el preview sería del disco equivocado.
 *  - David Bowie *Ashes to Ashes* es single de 1980 y *Heroes* también.
 *
 * Regla: **artista Y título tienen que coincidir exactamente** tras normalizar
 * (sin diacríticos, sin puntuación, minúsculas). Si el título solo coincide
 * parcialmente, el resultado es `NO RESUELTO` y se deja la pista como está. No
 * se fuerza, y no se rellena con basura.
 *
 * EL ANCLA DE COLECCIÓN
 *
 * Con artista + título exactos todavía queda un agujero: *"Lionsong"* está en
 * *Homogenic* (1997), en *Vespertine* (2001) y en el álbum de cuerdas. Los tres
 * son "Björk — Lionsong" y los tres pasan el filtro anterior. Por eso, cuando la
 * portada del release **se resolvió por iTunes** (columna `cover_image` con
 * `mzstatic.com`), el título del release se usa como ancla y el candidato tiene
 * que salir de esa colección. Si la portada NO viene de iTunes (Unsplash,
 * YouTube) no hay ancla, y se dice, en vez de fingir que la comprobación se hizo.
 *
 * Nada aquí escribe en base de datos ni sale a la red por su cuenta: el script
 * `scripts/fetch-itunes-previews.ts` es el que lee, escribe y muestra el
 * dry-run, e inyecta el verificador. Esto es lo que ejercita
 * `tests/unit/itunes-previews.test.ts`.
 */

/** Tipo mínimo de un resultado de `searchITunes` (sin arrastrar la red al test). */
export interface AudioCandidate {
  trackId: number;
  artistName: string;
  trackName: string;
  collectionName?: string | undefined;
  previewUrl?: string | undefined;
  releaseDate?: string | undefined;
  trackTimeMillis?: number | undefined;
}

/** La fila de `tracks` que se quiere resolver, con el contexto que hace falta. */
export interface WantedTrack {
  id: string;
  title: string;
  artistName: string;
  /** `release_date` de la fila (`YYYY-MM-DD`), para desempatar reediciones. */
  releaseDate?: string | null | undefined;
  /**
   * Título de la colección iTunes que debe contener la pista, o `null` si no
   * hay ancla. Sale del release padre cuando su portada se resolvió por iTunes.
   */
  expectedCollection?: string | null | undefined;
  /** Lo que ya hay escrito, para no tocar filas que ya están bien. */
  currentPreviewUrl?: string | null | undefined;
  currentITunesTrackId?: string | null | undefined;
}

export type PreviewRejectReason =
  | "artista-distinto"
  | "titulo-parcial"
  | "titulo-distinto"
  | "coleccion-distinta"
  | "sin-preview"
  | "http-no-200"
  | "content-type-no-audio"
  | "sin-acao";

export interface RejectedCandidate {
  label: string;
  reason: PreviewRejectReason;
  detail: string;
}

/** Lo que devolvió DE VERDAD la petición HTTP a la URL. */
export interface VerifiedPreview {
  ok: true;
  url: string;
  httpStatus: number;
  contentType: string;
  /** Valor de `Access-Control-Allow-Origin`, o `null` si el CDN no lo manda. */
  accessControlAllowOrigin: string | null;
  /** `HEAD` no lo soporta y hubo que caer a un `GET` con `Range`. */
  usedRangeGet: boolean;
}

/** Por qué una URL no sirve, con el dato concreto que lo demuestra. */
export interface ProbeFailure {
  ok: false;
  reason: PreviewRejectReason;
  detail: string;
}

export type PreviewProbe = VerifiedPreview | ProbeFailure;

/**
 * Verificador inyectable. El script pasa `verifyPreviewUrl`; los tests pasan un
 * doble, de modo que el test **no depende de la red** y puede simular el 404
 * caducado sin tener que esperar a que iTunes lo sirva de verdad.
 */
export type PreviewVerifier = (url: string) => Promise<PreviewProbe>;

export interface PreviewResolution {
  wanted: WantedTrack;
  /** El candidato elegido, o `null` si nada pasó la verificación. */
  chosen: AudioCandidate | null;
  /** La prueba HTTP del candidato elegido. `null` si no hay elegido. */
  verified: VerifiedPreview | null;
  /** Por qué no se resolvió. Vacío cuando sí se resolvió. */
  reason: string;
  /** Candidatos que pasaron título+artista+colección pero no la prueba HTTP. */
  httpRejected: RejectedCandidate[];
  /** Candidatos descartados por no coincidir, o por no traer preview. */
  rejected: RejectedCandidate[];
}

/** Lo que se escribe en `tracks`. `null` cuando no hay nada que escribir. */
export interface AudioUpdate {
  id: string;
  audio_preview_url: string;
  itunes_track_id: string;
  verified: VerifiedPreview;
}

/** Normaliza para comparar: minúsculas, sin diacríticos, sin puntuación. */
export function normalizeAudioText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * El artista tiene que coincidir EXACTAMENTE.
 *
 * A diferencia de las portadas (donde `scripts/fetch-itunes-covers.ts` acepta
 * containment porque un disco mal nombrado sigue siendo el disco), aquí una
 * coincidencia parcial de artista significa preview de otro intérprete: Björk
 * aparece como "Björk &…" en colaboraciones, y esa no es la pista.
 */
export function audioArtistMatches(candidate: string, wanted: string): boolean {
  const a = normalizeAudioText(candidate);
  const b = normalizeAudioText(wanted);
  if (!a || !b) return false;
  return a === b;
}

export type TitleMatch = "exacto" | "parcial" | "distinto";

/**
 * El título tiene que coincidir exactamente. `"parcial"` existe solo para poder
 * **describir** el descarte en la salida (`"Stonemilker (Strings)"` vs
 * `"Stonemilker"`), nunca para aceptarlo.
 */
export function matchAudioTitle(candidate: string, wanted: string): TitleMatch {
  const a = normalizeAudioText(candidate);
  const b = normalizeAudioText(wanted);
  if (!a || !b) return "distinto";
  if (a === b) return "exacto";
  if (a.includes(b) || b.includes(a)) return "parcial";
  return "distinto";
}

/**
 * ¿La portada de esta fila se resolvió por iTunes?
 *
 * Es la única señal fiable que hay en la base de datos para saber si existe un
 * ancla de colección. Las tres fuentes del repo: `mzstatic.com` (iTunes/Apple),
 * `images.unsplash.com` (las fotos genéricas que P1 está sustituyendo) e
 * `img.youtube.com` / `i.ytimg.com` (thumbnails).
 */
export function hasITunesArtwork(coverImage: string | null | undefined): boolean {
  if (typeof coverImage !== "string" || coverImage.trim() === "") return false;
  return /mzstatic\.com\//i.test(coverImage.trim());
}

/**
 * ¿El candidato sale de la colección esperada?
 *
 * Prefijo, no igualdad exacta, porque las reediciones llevan adornos:
 * `"Kid A"` → `"Kid A (Deluxe Edition)"`, `"OK Computer"` →
 * `"OK Computer OKNOTOK 1997 2017"`, `"Heroes"` →
 * `"Heroes / Helden / Héros - EP"`, `"The Wall"` → `"The Wall (Remastered)"`.
 *
 * El prefijo es sobre la cadena YA normalizada y exige un separador detrás, para
 * que un disco que **empieza** con el mismo texto pero es otro no ancle.
 */
export function collectionMatches(
  candidateCollection: string | null | undefined,
  expectedCollection: string | null | undefined
): boolean {
  const c = normalizeAudioText(candidateCollection);
  const e = normalizeAudioText(expectedCollection);
  if (!e) return true; // sin ancla no se exige nada
  if (!c) return false;
  if (c === e) return true;
  return c.startsWith(`${e} `);
}

function yearOf(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

/**
 * Ordena los candidatos que YA pasaron la verificación de título+artista+colección.
 *
 * Mismo criterio que `scripts/fetch-itunes-covers.ts`, por el mismo motivo: con
 * dos reediciones del mismo tema, gana la del año del seed y no la más reciente.
 */
export function rankAudioCandidate(candidate: AudioCandidate, wanted: WantedTrack): number {
  let score = 0;
  const wantedYear = yearOf(wanted.releaseDate);
  const gotYear = yearOf(candidate.releaseDate);
  if (wantedYear != null && gotYear != null) {
    if (gotYear === wantedYear) score += 40;
    else if (Math.abs(gotYear - wantedYear) === 1) score += 15;
    else score -= 30;
  }
  // A igualdad de todo, la colección más simple es la edición original, que es
  // la que se sembró.
  score -= Math.min(normalizeAudioText(candidate.collectionName).length, 60) / 10;
  return score;
}

const OK_CONTENT_TYPES = ["audio/", "application/octet-stream"];

function isAudioContentType(contentType: string): boolean {
  return OK_CONTENT_TYPES.some((prefix) => contentType.toLowerCase().startsWith(prefix));
}

/**
 * Petición HTTP de verdad a la URL antes de ofrecerla.
 *
 * No es opcional: sin esto el script volvería a escribir las 6 URLs caducadas
 * del seed, que es exactamente el bug. Se manda `Origin` porque lo que importa
 * es si el CDN lo responde **como lo vería el navegador**, no si responde a un
 * `curl` sin origen.
 *
 * `HEAD` primero; si el CDN no lo soporta, `GET` con `Range: bytes=0-0` para no
 * bajarse los ~500 KB del preview entero.
 */
export async function verifyPreviewUrl(url: string): Promise<PreviewProbe> {
  if (typeof url !== "string" || url.trim() === "") {
    return { ok: false, reason: "sin-preview", detail: "URL vacía" };
  }
  const target = url.trim();

  const attempt = async (method: "HEAD" | "GET"): Promise<Response> => {
    return fetch(target, {
      method,
      headers: {
        Origin: "https://epk-dashboard.vercel.app",
        ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
      },
      redirect: "follow",
    });
  };

  let res: Response;
  try {
    res = await attempt("HEAD");
  } catch (error) {
    return {
      ok: false,
      reason: "http-no-200",
      detail: `la petición falló: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let usedRangeGet = false;
  // Algunos CDN responden 405/501 a HEAD. Con GET por rango el estado de éxito
  // puede ser 206 en lugar de 200, y eso también es "existe".
  if (res.status === 405 || res.status === 501) {
    try {
      res = await attempt("GET");
    } catch (error) {
      return {
        ok: false,
        reason: "http-no-200",
        detail: `la petición falló: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    usedRangeGet = true;
  }

  const httpStatus = res.status;
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const acao = res.headers.get("access-control-allow-origin");

  if (httpStatus !== 200 && !(usedRangeGet && httpStatus === 206)) {
    return { ok: false, reason: "http-no-200", detail: `HTTP ${httpStatus}` };
  }
  if (!isAudioContentType(contentType)) {
    return {
      ok: false,
      reason: "content-type-no-audio",
      detail: `content-type "${contentType || "(vacío)"}"`,
    };
  }
  // El reproductor es un `<audio crossorigin="anonymous">`: sin ACAO el
  // navegador rechaza `play()` aunque el 200 sea correcto. D1 midió `*` en el
  // CDN de Apple; si algún preview viniera sin ACAO se descarta y se reporta,
  // porque escribirlo sería dejar otra URL que no reproduce.
  if (!acao) {
    return {
      ok: false,
      reason: "sin-acao",
      detail: "el CDN no devolvió Access-Control-Allow-Origin",
    };
  }

  return {
    ok: true,
    url: target,
    httpStatus,
    contentType,
    accessControlAllowOrigin: acao,
    usedRangeGet,
  };
}

/** Texto para identificar un candidato en la salida. */
export function describeCandidate(candidate: AudioCandidate): string {
  const collection = candidate.collectionName ? ` [${candidate.collectionName}]` : "";
  return `"${candidate.trackName}" de ${candidate.artistName}${collection}`;
}

/**
 * Resuelve una pista. **Nunca escribe**: devuelve qué se escribiría y con qué
 * prueba, o por qué no se resolvió.
 *
 * Se recorren los candidatos válidos en orden y se **verifica HTTP cada uno**
 * hasta que uno pasa. Si el mejor candidato tiene el preview caducado pero el
 * segundo está vivo, se usa el segundo: la pregunta es "¿hay audio que
 * reproduzca?", no "¿el primero de la lista funcionaba?".
 */
export async function resolveAudioPreview(
  wanted: WantedTrack,
  candidates: readonly AudioCandidate[],
  verify: PreviewVerifier = verifyPreviewUrl
): Promise<PreviewResolution> {
  const rejected: RejectedCandidate[] = [];
  const viable: AudioCandidate[] = [];
  const hasAnchor = !!normalizeAudioText(wanted.expectedCollection);

  for (const candidate of candidates) {
    const label = describeCandidate(candidate);

    if (!audioArtistMatches(candidate.artistName, wanted.artistName)) {
      rejected.push({
        label,
        reason: "artista-distinto",
        detail: `artista "${candidate.artistName}" ≠ "${wanted.artistName}"`,
      });
      continue;
    }

    const title = matchAudioTitle(candidate.trackName, wanted.title);
    if (title === "parcial") {
      rejected.push({
        label,
        reason: "titulo-parcial",
        detail: `"${candidate.trackName}" solo coincide parcialmente con "${wanted.title}" (grabación distinta)`,
      });
      continue;
    }
    if (title === "distinto") {
      rejected.push({
        label,
        reason: "titulo-distinto",
        detail: `"${candidate.trackName}" ≠ "${wanted.title}"`,
      });
      continue;
    }

    if (hasAnchor && !collectionMatches(candidate.collectionName, wanted.expectedCollection)) {
      rejected.push({
        label,
        reason: "coleccion-distinta",
        detail: `está en "${candidate.collectionName || "(sin colección)"}", no en "${wanted.expectedCollection}"`,
      });
      continue;
    }

    const url = (candidate.previewUrl ?? "").trim();
    if (!url) {
      rejected.push({
        label,
        reason: "sin-preview",
        detail: "iTunes no trae previewUrl para esta pista",
      });
      continue;
    }

    viable.push(candidate);
  }

  viable.sort((a, b) => rankAudioCandidate(b, wanted) - rankAudioCandidate(a, wanted));

  const httpRejected: RejectedCandidate[] = [];

  for (const candidate of viable) {
    const url = (candidate.previewUrl ?? "").trim();
    const probe = await verify(url);
    if (!probe.ok) {
      httpRejected.push({ label: describeCandidate(candidate), reason: probe.reason, detail: probe.detail });
      continue;
    }
    return {
      wanted,
      chosen: candidate,
      verified: probe,
      reason: "",
      httpRejected,
      rejected,
    };
  }

  let reason: string;
  if (candidates.length === 0) {
    reason = "iTunes no devolvió ningún resultado para esta búsqueda";
  } else if (viable.length === 0) {
    reason = `ningún resultado pasó la verificación de artista + título${
      hasAnchor ? " + colección" : ""
    } (${rejected.length} descartado(s))`;
  } else {
    reason = `los ${viable.length} candidato(s) con título y artista exactos no pasaron la prueba HTTP`;
  }

  return { wanted, chosen: null, verified: null, reason, httpRejected, rejected };
}

/**
 * `itunes_track_id` es TEXT en el esquema (`lib/db.ts:196`) y el `trackId` de
 * iTunes es number. Se escribe como **string**, igual que las 6 que ya hay en la
 * tabla (`"158672215"`, no `158672215`): si se guardara número, `parseTrack`
 * devolvería un número donde el resto del código espera texto y el export JSON
 * mezclaría tipos.
 */
export function toITunesTrackId(candidate: AudioCandidate): string {
  return String(candidate.trackId);
}

/**
 * La fila a escribir, o `null` si no hay nada que escribir.
 *
 * Devuelve `null` — no una fila con la URL caducada — cuando no se verificó
 * nada. Es el punto donde el 404 se convierte en "no se escribe".
 */
export function buildAudioUpdate(resolution: PreviewResolution): AudioUpdate | null {
  const { wanted, chosen, verified } = resolution;
  if (!chosen || !verified) return null;
  return {
    id: wanted.id,
    audio_preview_url: verified.url,
    itunes_track_id: toITunesTrackId(chosen),
    verified,
  };
}

/**
 * Filtra un plan de escrituras: solo lo verificado y solo lo que **cambia**.
 *
 * Sin este segundo filtro, `--apply` reescribiría 77 filas idénticas y el
 * recuento de "filas aplicadas" dejaría de significar nada.
 */
export function selectPendingUpdates(resolutions: readonly PreviewResolution[]): AudioUpdate[] {
  const updates: AudioUpdate[] = [];
  for (const resolution of resolutions) {
    const update = buildAudioUpdate(resolution);
    if (!update) continue;
    const current = (resolution.wanted.currentPreviewUrl ?? "").trim();
    const currentId = (resolution.wanted.currentITunesTrackId ?? "").trim();
    if (current === update.audio_preview_url && currentId === update.itunes_track_id) continue;
    updates.push(update);
  }
  return updates;
}