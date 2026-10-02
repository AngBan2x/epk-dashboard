"use client";

import Image from "next/image";
import { useMemo } from "react";
import { AudioPlayer } from "@/components/AudioPlayer";
import { buildReleaseQueue } from "@/components/ReleaseTrackList";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { getCoverImage, safeString } from "@/lib/null-safe";
import { NO_VALUE, releaseRowDurationLabel } from "@/lib/release-page";
import type { Track } from "@/types/music";

interface ReleaseTracklistSectionProps {
  release: Track;
  /** Hijas del lanzamiento. Vacío = single suelto. */
  tracks: Track[];
  /**
   * Duración total YA resuelta por `lib/release-page.ts`.
   *
   * Se pasa en vez de calcularse aquí a propósito: ese módulo es puro y este
   * componente es de cliente, y el módulo de datos (`lib/releases.ts`) arrastra
   * `better-sqlite3`, que no puede acabar en el bundle del navegador. Una sola
   * fuente, calculada en servidor.
   */
  durationLabel?: string;
}

/**
 * ## El ÚNICO sitio de play de un lanzamiento
 *
 * Antes eran dos componentes distintos para dosShapes: `ReleaseTrackList` (las
 * filas con botón, en la página del release) y `AudioPlayer` (el reproductor
 * grande, en la página de la pista). Y solo aparecía el primero cuando había
 * hijas, así que un single suelto —6 de las 18 cabeceras del catálogo— no tenía
 * **ningún** control de reproducción en su propia página.
 *
 * Ahora hay un componente y las dos ramas:
 *
 * - **Con hijas**: la lista. Cada fila es un botón de play y la cola es el
 *   tracklist entero (`buildReleaseQueue`), que es lo que ya hacía
 *   `ReleaseTrackList`.
 * - **Sin hijas**: el reproductor grande de la propia pista, con la cola de una
 *   sola canción. El MISMO `AudioPlayer` que usa la ficha de pista, con la
 *   misma precedencia de fuentes (`lib/audio-priority.ts`), para que un single
 *   suene igual aquí y allí.
 *
 * No hay un tercer camino, y en particular **no** hay un enlace "ver la pista":
 * la página del release es la página, y decir "haz clic aquí para oírla" cuando
 * ya estás en ella es una frase que solo puede salir mal.
 */
