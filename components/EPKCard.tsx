"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import type { Track } from "@/types/music";
import {
  safeString,
  formatDuration,
  formatNumber,
  formatDateES,
  diffDaysUTC,
  getCoverImage,
} from "@/lib/null-safe";
import { releaseTypeLabel } from "@/lib/release-page";
import { imageOptimizationProps } from "@/lib/image-config";
import { AudioPlayer } from "@/components/AudioPlayer"; import { buildReleaseQueue } from "@/components/ReleaseTrackList";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAudioPlayer, type ActiveTrack } from "@/context/AudioPlayerContext";
import { isQueueItemPlayable } from "@/lib/audio-priority";
import { sumDurations } from "@/lib/null-safe";
import type { YouTubeStatPair } from "@/lib/youtube";
import {
  metricsTooltip,
  resolveAlbumMetrics,
  resolveMetrics,
  type MetricsCandidates,
} from "@/lib/metrics-source";

interface EPKCardProps {
  track: Track;
  initialLiked?: boolean;
  initialLikeCount?: number;
  onLoginPrompt?: () => void;
  priority?: boolean;
  /**
   * Fase E: el lote de YouTube lo resuelve quien monta la rejilla (una sola
   * llamada para N tarjetas) y lo pasa por prop. Antes la tarjeta pedía sus
   * propias stats en un `useEffect`, o sea N llamadas upstream por visitante.
   */
  youtubeStats?: YouTubeStatPair | null;
  /**
   * Enlace a la ficha: `/track/{id}` para un single suelto, `/releases/{id}`
   * para un álbum. Sin esto la tarjeta es puramente visual y la ficha queda
   * inalcanzable desde la página del artista.
   *
   * P8: con este prop la PORTADA pasa a ser la superficie clicable de la
   * tarjeta (enlace propio, hermano del botón de like), no la tarjeta entera.
   */
  detailHref?: string;
  /**
   * Hijas aprobadas cuando `track` es la fila padre de un lanzamiento.
   *
   * Dos usos, ambos de P2/P15:
   * - La duración del padre **se calcula** sumando las hijas. El seed deja
   *   `"00:00"` en la fila padre (no tiene audio propio), así que mostrar la
   *   columna tal cual pintaba "Album 00:00" como si fuera un tramo. Aunque el
   *   agente B lo corrigió en Turso, el cálculo tiene que seguir aquí o vuelve
   *   a pasar en cuanto se re-siembra.
   * - La cola de reproducción. `queue` es la lista completa en formato
   *   `ActiveTrack`; la monta quien tiene las hijas (`ArtistTracksSection`) y
   *   la tarjeta solo la reenvía a `playQueue`. **El estado de la cola vive en
   *   el contexto**, nunca en la tarjeta.
   */
  childrenTracks?: Track[];
  /** Cola completa del lanzamiento, ya en formato `ActiveTrack`. */
  queue?: ActiveTrack[];
  /**
   * RC.33 · Ola 3 — scrobbles de Last.fm de **esta** fila.
   *
   * Es `null` cuando Last.fm no respondió (sin clave, `not_found`, cuota,
   * timeout) y un número cuando respondió, incluido `0`. Ese es el contrato de
   * `resolveMetrics`, y por eso el tipo no es `number`: mandar `0` cuando la
   * integración falló es exactamente el bug que se arregla aquí.
   *
   * ⚠️ **Límite conocido, reportado a propósito.** Esta tarjeta solo recibe el
   *   playcount de la fila que representa. Las hijas de un álbum llegan sin
   *   Last.fm, así que un álbum del que solo se conoce el Last.fm de las pistas
   *   se enseña como "—". El fetch por Daughter está en quien monta la rejilla
   *   (`ArtistTracksSection`), fuera del ownership de esta ola; cuando exista,
   *   esta tarjeta y `resolveAlbumMetrics` ya lo agregan sin tocar nada más.
   */
  lastfmPlaycount?: number | null;
  /**
   * Playcounts de Last.fm indexados por `track.id` de las **hijas** de un
   * álbum. Sin esto, un álbum del que solo conocemos el scrobble de sus pistas
   * se enseña como `"—"`: el padre no tiene dato curado ni de YouTube, y la
   * agregación nunca llega a la fuente que sí tiene datos.
   *
   * Por `id` y no por título: es lo que ya construye quien monta la rejilla, y
   * así no hay que renormalizar el título otra vez aquí.
   */
  lastfmByTrack?: Record<string, number | null>;
}

