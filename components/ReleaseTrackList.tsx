"use client";

import { useMemo } from "react";
import { useAudioPlayer, type ActiveTrack } from "@/context/AudioPlayerContext";
import {
  getPlayableAudioSource,
  resolvePlaybackTimeline,
  tracklistDurationLabel,
  type AudioSourceType,
} from "@/lib/audio-priority";
import { safeString } from "@/lib/null-safe";
import type { Track } from "@/types/music";

interface ReleaseTrackListProps {
  tracks: Track[];
  /**
   * Lista completa del lanzamiento para la COLA. Por defecto es `tracks`, pero
   * quien pliega la lista a 6 filas tiene que pasar la entera: la cola es de
   * audio, no de lo que cabe en pantalla.
   */
  queueTracks?: Track[];
  releaseTitle: string;
  releaseCoverImage?: string;
  releaseYoutubeVideoId?: string;
}

/**
 * P2 — la cola de un lanzamiento, en una sola fuente de verdad.
 *
 * Vive AQUÍ y no en quien la pide porque la necesitan dos consumidores del
 * mismo grupo — las filas de esta lista y el botón "Escuchar N pistas" de la
 * `EPKCard` de arriba — y dos copias de esta lógica acabarían divergiendo: la
 * tarjeta diría "4 pistas" y la lista pondría 3 en cola.
 *
 * ## Por qué esto no es un `map` con `|| ""`
 *
 * La versión anterior hacía `const audioUrl = track.audio_preview_url || ""` y
 * llamaba a `playTrack({ audioUrl: "" })` **sin guarda**. Dos fallos en una
 * línea:
 *
 * 1. `|| ""` no filtra el placeholder. `lib/db.ts` pasa la columna por
 *    `safeString`, que convierte `""` en el string **truthy** `"—"`, así que
 *    `audioUrl` llegaba al reproductor como `"—"` y `play()` fallaba con
 *    "Error al iniciar reproducción — archivo no disponible".
 * 2. `playTrack` no es una cola: una pista y ya. Pulsar la 3 de un disco
 *    sonaba 8 segundos y se acababa, sin avanzar a la 4.
 *
 * ## Precedencia de la fuente
 *
 * La misma de `AudioPlayer` (`lib/audio-priority.ts`): el preview propio de
 * la pista y, si no hay, el vídeo del **lanzamiento** — una pista de un disco
 * en vivo no trae preview propio, pero el disco sí tiene vídeo, y eso es un
 * recurso real, no un parche. Spotify y Apple Music quedan fuera a propósito:
 * no son fuentes reproducibles.
 *
 * Las pistas sin ninguna de las dos se **quedan fuera** de la cola en vez de
 * entrar mudas, para que el contador "2/8" del reproductor global diga la
 * verdad sobre lo que hay en cola.
 *
 * ## Los timestamps no viajan a la cola sin limpiar
 *
 * `track.start_time`/`track.end_time` son offsets de un **vídeo**, y el catálogo
 * los tiene poblados con duración acumulada inventada (55 de 63 pistas
 * reproducibles tienen `end_time > 30`, y ninguna de las 65 hijas tiene
 * `youtube_video_id`: apuntan a un vídeo que no existe). Meterlos tal cual
 * hacía que un preview de iTunes de 30 s viajara con `end = 501`, lo que
 * producía la etiqueta `8:21`, un scrubber con `min=265` y —al arrastrarlo— un
 * `seek()` fuera de rango que **saltaba de pista**.
 *
 * Aquí se resuelven con `resolvePlaybackTimeline`, que es también lo que usa
 * `loadTrack`: el medio decide, y si es un preview los capítulos no aplican.
 */
export function buildReleaseQueue(
  tracks: Track[],
  releaseCoverImage?: string,
  releaseYoutubeVideoId?: string
): ActiveTrack[] {
  const items: ActiveTrack[] = [];
  const fallbackVideoId =
    releaseYoutubeVideoId && releaseYoutubeVideoId.trim() !== "" ? releaseYoutubeVideoId : undefined;

  for (const track of tracks) {
    const own = getPlayableAudioSource({
      audio_preview_url: track.audio_preview_url,
      youtube_video_id: track.youtube_video_id,
    });

    const audioUrl = own?.type === "preview" ? own.url : "";
    const youtubeVideoId = own?.type === "youtube" && own.videoId ? own.videoId : fallbackVideoId;

    if (audioUrl === "" && !youtubeVideoId) continue;

    const timeline = resolvePlaybackTimeline({
      sourceType: (audioUrl === "" ? "youtube" : "preview") as AudioSourceType,
      declaredStart: track.start_time ?? 0,
      declaredEnd: track.end_time ?? 0,
    });

    items.push({
      id: track.id,
      title: safeString(track.title, "Track"),
      artist: safeString(track.artist_name, "Artista EPK"),
      audioUrl,
      coverImage: releaseCoverImage || track.cover_image,
      isYouTube: audioUrl === "",
      youtubeVideoId,
      startTimestamp: timeline.start,
      endTimestamp: timeline.end,
    });
  }
  return items;
}