export function ReleaseTracklistSection({
  release,
  tracks,
  durationLabel,
}: ReleaseTracklistSectionProps) {
  const globalPlayer = useAudioPlayer();
  const isMultiTrack = tracks.length > 0;

  /**
   * La cola. Con hijas es el tracklist; sin hijas es la pista del propio
   * release, y `buildReleaseQueue` es el mismo filtro de "esta fila tiene algo
   * que sonar" — una fuente muda no entra en la cola en vez de entrar y fallar
   * al pulsar (ver el contrato de `ReleaseTrackList`).
   */
  const queue = useMemo(
    () =>
      buildReleaseQueue(
        isMultiTrack ? tracks : [release],
        release.cover_image,
        release.youtube_video_id || undefined
      ),
    [isMultiTrack, tracks, release]
  );

  const playable = queue.length > 0;
  const activeTrack = globalPlayer?.activeTrack;
  const isThisPlaying =
    playable && activeTrack?.id === release.id && globalPlayer?.isPlaying === true;

  const ordered = useMemo(
    () =>
      [...tracks].sort(
        (a, b) =>
          (a.disc_number ?? 1) - (b.disc_number ?? 1) ||
          (a.track_number ?? 999) - (b.track_number ?? 999) ||
          (a.start_time ?? 0) - (b.start_time ?? 0)
      ),
    [tracks]
  );
  const discs = [...new Set(ordered.map((t) => t.disc_number ?? 1))].sort((a, b) => a - b);

  const totalLabel = durationLabel ?? NO_VALUE;
  const summary = isMultiTrack
    ? `${tracks.length} ${tracks.length === 1 ? "pista" : "pistas"}`
    : "1 pista";

  return (
    <section
      aria-labelledby="release-play-heading"
      data-testid="release-play-section"
      className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700/60">
        <h2
          id="release-play-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-900 dark:text-white"
        >
          {isMultiTrack ? "Pistas del lanzamiento" : "Escuchar"}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {summary}
          {discs.length > 1 ? ` · ${discs.length} discos` : ""}
          {totalLabel !== NO_VALUE ? ` · ${totalLabel} en total` : ""}
        </p>
      </div>

      {isMultiTrack ? (
        <ol className="p-4 sm:p-5">
          {discs.map((disc) => (
            <li key={disc}>
              {discs.length > 1 ? (
                <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500 first:mt-0 dark:text-slate-400">
                  Disco {disc}
                </p>
              ) : null}
              <ul className="space-y-1.5">
                {ordered
                  .filter((track) => (track.disc_number ?? 1) === disc)
                  .map((track, index) => {
                    const at = queue.findIndex((item) => item.id === track.id);
                    const rowPlayable = at !== -1;
                    const isCurrent = globalPlayer?.activeTrack?.id === track.id;
                    const number =
                      track.track_number != null && Number.isFinite(track.track_number)
                        ? track.track_number
                        : index + 1;
                    return (
                      <li key={track.id}>
                        <TrackRow
                          track={track}
                          number={number}
                          fallbackCover={release.cover_image}
                          durationText={releaseRowDurationLabel(track)}
                          playable={rowPlayable}
                          isPlaying={isCurrent && globalPlayer?.isPlaying === true}
                          isLoading={isCurrent && globalPlayer?.isLoading === true}
                          onPlay={
                            rowPlayable
                              ? () => globalPlayer?.playQueue(queue, at)
                              : undefined
                          }
                        />
                      </li>
                    );
                  })}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <div className="p-4 sm:p-5">
          <SingleReleaseRow
            release={release}
            onPlay={
              playable
                ? () => globalPlayer?.playQueue(queue, 0)
                : undefined
            }
            isPlaying={isThisPlaying}
            isLoading={
              playable && activeTrack?.id === release.id && globalPlayer?.isLoading === true
            }
            durationText={releaseRowDurationLabel(release)}
          />

          {/*
            El reproductor grande. Se monta también cuando la pista no es
            reproducible: `AudioPlayer` ya sabe decir "no hay audio disponible"
            con su explicación, y ese mensaje es información, no ruido — es
            exactamente lo que un periodista necesita saber antes de prometer
            una entrevista con ese tema.
          */}
          <div className="mt-4" data-testid="release-audio-player">
            <AudioPlayer
              src={queue[0]?.isYouTube ? undefined : queue[0]?.audioUrl}
              title={release.title}
              id={release.id}
              artist={release.artist_name}
              coverImage={getCoverImage(release) || undefined}
              queue={queue}
              queueStartIndex={0}
              track={{
                audio_preview_url: release.audio_preview_url,
                spotify_url: release.spotify_url,
                apple_music_url: release.external_links?.apple_music ?? null,
                youtube_video_id: release.youtube_video_id,
                external_links: release.external_links ?? undefined,
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

interface TrackRowProps {
  track: Track;
  number: number;
  /** Portada del lanzamiento, para las hijas que no traen la suya. */
  fallbackCover: string | null | undefined;
  durationText: string;
  playable: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  onPlay: (() => void) | undefined;
}

/**
 * ## Una fila de pista, y por qué se dibuja aquí y no se delega
 *
 * `components/ReleaseTrackList.tsx` ya hacía las filas, pero es una lista de
 * texto: número, título, artista, botón. Para la página de un lanzamiento
 * faltan las tres cosas que la hacen legible de un vistazo —miniatura,
 * portada por pista, y un botón que se pueda distinguir con el dedo— y ese
 * fichero no es de esta subfase.
 *
 * Lo que **no** se reimplementa es la cola: `buildReleaseQueue` se importa, no
 * se copia. Esa función es la que decide qué filas entran en la cola, con qué
 * fuente y con qué línea de tiempo, y su comentario explica por qué no puede
 * haber dos copias (el contador "2/8" del reproductor global dejaría de decir la
 * verdad). El markup es de aquí; el criterio es de allí.
 *
 * ## Lo que se cuida aquí
 *
 * - **Botón ≥ 36 px.** `p-2` con un icono de 16 px se queda en 32, por debajo
 *   del mínimo táctil. Con `p-2.5` y `h-11 w-11` se llega a 44.
 * - **Anillo de foco visible** en el botón (`focus-visible:ring-2`), que es lo
 *   que revisa `scripts/a11y-check.ts` en la primera pantalla con botones.
 * - **Etiqueta con el título**, no un "Reproducir" repetido quince veces: un
 *   lector de pantalla que recorre la lista tiene que oír de qué pista se
 *   trata.
 * - **Miniatura decorativa** (`alt=""`): la portada del disco ya está-described
 *   arriba con su `alt`, y repetirla quince veces es ruido. Si no hay miniatura
 *   se cae a la del lanzamiento y, si tampoco, al número — la fila nunca deja un
 *   hueco vacío.
 */
function TrackRow({
  track,
  number,
  fallbackCover,
  durationText,
  playable,
  isPlaying,
  isLoading,
  onPlay,
}: TrackRowProps) {
  const cover = getCoverImage(track) ?? (fallbackCover || null);
  const title = safeString(track.title);
  const disabled = !onPlay || isLoading;
  const playLabel = playable
    ? `${isPlaying ? "Pausar" : "Reproducir"} ${number}: ${title}`
    : `${title} no tiene audio disponible`;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-2 transition-colors ${
        isPlaying
          ? "border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20"
          : "border-slate-200 bg-slate-50 hover:border-primary-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900"
      }`}
    >
      <span className="w-5 shrink-0 text-center text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400">
        {number}
      </span>

      {cover ? (
        <Image
          src={cover}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="h-10 w-10 shrink-0 rounded-md object-cover"
        />
      ) : null}

      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        aria-label={playLabel}
        title={
          playable
            ? undefined
            : "Esta pista no tiene preview propio y el lanzamiento no tiene vídeo: no hay nada que reproducir"
        }
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 ${
          isPlaying
            ? "bg-primary-500 text-white"
            : "bg-white text-slate-600 hover:bg-primary-100 hover:text-primary-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-primary-900/40"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {isLoading ? (
          <svg
            className="h-4 w-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : isPlaying ? (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
          </svg>
        ) : playable ? (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
          </svg>
        ) : (
          /* Sin fuente: el icono tachado, no un play que no hace nada. */
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728a9 9 0 01-12.728 12.728m12.728-12.728L5.636 5.636"
            />
          </svg>
        )}
      </button>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-medium ${
            isPlaying
              ? "text-primary-700 dark:text-primary-300"
              : "text-slate-900 dark:text-slate-100"
          }`}
          title={title}
        >
          {title}
        </span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
          {safeString(track.artist_name)}
        </span>
      </span>

      {durationText ? (
        <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {durationText}
        </span>
      ) : null}
    </div>
  );
}

interface SingleReleaseRowProps {
  release: Track;
  onPlay: (() => void) | undefined;
  isPlaying: boolean;
  isLoading: boolean;
  durationText: string;
}

/**
 * La fila del single. Existe por dos razones concretas, no por adorno:
 *
 * 1. **Portada.** Un solo tema sin imagen es una página con un rectángulo
 *    vacío arriba. Con `getCoverImage` (portada propia, y si no la miniatura
 *    del vídeo) la ficha tiene una cara. `CoverImage` no se usa aquí porque es
 *    otro `"use client"` con su propio estado de error; el `alt` y el `width`/
 *    `height` explícitos son los mismos.
 * 2. **Simetría.** La lista de un álbum y la de un single se leen igual: mismo
 *    sitio, misma columna de duración alineada a la derecha, mismo ancho de
 *    números. Un lector que salta de un tipo de lanzamiento a otro no tiene que
 *    volver a aprender la página.
 */
function SingleReleaseRow({
  release,
  onPlay,
  isPlaying,
  isLoading,
  durationText,
}: SingleReleaseRowProps) {
  const cover = getCoverImage(release);
  const title = safeString(release.title);
  const disabled = !onPlay || isLoading;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <span className="w-6 shrink-0 text-center text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400">
        1
      </span>

      {cover ? (
        <Image
          src={cover}
          alt=""
          width={48}
          height={48}
          unoptimized
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary-100 to-primary-50 text-lg font-bold text-primary-700 dark:from-primary-950 dark:to-slate-800 dark:text-primary-300"
        >
          {title.trim().charAt(0).toUpperCase()}
        </span>
      )}

      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        aria-label={
          onPlay
            ? `${isPlaying ? "Pausar" : "Reproducir"} ${title}`
            : `${title} no tiene audio disponible`
        }
        title={
          onPlay
            ? undefined
            : "Esta pista no tiene preview ni vídeo: no hay nada que reproducir"
        }
        className={`shrink-0 rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 ${
          isPlaying
            ? "bg-primary-500 text-white"
            : "bg-white text-slate-600 hover:bg-primary-100 hover:text-primary-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-primary-900/40"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {isLoading ? (
          <svg
            className="h-4 w-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : isPlaying ? (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
          </svg>
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
          </svg>
        )}
      </button>

      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100"
          title={title}
        >
          {title}
        </span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
          {safeString(release.artist_name)}
        </span>
      </span>

      {durationText ? (
        <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {durationText}
        </span>
      ) : null}
    </div>
  );
}