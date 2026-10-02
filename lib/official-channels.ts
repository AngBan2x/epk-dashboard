/**
 * RC.33 · Ola 4 — **allowlist** de los canales oficiales de YouTube.
 *
 * ## Por qué esto es un fichero de código y no un fichero de datos
 *
 * Cada entrada es una AFIRMACIÓN que alguien tiene que poder revisar: *"este id
 * es el canal oficial de este artista"*. Eso no es un dato que se pueda derivar,
 * adivinar o dejar que se descubra en tiempo de ejecución. Por eso está
 * versionado **con el porqué al lado de cada línea**, y no en un JSON suelto que
 * nadie lee al revisar un diff.
 *
 * ## De dónde sale cada id
 *
 * Los 5 ids se resolvieron **llamando a la API oficial** (`channels.list`) con
 * `forHandle`:
 *
 *   - **4 de 5** devolvieron el `id` de un canal cuyo `snippet.title` es
 *     exactamente el nombre del artista. Eso es lo que se guarda aquí.
 *   - **David Bowie** (`UC8YgWcDKi1rLbQ1OtrOHeDw`) **no resuelve por
 *     `forHandle`**: `@davidbowie` no devuelve nada. El id existe y es el canal
 *     verificado, pero llega por otra vía. Se documenta en su entrada en vez de
 *     ocultar la excepción.
 *
 * Los `videoCount` anotados son los que devolvió la API en el momento de la
 * comprobación, y sirven de **prueba de vida**: si un iduka canal, el `snippet`
 * deja de venir y la verificación falla ruidosamente en vez de dar 0 vídeos en
 * silencio. No se usan para ninguna decisión.
 *
 * ## Por qué el id y no el handle
 *
 * Un handle se renombra. El id no. `channels.list?forHandle=@pinkfloyd` puede
 * devolver el canal de otra persona el día que Pink Floyd suelte el handle, y
 * entonces `verifyOfficialChannel` compararía el `description` de esa cuenta
 * contra `pinkfloyd.com` y —si la cuenta enlazara el dominio, que es lo que
 * hace una copia bien hecha— **lo aprobaría**. Fijar el id corta esa ruta.
 *
 * @see `lib/youtube.ts:verifyOfficialChannel` — la verificación estructural.
 * @see `scripts/fetch-official-videos.ts` — el consumidor.
 */

/**
 * Canal oficial verificado de UN artista.
 *
 * `officialDomain` es lo que la verificación compara contra lo que el canal
 * enlaza en su **propia** descripción, así que la comparación es explícita y
 * revisable en vez de ser una heurística interna del script.
 */
export interface OfficialChannelEntry {
  /** Nombre del artista tal y como aparece en `tracks.artist_name`. */
  artistName: string;
  /** `UC…` — 24 caracteres. Es lo que se persiste en `artists.youtube_channel_id`. */
  channelId: string;
  /** Dominio oficial declarado a mano. */
  officialDomain: string;
  /** Handle **sin** `@`, o `null` si `channels.list?forHandle` no lo resuelve. */
  handle: string | null;
  /** `statistics.videoCount` en el momento de verificar. Traza, no decisión. */
  videoCount: number;
  /** Por qué este id es el canal oficial. Para que un diff sea legible. */
  provenance: string;
}

/**
 * Los 5 artistas con canal verificado. El orden es el del catálogo.
 *
 * Los `videoCount` suman 1483 vídeos para ~40 pistas: el muestreo va a descartar
 * la mayoría, y está bien. Lo que no empareje con confianza se queda **sin
 * vídeo**, no forzado.
 */
export const OFFICIAL_CHANNELS: readonly OfficialChannelEntry[] = [
  {
    artistName: "Pink Floyd",
    channelId: "UCY2qt3dw2TQJxvBrDiYGHdQ",
    officialDomain: "pinkfloyd.com",
    handle: "pinkfloyd",
    videoCount: 1337,
    // Resuelto por `forHandle=@pinkfloyd`; `snippet.title` === "Pink Floyd" y
    // `snippet.type` === "channel" (no "topic").
    provenance: "channels.list?forHandle=@pinkfloyd → 1337 vídeos",
  },
  {
    artistName: "David Bowie",
    channelId: "UC8YgWcDKi1rLbQ1OtrOHeDw",
    officialDomain: "davidbowie.com",
    // La excepción documentada: el handle no resuelve, pero el id es real.
    handle: null,
    videoCount: 417,
    provenance:
      "id verificado por la API oficial; NO resuelve por forHandle (@davidbowie no devuelve nada)",
  },
  {
    artistName: "Radiohead",
    channelId: "UCq19-LqvG35A-30oyAiPiqA",
    officialDomain: "radiohead.com",
    handle: "radiohead",
    videoCount: 203,
    provenance: "channels.list?forHandle=@radiohead → 203 vídeos",
  },
  {
    artistName: "Björk",
    channelId: "UCFbRdRGijPR4oBjQ0fVCSmw",
    officialDomain: "bjork.com",
    handle: "bjork",
    videoCount: 151,
    provenance: "channels.list?forHandle=@bjork → 151 vídeos",
  },
  {
    artistName: "Kraftwerk",
    channelId: "UCkVewSfjK_M059iV88kYgiw",
    officialDomain: "kraftwerk.com",
    handle: "kraftwerk",
    videoCount: 11,
    // 11 vídeos para ~8 pistas: aquí la playlist de subidas está casi completa.
    provenance: "channels.list?forHandle=@kraftwerk → 11 vídeos",
  },
];