export function ReleaseTrackList({
  tracks,
  queueTracks,
  releaseTitle,
  releaseCoverImage,
  releaseYoutubeVideoId,
}: ReleaseTrackListProps) {
  const globalPlayer = useAudioPlayer();
  const allTracks = queueTracks ?? tracks;

  const queue = useMemo<ActiveTrack[]>(
    () => buildReleaseQueue(allTracks, releaseCoverImage, releaseYoutubeVideoId),
    [allTracks, releaseCoverImage, releaseYoutubeVideoId]
  );

  /**
   * ¿Esta fila concreta tiene algo que sonar? (no "está en la cola": suena) */
  const isRowPlayable = (track: Track) => queue.some((item) => item.id === track.id);

  const handlePlayTrack = (track: Track) => {
    if (!globalPlayer) return;
    if (queue.length === 0) return;

    // El índice se busca por `id` y no por posición: la cola se salta las
    // pistas mudas, así que el número de fila NO es el número de la cola.
    const at = queue.findIndex((item) => item.id === track.id);
    if (at === -1) return;

    globalPlayer.playQueue(queue, at);
  };

  if (tracks.length === 0) {
    return null;
  }

  // M0: number per disc, not a flat index. Groups consecutive rows by
  // disc_number, restarts the counter on every new disc, and only shows a
  // "Disco N" header when the release actually spans more than one disc.
  // An explicit track_number wins; unnumbered tracks fall back to their
  // position within the disc so nothing renders blank.
  const discGroups: { disc: number; rows: { track: Track; number: number }[] }[] = [];
  for (const track of tracks) {
    const disc = Number.isFinite(track.disc_number) && track.disc_number ? Number(track.disc_number) : 1;
    const lastGroup = discGroups[discGroups.length - 1];
    if (!lastGroup || lastGroup.disc !== disc) {
      discGroups.push({ disc, rows: [{ track, number: 0 }] });
    } else {
      lastGroup.rows.push({ track, number: lastGroup.rows.length });
    }
  }
  const showDiscHeaders = discGroups.length > 1;

  return (
    <div className="space-y-2">
      {discGroups.map((group) => (
        <div key={`disc-${group.disc}`} className="space-y-2">
          {showDiscHeaders && (
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 pt-2">
              Disco {group.disc}
            </h4>
          )}
          {group.rows.map(({ track, number }) => {
        const isCurrentTrack = globalPlayer?.activeTrack?.id === track.id;
        const isPlaying = isCurrentTrack && globalPlayer?.isPlaying;
        const isLoading = isCurrentTrack && globalPlayer?.isLoading;
        const isError = isCurrentTrack && globalPlayer?.error;
        const playable = isRowPlayable(track);
        const trackNumber =
          track.track_number != null && Number.isFinite(track.track_number)
            ? track.track_number
            : number + 1;

        return (
          <div
            key={track.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              isCurrentTrack
                ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {/* Track number (M0: per disc) */}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-6 text-center">
              {trackNumber}
            </span>

            {/* Play button */}
            <button
              onClick={() => handlePlayTrack(track)}
              disabled={isLoading || !playable}
              title={
                playable
                  ? undefined
                  : "Esta pista no tiene audio propio y el lanzamiento no tiene vídeo: no hay nada que reproducir"
              }
              className={`p-2.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                isPlaying
                  ? "bg-primary-500 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600"
              } ${isLoading || !playable ? "opacity-50 cursor-not-allowed" : ""}`}
              /* Sin el título, "Reproducir" repetido en cada fila no dice nada: un
                 lector de pantalla anuncia once botones idénticos. Con el número
                 y el título, el usuario sabe cuál va a pulsar. */
              aria-label={
                playable
                  ? `${isPlaying ? "Pausar" : "Reproducir"} ${trackNumber}: ${track.title}`
                  : `${track.title}: sin audio disponible`
              }
            >
              {!playable ? (
                /* Sin fuente: el icono tachado, no un play que no hace nada. */
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 011.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              ) : isLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : isPlaying ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
              )}
            </button>

            {/* Track info */}
            <div className="flex-1 min-w-0">
              {/* `truncate` corta en una sola linea, asi que sin `title` el
                  nombre largo ("Todo vue…") era irrecuperable. Mismo fallo de
                  a11y que se corrigio en el h3 de EPKCard. */}
              <p
                className={`text-sm font-medium truncate ${
                  isCurrentTrack
                    ? "text-primary-700 dark:text-primary-300"
                    : "text-slate-900 dark:text-slate-100"
                }`}
                title={track.title}
              >
                {track.title}
              </p>
              <p
                className="text-xs text-slate-500 dark:text-slate-400 truncate"
                title={safeString(track.artist_name, "")}
              >
                {track.artist_name}
              </p>
            </div>

            {/* Duración de la pista (RC.32, tarea 5).
                Antes ganaba la rama de timestamps:
                  {track.start_time || track.end_time
                    ? `${formatTime(start)} — ${formatTime(end)}`
                    : track.duration ? track.duration : null}
                así que las 55 pistas con `end_time > 30` pintaban un rango de
                capítulo y la rama de `track.duration` — la duración real — era
                inalcanzable para ellas.
                `start_time` NO se borra: es el fallback de ordenación del catálogo
                (`lib/db.ts`, `ORDER BY COALESCE(track_number,999), start_time`).
                Aquí solo se desprioriza para mostrar, y si no hay duración real
                el rango se conserva como último recurso y se marca como lo que es. */}
            <div className="text-right">
              {(() => {
                const label = tracklistDurationLabel(track);
                if (!label.text) return null;
                return (
                  <span
                    className={`text-xs font-mono ${
                      label.isChapterRange
                        ? "text-slate-400 dark:text-slate-500"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                    title={label.warning || track.duration || undefined}
                  >
                    {label.text}
                  </span>
                );
              })()}
            </div>

            {/* Error indicator */}
            {isError && (
              <span className="text-xs text-red-500" title={globalPlayer?.error || ""}>
                ⚠️
              </span>
            )}
          </div>
        );
          })}
        </div>
      ))}
    </div>
  );
}
