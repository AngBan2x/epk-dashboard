"use client";

import { MutedSpeakerIcon } from "@/components/icons/MutedSpeakerIcon";
import { useRef, useState, useContext, useEffect } from "react";
import { safeString } from "@/lib/null-safe";
import { AudioPlayerContext, type ActiveTrack } from "@/context/AudioPlayerContext";
import {
  getAudioSources,
  hasPlayableSource,
  isQueueItemPlayable,
  isUsableAudioUrl,
  resolvePlayingLabel,
  resolvePlaybackTimeline,
  type AudioSourceType,
} from "@/lib/audio-priority";

/**
 * El reproductor **no** lleva botón cuando le dicen que hay pistas pero ninguna
 * suena. Son dos frases distintas y no un `else`, porque son dos problemas que
 * se arreglan en sitios distintos: `NO_AUDIO_TEXT` es el de una fila que no
 * tiene preview ni vídeo (se arregla en el formulario de release), y
 * `NO_CHILDREN_TEXT` es el de un lanzamiento cuyas hijas no tienen fuente (se
 * arregla subiendo pistas). Juntas en un texto único, el visitante no sabe
 * cuál de las dos cosas arreglar.
 *
 * Sin punto final y con mayúscula inicial a propósito: es el string literal que
 * comprueban `tests/unit/no-audio-y-enlace-al-artista.test.ts` y
 * `tests/unit/epkcard-audio-control.test.ts`, y se lee pegado al resto de la
 * tarjeta.
 */
export const NO_AUDIO_TEXT = "No hay audio disponible";
export const NO_CHILDREN_TEXT = "Ninguna de sus pistas tiene audio disponible";

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
  /**
   * Esta tarjeta es la fila **cabecera** de un lanzamiento y tiene hijas.
   *
   * Es el único dato que separa los dos casos de "no suena", que si no se
   * confunden:
   *
   * - Una pista suelta sin preview ni vídeo (`hasChildren` falso): botón
   *   apagado con altavoz y "No hay audio disponible". Botón porque el problema
   *   es **esta** fila y el control explica por qué.
   * - Un álbum cuyas hijas no tienen fuente: **ningún** botón y "Ninguna de sus
   *   pistas tiene audio disponible". Aquí un botón apagado sería ruido igual de
   *   vacío —dice "no hay audio" sobre un disco que sí tiene pistas— y además
   *   daría a entender que arreglarlo es cosa del botón.
   *
   * Es un prop y no una rama en `EPKCard` porque el markup del control (icono
   * de play, altavoz, `disabled`, `aria-disabled`, texto de estado) es uno solo:
   * duplicarlo en la tarjeta es exactamente cómo dos copias del mismo icono
   * acabaron divergiendo antes (ver el comentario de `MutedSpeakerIcon`).
   */
  hasChildren?: boolean;
}

// Debounce map: track IDs that have already been counted in this session
const countedStreams = new Set<string>();