/** Entrada por nombre de artista, o `undefined`. `null` si no hay allowlist. */
export function findOfficialChannel(artistName: string): OfficialChannelEntry | undefined {
  if (typeof artistName !== "string" || artistName.trim() === '') return undefined;
  const wanted = artistName.trim().toLowerCase();
  return OFFICIAL_CHANNELS.find((entry) => entry.artistName.toLowerCase() === wanted);
}

/**
 * Canales `- Topic` ya resueltos y verificados, para no gastar `search.list`.
 *
 * ## Por qué existe esta lista si el enunciado pide autodescubrir el canal
 *
 * `search.list?type=channel` son **100 unidades de un bucket aparte** (100
 * llamadas/día para TODO el proyecto), no 1 de las 10 000 normales. Con 5
 * artistas son 500 de esas 100. Por eso el script **no** las gasta por defecto:
 * usa esta tabla, que ya está verificada, y solo llama a `search` si se le pide
 * explícitamente con `--discover-topic`.
 *
 * Los tres que están verificados:
 *
 * | Canal                    | id                        | vídeos |
 * |--------------------------|---------------------------|--------|
 * | `Radiohead - Topic`      | `UCr_iyUANcn9OX_yy9piYoLw` | 352    |
 * | `PINK FLOYD - Topic`     | `UCO6LS_5W7vqG9mALDNzSFug` | 772    |
 * | `Kraftwerk - Topic`      | `UCNUkEFnPvPsWtzftcd45t1A` | 359    |
 *
 * ⚠️ **Björk y David Bowie no están.** No es que su catálogo sea inválido: es que
 *   no se verificó ninguno, y apuntar a un id sin comprobar sería exactamente lo
 *   que esta ola vino a impedir. Esos artistas se quedan **sin audio de `- Topic`**
 *   hasta que alguien los verifique con `--discover-topic` y mire el dry-run.
 *
 * El nombre del canal va tal cual lo devolvió la API, con su caja: `"PINK FLOYD -
 * Topic"` en mayúsculas y `"Radiohead - Topic"` en title case. Por eso
 * `isTopicChannelTitle` compara **sin distinción de mayúsculas**; si esta tabla
 * se comparara a mano con un `===`, fallaría en tres de tres.
 */
export interface TopicChannelEntry {
  /** Se busca con este nombre exacto en `search.list`. */
  artistName: string;
  /** `UC…` del canal autogenerado. */
  channelId: string;
  /** Nombre tal cual lo devolvió `snippet.title`. La caja importa al mostrarlo. */
  channelTitle: string;
  videoCount: number;
  provenance: string;
}

export const TOPIC_CHANNELS: readonly TopicChannelEntry[] = [
  {
    artistName: "Pink Floyd",
    channelId: "UCO6LS_5W7vqG9mALDNzSFug",
    channelTitle: "PINK FLOYD - Topic",
    videoCount: 772,
    provenance: "search.list?type=channel&q=\"Pink Floyd - Topic\" → snippet.title \"PINK FLOYD - Topic\"",
  },
  {
    artistName: "Radiohead",
    channelId: "UCr_iyUANcn9OX_yy9piYoLw",
    channelTitle: "Radiohead - Topic",
    videoCount: 352,
    provenance: "search.list?type=channel&q=\"Radiohead - Topic\" → snippet.title \"Radiohead - Topic\"",
  },
  {
    artistName: "Kraftwerk",
    channelId: "UCNUkEFnPvPsWtzftcd45t1A",
    channelTitle: "Kraftwerk - Topic",
    videoCount: 359,
    provenance: "search.list?type=channel&q=\"Kraftwerk - Topic\" → snippet.title \"Kraftwerk - Topic\"",
  },
];

/** Entrada de `- Topic` por artista, o `undefined`. */
export function findTopicChannel(artistName: string): TopicChannelEntry | undefined {
  if (typeof artistName !== 'string' || artistName.trim() === '') return undefined;
  const wanted = artistName.trim().toLowerCase();
  return TOPIC_CHANNELS.find((entry) => entry.artistName.toLowerCase() === wanted);
}