export function EPKCard({
  track,
  initialLiked = false,
  initialLikeCount = 0,
  onLoginPrompt,
  priority = false,
  youtubeStats = null,
  detailHref,
  childrenTracks,
  queue,
  lastfmPlaycount = null,
  lastfmByTrack = {},
}: EPKCardProps) {
  const { user } = useAuth();
  const audio = useAudioPlayer();
  const title = safeString(track.title);
  const artistName = safeString(track.artist_name);
  /**
   * P15: el padre no tiene duración propia. Si trae hijas, la suma de sus
   * duraciones es el dato real; el `formatDuration` de la columna es solo el
   * respaldo para un single suelto. `sumDurations` devuelve `null` cuando nada
   * es parseable, y `null` NO es `0`: un álbum recién creado sin duraciones no
   * debe pintar "0:00" como si fuera real.
   */
  const totalFromChildren = childrenTracks ? sumDurations(childrenTracks.map((t) => t.duration)) : null;
  const duration = totalFromChildren ? totalFromChildren.label : formatDuration(track.duration);
  const releaseDate = track.release_date ? formatDateES(track.release_date) : "—";
  const isrc = safeString(track.isrc);
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [coverBroken, setCoverBroken] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [loading, setLoading] = useState(false);
  const ytLikes = youtubeStats?.likeCount ?? 0;
  const ytViews = youtubeStats?.viewCount ?? null;
  /**
   * RC.33 · Ola 3 — el pie ya no suma fuentes ni inventa ceros.
   *
   * Antes: `formatNumber((track.metrics?.streams ?? 0) + ytViews)`. Eso hacía
   * tres cosas malas a la vez: convertía "sin dato" en 0, mezclaba streams
   * curados con vistas de YouTube (que no son la misma unidad), y cuando el
   * track no tenía vídeo devolvía un 0 que la tarjeta pintaba con tipografía de
   * medición real.
   *
   * Ahora decide `lib/metrics-source.ts`: una sola fuente, y `null` —no `0`—
   * cuando ninguna habló. Un álbum se agrega **dentro de una sola fuente**: por
   * eso las hijas aportan su JSON curado y su Last.fm, y nunca una suma mezclada.
   *
   * `lastfmByTrack` viene indexado por `track.id` (no por título) porque es lo
   * que ya construye quien monta la rejilla, y así no hay que renormalizar el
   * título otra vez aquí. `?? null` y no `?? 0`: mandar 0 cuando la integración
   * falló es exactamente el bug que esta tarjeta arregla.
   */
  const ownMetricsCandidates: MetricsCandidates = {
    curated: track.metrics,
    youtubeViewCount: ytViews,
    lastfmPlaycount,
  };
  const metrics = childrenTracks?.length
    ? resolveAlbumMetrics(
        ownMetricsCandidates,
        childrenTracks.map(
          (child): MetricsCandidates => ({
            curated: child.metrics,
            lastfmPlaycount: lastfmByTrack[child.id] ?? null,
          })
        )
      )
    : resolveMetrics(ownMetricsCandidates);
  const streams = metrics.value === null ? "—" : formatNumber(metrics.value);
  /**
   * `saves` solo existe en el JSON curado: ni YouTube ni Last.fm lo dan, así que
   * no tiene cadena de fallback y se resuelve con la misma regla de ausencia.
   * Se deja el `—` en vez de `?? 0` por el mismo motivo que en las streams.
   */
  const saves = track.metrics ? formatNumber(track.metrics.saves) : "—";

  // El track declara un video de YouTube pero el lote no trajo sus stats:
  // no inventamos el dato, lo decimos.
  const youtubeMissing = !!track.youtube_video_id && !youtubeStats;
  const statsTooltip = metricsTooltip(
    metrics,
    youtubeMissing ? "No se pudieron obtener las métricas de YouTube para este video" : null
  );
  const savesTooltip = track.metrics
    ? "Guardados registrados en el catálogo de PressPlay"
    : "Sin dato: el catálogo no tiene guardados para esta pista";

  // Badge "Nuevo Lanzamiento" — track released in the last 7 days (UTC days, TZ-safe)
  const isNewRelease = (() => {
    if (!track.release_date) return false;
    const d = new Date(track.release_date);
    if (isNaN(d.getTime())) return false;
    const diffDays = diffDaysUTC(d, new Date());
    return diffDays >= 0 && diffDays <= 7;
  })();

  /**
   * P2: fila padre de un lanzamiento (álbum/EP) = NO reproducible por sí misma.
   *
   * Antes se montaba `<AudioPlayer>` con los datos del padre, que no tiene
   * audio propio: `lib/db.ts` convierte el `audio_preview_url` vacío en el
   * string **truthy** `"—"`, así que un `if (url)` no lo filtra y el botón
   * quedaba activo sin hacer nada. Peor aún cuando el padre sí trae
   * `youtube_video_id`: `hasPlayableSource` devuelve `true` (YouTube sí es
   * fuente reproducible) y el botón "sonaba" un vídeo que no es la pista.
   *
   * Aquí la fila padre no se reproduce: se reproduce **la cola** de sus hijas,
   * que es lo que el usuario pidió (cola completa con avance automático). El
   * botón de la tarjeta queda deshabilitado y su etiqueta dice la verdad.
   */
  const isReleaseParent = Array.isArray(childrenTracks) && childrenTracks.length > 0;
  /**
   * `isQueueItemPlayable` (no `hasPlayableSource`) porque lo que hay que
   * contar son los ítems de la COLA, y esa es exactamente la misma predicate
   * que usa `createQueue` para elegir por dónde empezar. Preguntar por otra
   * cosa ("¿esta fila suena?") daría un número distinto al que el reproductor
   * va a poder seguir, y volvería a aparecer un "3 pistas" que al pulsar se
   * salta a otra.
   */
  const playableRows = queue?.filter(isQueueItemPlayable) ?? [];
  const hasQueue = isReleaseParent && playableRows.length > 0;

  useEffect(() => {
    // Fetch initial like count and user's liked state
    const fetchLikes = async () => {
      try {
        const params = new URLSearchParams({ track_id: track.id });
        const res = await fetch(`/api/likes?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.count !== undefined) setLikeCount(data.count);
          if (data.liked !== undefined) setLiked(data.liked);
        }
      } catch {
        // Silently fail, use initial values
      }
    };
    fetchLikes();
  }, [track.id]);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Show login prompt for guests
    if (!user) {
      onLoginPrompt?.();
      return;
    }

    if (loading) return;
    setLoading(true);
    setAnimating(true);

    try {
      const response = await fetch("/api/likes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ track_id: track.id }),
      });

      if (response.ok) {
        const data = await response.json();
        setLiked(data.liked);
        setLikeCount(data.count);
      }
    } catch (error) {
      console.error("Like error:", error);
    } finally {
      setLoading(false);
      setTimeout(() => setAnimating(false), 300);
    }
  };

  const coverImage = getCoverImage(track);
  // La portada es la superficie clicable de la tarjeta, pero SOLO si hay ficha
  // a la que ir. Sin `detailHref` sigue siendo una imagen y no un enlace falso.
  const coverLink = detailHref ? (
    <Link
      href={detailHref}
      tabIndex={-1}
      aria-hidden="true"
      className="absolute inset-0 z-0 block rounded-none focus:outline-none"
    />
  ) : null;

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
      <div className="aspect-square bg-slate-100 dark:bg-slate-700 relative overflow-hidden flex-shrink-0">
        {/*
          P8: la portada es la superficie clicable de la tarjeta, y es un
          `<a>` PROPIO — hermano del botón de like, nunca su contenedor.

          Envolver la tarjeta (o la portada) en un `<a>` es HTML inválido
          cuando dentro hay un `<button>`: axe lo marca como
          `nested-interactive` (WCAG 2A) y, más grave, el tabulador cae en un
          enlace que contiene otro control y el lector de pantalla anuncia un
          enlace gigante con un botón dentro. Por eso el enlace va como
          hermano absoluto detrás (`z-0`) y el like por encima (`z-10`): el
          clic en el like lo recibe el botón, el resto de la portada lo
          recibe el enlace, y no hay un interactivo dentro de otro.

          `tabIndex={-1}` + `aria-hidden` a propósito: la ficha ya se alcanza
          con el enlace del título, que sí es tabulable y tiene nombre. Dos
          enlaces con el mismo destino por tarjeta duplicarían la navegación
          por teclado; el de la portada es solo la superficie de clic y la
          superficie táctil de un alvo grande.
        */}
        {coverLink}
        {coverImage && !coverBroken ? (
          <Image
            src={coverImage}
            alt={`Portada de ${title}`}
            width={400}
            height={400}
            {...imageOptimizationProps(coverImage)}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            onError={() => setCoverBroken(true)}
            priority={priority}
          />
        ) : (
          /* `pointer-events-none`: el placeholder es un `absolute inset-0`, y
             como los elementos posicionados se pintan sobre el enlace de la
             portada, sin esto se comía todos los clics y la portada dejaba de
             ser clicable justo cuando no hay imagen. */
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-400 text-3xl">
            🎵
          </div>
        )}
        {/* Like button overlay */}
        <button
          onClick={handleLike}
          disabled={loading}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label={liked ? "Quitar like" : "Dar like"}
          aria-pressed={liked}
        >
          <span
            className={`inline-block transition-all duration-300 ${
              animating ? "animate-heartbeat" : ""
            } ${liked ? "text-red-500" : "text-slate-400 dark:text-slate-500 hover:text-red-500"}`}
            style={{ fontSize: "1.5rem", lineHeight: 1 }}
          >
            {liked ? "❤️" : "🤍"}
          </span>
        </button>
        {/*
          Badge "Nuevo", y el único que queda sobre la portada. El de
          "Multipista" se fue en RC.33 (ver `hasQueue`): repetía en texto lo que
          el botón de cola ya dice —"Reproducir • 12 pistas"—, no tenía etiqueta
          accesible, y la condición que lo traía (`isReleaseParent ||
          track.release_id`) metía en la misma etiqueta cosas distintas, que es
          un lanzamiento con hijas y una fila hija suelta.

          Se simplificó el contenedor: al quedar un solo badge no hace falta la
          columna ni el `max-w-[70%]`, así que el `<span>` positioning se hace
          directamente. `pointer-events-none` porque es decorativo y, al ser una
          caja posicionada, taparía el enlace de la portada; el único control
          sobre la portada es el botón de like (`z-10`).
        */}
        {isNewRelease && (
          <span className="pointer-events-none absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg animate-pulse">
            ✨ Nuevo
          </span>
        )}
      </div>
      <CardContent className="flex flex-col flex-grow p-4">
        {/*
          P11 — el título es el texto que se trunca, y con 4 columnas la
          tarjeta mide 294px (`max-w-7xl` 1280 − px-4 − 3 huecos de 24px).
          A 294px un `truncate` de una línea deja el título en ~17-31px, es
          decir ilegible: por eso el commit `bfdda30` bajó de 4 a 3 columnas.
          El problema nunca fue el ancho, fue que el título solo tenía UNA
          línea parapia.

          Ahora hay DOS (`line-clamp-2`) + `break-words` para que una palabra
          larga no desborde la celda. `line-clamp` es de Tailwind 3.3+ (aquí
          3.4), no hace falta `@tailwindcss/line-clamp` a mano.

          `title` en el `<h3>` (y no solo en el enlace interior) porque es el
          `<h3>` el elemento que recorta: sin él, ni hover ni lector de
          pantalla recuperan el nombre completo. Lo miden dos guiones
          (`scripts/rc29-artist-shots.ts:275` con `h3[title]`,
          `scripts/verify-wave3.cjs` sobre `a[href^="/track/"] h3`).

          P8: `detailHref` convierte el título en enlace a la ficha. Se sigue
          sin envolver la tarjeta en un `<a>` porque dentro hay botones
          (play, like) y eso es HTML inválido; la portada ya aporta su
          superficie de clic aparte (ver el `coverLink` de arriba).
        */}
        <h3
          className="font-semibold text-base sm:text-lg mb-1 line-clamp-2 break-words leading-snug text-slate-900 dark:text-white"
          title={title}
        >
          {detailHref ? (
            <Link
              href={detailHref}
              className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            >
              {title}
            </Link>
          ) : (
            <span>{title}</span>
          )}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-1 truncate">{artistName}</p>

        {/* Metadata: Release type, Duration, Release Date, ISRC */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-white">
            {/*
              El tipo sale del MISMO helper que el badge de la ficha de
              release, y por el motivo mismo: `Tour de France` (Kraftwerk) tiene
              `release_type = 'Single'` y 2 hijas, asi que aqui ponia "Single"
              sobre una tarjeta que decia "2 pistas", y en la ficha, a dos
              clics, la misma fila decia "EP".

              Dos etiquetas distintas para la misma fila es el mismo bug que
              reporto el usuario, repartido en dos paginas. El helper vive en
              `lib/release-page.ts`.
            */}
            {releaseTypeLabel(track.release_type, (childrenTracks?.length ?? 0) > 0)}          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {duration}
          </span>
          {track.release_date && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {releaseDate}
              </span>
            </>
          )}
          {track.isrc && track.isrc !== "—" && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-mono">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                ISRC: {isrc}
              </span>
            </>
          )}
        </div>

        {/*
          P2 / RC.33 — fila padre de un lanzamiento: **un solo control**, y es
          el que funciona.

          Antes este bloque pintaba DOS controles contradictorios: un botón
          `disabled` con un círculo tachado y el texto "Este lanzamiento no
          tiene audio propio", y justo debajo un botón que sí reproducía las
          12 pistas. Era ruido autoinfligido —decía "no hay audio" sobre una
          tarjeta que sí lo tenía, y lo decía con el control más inutilizable
          que existe, el tachado— y además era mentira: el lanzamiento sí
          suena, desde sus hijas.

          Ahora:
          - Si hay cola reproducible, el control es un play circular real, con
            el mismo lenguaje visual que el de `AudioPlayer` (40px, `rounded-full`,
            `bg-primary-600`, triángulo `M8 5v14l11-7z`). El texto va **al lado,
            como etiqueta legible**, no como enlace disfrazado.
          - Si hay hijas pero ninguna es reproducible, no se pinta NINGÚN
            control: solo la frase honesta. Un botón apagado ahí sería ruido
            igual de vacío.

          La etiqueta es `Reproducir • <fuente>`, y es el **mismo patrón que
          escribe `AudioPlayer`** en una pista suelta (línea 260: `{statusText} •
          {primarySource.label}` → "Reproducir • Preview (30s)", "Reproducir •
          YouTube"). Aquí `<fuente>` son las N hijas. La palabra "Escuchar" se
          retiró porque era una **tercera** manera de nombrar la misma acción:
          con "Reproducir", "Escuchar N pistas" y "▶" conviviendo en la misma
          tarjeta, el visitante no sabía si eran el mismo control. El `aria-label`
          del botón sigue siendo "Reproducir N pistas de <título>", porque ahí sí
          cuenta quién reproduce y qué.

          El estado de la cola no vive aquí: vive en `useAudioPlayer()`, y esta
          tarjeta solo llama a `playQueue` con el array que le pasó quien tiene
          las hijas.
        */}
        <AudioPlayer           id={track.id}           src={track.audio_preview_url}           title={track.title}           artist={track.artist_name || undefined}           coverImage={coverImage || undefined}           track={track}           queue={isReleaseParent ? (queue || buildReleaseQueue(childrenTracks || [], coverImage || undefined, track.youtube_video_id || undefined)) : undefined}         />

        {/*
          Stats footer. RC.33 · Ola 3: `streams` y `saves` traen "—" cuando no
          hay dato, no `0`.

          El `title` no es decoración: es lo que distingue un guion de "no lo
          sabemos" de un número que se perdió al renderizar. Los dos `span` de
          cifras llevan `aria-label` con el texto del tooltip para que el lector
          de pantalla no anuncie un "—" pelado, que es indistinguible de un 0
          silencioso.
        */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center gap-1"
              title={statsTooltip}
              aria-label={statsTooltip}
              data-testid="epkcard-streams"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A2 2 0 0010 9.87v4.263a2 2 0 001.555.832l3.197-2.132a2 2 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {streams}
            </span>
            <span
              className="inline-flex items-center gap-1"
              title={savesTooltip}
              aria-label={savesTooltip}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              {saves}
            </span>
          </div>
          <div
            className={`inline-flex items-center gap-1 ${liked ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}
            title={
              youtubeMissing
                ? "No se pudieron obtener los likes de YouTube: se muestra solo el total de PressPlay"
                : youtubeStats
                  ? "Suma de los likes de PressPlay y los likes de YouTube"
                  : "Likes registrados en PressPlay"
            }
          >
            <span className={animating ? "animate-heartbeat" : ""} style={{ fontSize: "0.875rem", lineHeight: 1 }}>
              {liked ? "❤️" : "🤍"}
            </span>
            <span>{formatNumber(likeCount + ytLikes)}</span>
          </div>
        </div>
      </CardContent>
      <style jsx>{`
        @keyframes heartbeat {
          0% { transform: scale(1); }
          25% { transform: scale(1.3); }
          50% { transform: scale(1); }
          75% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .animate-heartbeat {
          animation: heartbeat 0.6s ease-in-out;
        }
      `}</style>
    </Card>
  );
}