export function AudioPlayer({ src, title, id, artist, coverImage, track, queue, queueStartIndex = 0, hasChildren = false }: AudioPlayerProps) {
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const [localPlaying, setLocalPlaying] = useState(false);
  const globalPlayer = useContext(AudioPlayerContext);
  const { isPlaying: globalIsPlaying, isLoading: globalIsLoading, error: globalError } = globalPlayer || {};

  // Determine available audio sources from track data
  const sources = track ? getAudioSources(track) : [];
  // Orden de precedencia: preview (100) > spotify = apple music (90) > youtube (50)
  const primarySource = sources[0] ?? null;

  const resolvedId = id || src || track?.youtube_video_id || "unknown";

  /**
   * Cuántas pistas de la cola suenan de verdad.
   *
   * `isQueueItemPlayable` y no `queue.length`: quien llama puede no haber
   * filtrado las hijas mudas, y decir "4 pistas" sobre una cola que solo
   * reproduce 2 es la misma mentira que un botón que no hace nada — con el
   * agravante de que al pulsar el contador "2/4" no cuadra con lo que suena.
   */
  const playableQueueCount = queue?.filter(isQueueItemPlayable).length ?? 0;
  /** ¿Lo que va a sonar es la cola (álbum) y no esta fila? */
  const playsQueue = playableQueueCount > 0;

  /**
   * ¿Suena algo? Y "algo" tiene que incluir **la cola**.
   *
   * Aquí estaba el bug que tumbó 6 tests: la pregunta se hacía solo sobre
   * `track`, y para un álbum esa es la fila **cabecera**, que por definición no
   * tiene audio propio (su `audio_preview_url` es el `"—"` truthy de
   * `lib/db.ts`). Salía `false` con una cola llena de pistas reproducibles, así
   * que la tarjeta de *OK Computer* pintaba "No hay audio disponible" sobre un
   * disco que sí suena. El reproductor ignoraba la cola al decidir si podía
   * sonar.
   *
   * El orden no es caprichoso: la cola manda cuando viene informada, y `track`/
   * `src` siguen mandando cuando no viene — que es el caso single, y el que
   * localizan los 20 specs E2E por `button[aria-label="Reproducir"]`.
   */
  const canPlay = playsQueue || (track ? hasPlayableSource(track) : isUsableAudioUrl(src));

  /**
   * Un lanzamiento sin ninguna hija reproducible: aquí **no** se pinta botón.
   * La alternativa (un botón apagado) es la que montó el commit `4592bd3`, y es
   * justo lo que prohíbe `tests/unit/epkcard-audio-control.test.ts`.
   */
  const silentQueue = hasChildren && !canPlay;

  /**
   * `pista`/`pistas` compartido por el `aria-label` y por el texto visible, para
   * que no puedan decir números distintos. El singular no es decorativo: hay un
   * test con `(?!s)` en contra, porque "1 pistas" fue lo que salió al principio.
   */
  const queueCountLabel =
    playableQueueCount === 1 ? "1 pista" : `${playableQueueCount} pistas`;

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
  //
  // La fila **cabecera** de un lanzamiento no aparece nunca en su propia cola:
  // lo que suena es una hija, con otro `id`. Comparando solo ids, la tarjeta
  // del álbum se quedaba en "Reproducir" mientras su cola sonaba, y el segundo
  // clic no pausaba: volvía a llamar a `playQueue` y **reiniciaba el disco desde
  // la pista 1**. Por eso, con cola, basta con que la pista en curso sea *una*
  // de las de la cola.
  const isQueueTrackActive =
    playsQueue && globalPlayer?.activeTrack != null
      ? queue?.some((item) => item.id === globalPlayer.activeTrack?.id) ?? false
      : false;

  const isCurrentGlobal = globalPlayer
    ? isQueueTrackActive ||
      (Boolean(id)
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
     * El icono (altavoz apagado, y **no** el "ban" de Heroicons) vive en
     * `components/icons/MutedSpeakerIcon.tsx`, con el porqué de por qué no es un
     * círculo con una raya. Vive ahí porque el mismo icono hacía falta también en
     * las filas de `ReleaseTrackList`, y dos copias del mismo icono divergen.
     */
    playButton = <MutedSpeakerIcon className="w-4 h-4 text-slate-400" />;
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
    ? silentQueue
      ? NO_CHILDREN_TEXT
      : NO_AUDIO_TEXT
    : globalIsLoading && isCurrentGlobal
      ? "Cargando..."
      : isPlaying
        ? "Reproduciendo..."
        : "Reproducir";

  /**
   * El patrón único de la casa: `{acción} • {fuente}`.
   *
   * Para un single la fuente es `resolvePlayingLabel`, que dice lo que **suena**
   * (preview o YouTube) y no lo que tiene más prioridad — una pista con Spotify
   * + YouTube se anunciaba como "Spotify" mientras sonaba el vídeo.
   *
   * Para un álbum la "fuente" son sus N pistas reproducibles, y por eso el
   * separador es el mismo: el visitante no tiene que aprender dos vocabularios
   * para el mismo botón.
   */
  const sourceSuffix = canPlay
    ? ` • ${playsQueue ? queueCountLabel : resolvePlayingLabel(track, isYouTubeMode)}`
    : "";

  /**
   * El `aria-label` cambia **solo** en el caso de la cola.
   *
   * En un single se queda en "Reproducir"/"Pausar" a propósito: es lo que
   * localizan 20 tests E2E (`audio-player-stress.spec.ts`,
   * `audio-playback.spec.ts`) con el selector exacto
   * `button[aria-label="Reproducir"]`. En un álbum el nombre corto sería
   * inútil —doce botones "Reproducir" en una rejilla— así que ahí sí dice
   * cuántas pistas y de qué lanzamiento.
   */
  const actionLabel = isPlaying ? "Pausar" : "Reproducir";
  const buttonAriaLabel = playsQueue
    ? `${actionLabel} ${queueCountLabel} de ${safeString(title, "este lanzamiento")}`
    : actionLabel;

  /**
   * Aviso de segmento, cuando los `start_time`/`end_time` del catálogo no son
   * utilizables. No es un error de reproducción: el segmento se ha descartado y
   * la pista suena entera, así que se cuenta al lado del estado en vez de
   * mezclarse con `error` (que tiene su propio "Reintentar").
   */
  return (
    <div className="flex flex-col gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
      <div className="flex items-center gap-3">
        {/*
          El botón se **omite entero** cuando el lanzamiento tiene pistas pero
          ninguna suena (`silentQueue`). Ponerlo apagado era lo que hacía el
          commit `4592bd3`: un control que no hace nada y una etiqueta que dice
          "no hay audio" sobre un disco que sí tiene pistas. El texto de abajo
          dice la verdad sola.

          En el resto de casos el botón va siempre, incluso sin fuente: ahí sí
          explica el motivo (`MutedSpeakerIcon` + "No hay audio disponible"), y
          su `aria-label` corto es lo que localizan los 20 specs E2E.
        */}
        {!silentQueue && (
          <button
            onClick={togglePlay}
            disabled={!canPlay}
            aria-disabled={!canPlay}
            className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary-600"
            aria-label={buttonAriaLabel}
          >
            {playButton}
          </button>
        )}

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
            <p
              className={`text-xs truncate ${canPlay ? "text-slate-600 dark:text-slate-300" : "text-slate-400"}`}
              data-testid="audio-player-status"
            >
              {statusText}
              {sourceSuffix}
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
