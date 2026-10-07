"use client";

import { useRef, useState, useContext, useEffect } from "react";
import { safeString } from "@/lib/null-safe";
import { AudioPlayerContext, type ActiveTrack } from "@/context/AudioPlayerContext";
import {
  getAudioSources,
  hasPlayableSource,
  isUsableAudioUrl,
  resolvePlaybackTimeline,
  type AudioSourceType,
} from "@/lib/audio-priority";

interface AudioPlayerProps {
  src: string | undefined;
  title: string | null;
  id?: string;
  artist?: string;
  coverImage?: string;
  track?: {
    audio_preview_url?: string | null;
    spotify_url?: string | null;
    apple_music_url?: string | null;
    youtube_video_id?: string | null;
    external_links?: Record<string, unknown> | null;
    start_time?: number | null;
    end_time?: number | null;
  };
  /**
   * Cola completa para avance automático. Si viene, el play monta la cola y
   * arranca en **esta** pista (`queueStartIndex` solo como respaldo).
   */
  queue?: ActiveTrack[];
  queueStartIndex?: number;
}

// Debounce map: track IDs that have already been counted in this session
const countedStreams = new Set<string>();

export function AudioPlayer({ src, title, id, artist, coverImage, track, queue, queueStartIndex = 0 }: AudioPlayerProps) {
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const [localPlaying, setLocalPlaying] = useState(false);
  const globalPlayer = useContext(AudioPlayerContext);
  const { isPlaying: globalIsPlaying, isLoading: globalIsLoading, error: globalError } = globalPlayer || {};

  // Determine available audio sources from track data
  const sources = track ? getAudioSources(track) : [];
  // Orden de precedencia: preview (100) > spotify = apple music (90) > youtube (50)
  const primarySource = sources[0] ?? null;

  const resolvedId = id || src || track?.youtube_video_id || "unknown";

  // ¿Suena algo? No "¿tiene links?": una pista con solo Spotify/Apple Music
  // tiene `embedUrl` pero nadie lo renderiza, así que su play sería un botón
  // que no hace nada (que es justo el bug que se pidió eliminar).
  const canPlay = track ? hasPlayableSource(track) : isUsableAudioUrl(src);

  /**
   * `isYouTube` solo cuando NO hay preview: una pista con preview **y**
   * `youtube_video_id` reproduce el preview e ignora YouTube por completo
   * (decisión consciente: el preview es 30 s reales de audio y el vídeo
   * sonaría con imagen de fondo y capítulos). Para una release con vídeo
   * padre, quien quiera el vídeo monta la cola en modo YouTube.
   */
  const isYouTubeMode = !sources.some((s) => s.type === "preview") && sources.some((s) => s.type === "youtube");

  /**
   * Línea de tiempo de esta pista, en la capa de datos y no en el reproductor.
   *
   * `loadTrack` vuelve a calcular lo mismo (es la segunda línea de defensa), pero
   * hacerlo aquí evita que un `ActiveTrack` con capítulos de vídeo llegue a la
   * cola: la cola es lo que arrastra hacia atrás los tracks de un lanzamiento
   * entero, así que un solo item contaminado contamina la fila de "3/12".
   *
   * `mediaDuration` se deja sin pasar porque aquí todavía no se ha cargado nada:
   * para un preview da `end = 0` ("no hay ventana"), que es lo correcto.
   */
  const timeline = resolvePlaybackTimeline({
    sourceType: (isYouTubeMode ? "youtube" : "preview") as AudioSourceType,
    declaredStart: track?.start_time ?? 0,
    declaredEnd: track?.end_time ?? 0,
  });

  /**
   * Aviso de segmento (tarea 6 del usuario: "rechazar o desplazar" un segmento
   * de más de 30 s). El rechazo real ocurre en `validateChapterSegment`, que
   * devuelve `usable: false` y deja la pista sonando entera; aquí solo se
   * cuenta, para que quede escrito por qué.
   */
  const segmentWarning = timeline.warning;

  // Determine if this track is the current global track — prefer id comparison to avoid
  // YouTube-only tracks colliding on shared audioUrl "—"
  const isCurrentGlobal = globalPlayer
    ? (Boolean(id)
        ? globalPlayer.activeTrack?.id === id
        : globalPlayer.activeTrack?.audioUrl === src)
    : false;

  const isPlaying = globalPlayer ? isCurrentGlobal && globalIsPlaying : localPlaying;
  const isError = Boolean(globalPlayer && isCurrentGlobal && globalError);

  let playButton: React.ReactNode;
  if (!canPlay) {
    /**
     * Sin fuente reproducible: no se pinta un "▶" que no lleva a ningún lado.
     *
     * ## Por qué un altavoz tachado y no un círculo con una raya
     *
     * Antes era el "ban" de Heroicons: un círculo con una diagonal. A los
     * `w-4 h-4` de este botón **es indistinguible del icono de imagen rota** del
     * navegador, y el usuario lo reportó como un SVG roto en la captura del
     * reproductor sin audio. El símbolo tenía además el problema contrario:
     * dice "prohibido", cuando lo que pasa es que no hay nada que reproducir.
     *
     * Un altavoz con waves apagadas dice lo mismo y no se confunde con nada.
     * Como el texto `statusText` ya dice "No hay audio disponible", el icono
     * es decoración: por eso `aria-hidden`.
     */
    playButton = (
      <svg
        className="w-4 h-4 text-slate-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6"
        />
      </svg>
    );
  } else if (isError) {
    // P3.34: Error state
    playButton = (
      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  } else if (globalIsLoading && !isPlaying && isCurrentGlobal) {
    playButton = (
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
      </svg>
    );
  } else if (isPlaying) {
    playButton = "⏸";
  } else {
    playButton = "▶";
  }

  // Increment stream count on first play (debounced per track per session)
  const countedRef = useRef(false);
  useEffect(() => {
    if (!id || countedRef.current) return;
    if (!isPlaying) return;

    // Already counted this track in this browser session
    if (countedStreams.has(id)) {
      countedRef.current = true;
      return;
    }

    countedRef.current = true;
    countedStreams.add(id);

    fetch(`/api/tracks/${id}/streams`, { method: "POST" }).catch(() => {
      // Silently fail — stream counting is best-effort
    });
  }, [id, isPlaying]);

  const togglePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canPlay) return;

    if (globalPlayer) {
      if (isCurrentGlobal) {
        globalPlayer.togglePlay();
        return;
      }

      const audioUrl = sources.find((s) => s.type === "preview")?.url || src || "";
      const activeTrack: ActiveTrack = {
        id: resolvedId,
        title: safeString(title),
        artist: safeString(artist, "Artista EPK"),
        audioUrl,
        coverImage,
        isYouTube: isYouTubeMode,
        youtubeVideoId: track?.youtube_video_id || undefined,
        // Ventana ya saneada: `end_time` del catálogo describe capítulos de un
        // vídeo y se descarta aquí si el medio es un preview.
        startTimestamp: timeline.start,
        endTimestamp: timeline.end,
      };

      if (queue && queue.length > 0) {
        // El botón de cada fila arranca en SU pista dentro de la cola.
        const at = queue.findIndex((item) => item.id === resolvedId);
        globalPlayer.playQueue(queue, at !== -1 ? at : queueStartIndex);
        return;
      }

      globalPlayer.playTrack(activeTrack);
      return;
    }

    // Local playback logic (sin reproductor global)
    if (primarySource?.type === "preview" && isUsableAudioUrl(primarySource.url)) {
      const audio = localAudioRef.current;
      if (!audio) return;
      if (localPlaying) {
        audio.pause();
      } else {
        audio.src = primarySource.url;
        void audio.play().catch(() => {
          setLocalPlaying(false);
        });
      }
      setLocalPlaying(!localPlaying);
    }
  };

  const handleSourceEnd = () => {
    if (globalPlayer && isCurrentGlobal) {
      globalPlayer.togglePlay();
    } else {
      setLocalPlaying(false);
    }
  };

  const statusText = !canPlay
    ? "No hay audio disponible"
    : globalIsLoading && isCurrentGlobal
      ? "Cargando..."
      : isPlaying
        ? "Reproduciendo..."
        : "Reproducir";

  /**
   * Aviso de segmento, cuando los `start_time`/`end_time` del catálogo no son
   * utilizables. No es un error de reproducción: el segmento se ha descartado y
   * la pista suena entera, así que se cuenta al lado del estado en vez de
   * mezclarse con `error` (que tiene su propio "Reintentar").
   */
  return (
    <div className="flex flex-col gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
      <div className="flex items-center gap-3">
        {/* El `aria-label` se mantiene en "Reproducir"/"Pausar" a propósito: es lo
            que localizan 20 tests E2E (`audio-player-stress.spec.ts`,
            `audio-playback.spec.ts`). El estado vacío se comunica con `disabled`,
            `aria-disabled` y el texto visible, no robando el nombre accesible. */}
        <button
          onClick={togglePlay}
          disabled={!canPlay}
          aria-disabled={!canPlay}
          className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary-600"
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
        >
          {playButton}
        </button>

        <div className="flex-1 min-w-0">
          {/* Local Audio Element (solo sin reproductor global: el global es quien
              mezcla la cola) */}
          {!globalPlayer && canPlay && primarySource?.type === "preview" && (
            <audio
              ref={localAudioRef}
              src={primarySource.url}
              onEnded={handleSourceEnd}
              onError={() => setLocalPlaying(false)}
              style={{ display: "none" }}
            />
          )}

          {/* Audio Info */}
          <div className="flex-1 min-w-0">
            <p className={`text-xs truncate ${canPlay ? "text-slate-600 dark:text-slate-300" : "text-slate-400"}`}>
              {statusText}
              {canPlay && primarySource && ` • ${primarySource.label}`}
            </p>
            {segmentWarning && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {segmentWarning}
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
