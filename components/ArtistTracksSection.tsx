"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EPKCard } from "@/components/EPKCard";
import { ReleaseTrackList, buildReleaseQueue } from "@/components/ReleaseTrackList";
import { LoginModal } from "@/components/LoginModal";
import { capitalizeReleaseType } from "@/lib/null-safe";
import type { ActiveTrack } from "@/context/AudioPlayerContext";
import type { ArtistCatalogGroup } from "@/lib/db";
import type { Track } from "@/types/music";
import type { YouTubeStatsRecord } from "@/lib/youtube";

/**
 * C2: cuántas pistas se muestran antes de plegar la lista de un release.
 * Con 6 filas el bloque sigue leyéndose como álbum y la rejilla no se desborda.
 */
const VISIBLE_TRACKS = 6;

interface ArtistTracksSectionProps {
  /**
   * C2: catálogo agrupado por release. Cada grupo trae la fila padre (el
   * álbum o el single suelto) y, si es un álbum, sus hijas aprobadas.
   * Se recibe como array plano de objetos — nunca un `Map`, que no sobrevive
   * al límite Server → Client.
   */
  groups: ArtistCatalogGroup[];
  /**
   * Fase E: lote de YouTube resuelto en el Server Component (`artists/[id]`)
   * y pasado hacia abajo. Sin esto cada `EPKCard` pediría sus propias stats
   * y una visita = N llamadas upstream.
   */
  youtubeStats?: YouTubeStatsRecord;
  /**
   * RC.34: scrobbles de Last.fm **ya resueltos por pista**, indexados por
   * `track.id`.
   *
   * El mismo motivo que `youtubeStats`, y además evita repetir aquí la
   * normalización de títulos: la página del artista pide `artist.gettoptracks`
   * una vez (NO `track.getInfo` por fila, que serían 65 llamadas para un
   * álbum de 65 hijas), arma el índice `título normalizado -> playcount` y
   * entrega el número de cada pista ya buscado.
   *
   * Se indexa por id y no por título a propósito: el consumidor no necesita
   * entonces ninguna normalización, y una clave por id no puede desincronizarse
   * de la que construyó el índice.
   *
   * El valor es `number | null`. `null` = Last.fm no conoce esa pista (o no
   * respondió) y `EPKCard` pinta "—" con su `title` explicativo. Un `0` aquí
   * sería mentir: afirmar que nadie escuchó la pista.
   */
  lastfmByTrack?: Record<string, number | null>;
}

export function ArtistTracksSection({
  groups,
  youtubeStats = {},
  lastfmByTrack = {},
}: ArtistTracksSectionProps) {
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  // Estado de colapso por release, no global: plegar un álbum no debe
  // replegar los demás. Objeto plano, no Map.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleLoginPrompt = () => {
    setLoginModalOpen(true);
  };

  const statsFor = (track: Track) =>
    track.youtube_video_id ? youtubeStats[track.youtube_video_id] ?? null : null;

  /**
   * Scrobbles de Last.fm de la fila, ya resueltos por el servidor. `?? null`
   * convierte "el lote no trajo este id" en "sin dato", que es lo que la
   * tarjeta sabe pintar; un `undefined` suelto se colaría en el pie como dato
   * ausente sin motivo.
   */
  const lastfmFor = (track: Track) => lastfmByTrack[track.id] ?? null;

  const toggleRelease = (releaseId: string) => {
    setExpanded((prev) => ({ ...prev, [releaseId]: !prev[releaseId] }));
  };

  /**
   * P2: una cola por lanzamiento, construida una sola vez por grupo con
   * `buildReleaseQueue` — la MISMA función que usa `ReleaseTrackList` para sus
   * filas, para que el "Reproducir • N pistas" de la tarjeta y las filas de abajo
   * no puedan discrepar sobre cuántas pistas suenan y cuáles.
   *
   * `useMemo` y no un `map` en el render porque `playQueue` recibe el array
   * entero en cada pulsación, y un array nuevo en cada render impediría
   * asumir estabilidad aguas abajo.
   *
   * La clave es `release.id`: cambiar el orden de los grupos o desplegar uno
   * NO reconstruye las colas de los demás.
   */
  const queues = useMemo(() => {
    const map: Record<string, ActiveTrack[]> = {};
    for (const { release, tracks } of groups) {
      const built = buildReleaseQueue(
        tracks,
        release.cover_image || undefined,
        release.youtube_video_id || undefined
      );
      if (built.length > 0) map[release.id] = built;
    }
    return map;
  }, [groups]);

  if (groups.length === 0) return null;

  return (
  /**
   * El `id` del `<section>` es un ancla de verdad, no decora÷ión: el botón del
   * catálogo de una ficha de release enlaza a `/artists/<id>#lanzamientos` para que se
   * caiga aquí en vez de arriba (ver `components/ReleaseActions.tsx`).
   *
   * El `scroll-mt` va con í porque sin él el encabezado queda pegado al borde de
   * arriba y el navegador deja la lista justo debajo de donde empezaría a mirar.
   */
    <section id="lanzamientos" className="mt-8 scroll-mt-24">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Lanzamientos</h2>
      {/* `items-start`: sin eso, una celda con 10 pistas estira a todas las
          de su fila y las EPKCard sueltas quedan flotando en el vacío. */}
      {/*
        P11 — 4 lanzamientos por página, que es lo que pidió el usuario.

        En el `main` de `artists/[id]` (`max-w-7xl` = 1280px menos `px-4`):
          390px  1 col  → 358px
          768px  2 cols → 356px
         1024px  3 cols → 314px
         1280px  4 cols → 294px
         1440px  4 cols → 294px (topado por max-w-7xl)

        Los umbrales que otros guiones exigen (`cardWidth >= 250` en
        `scripts/rc29-artist-shots.ts:373`, `card >= 260` en
        `scripts/verify-wave3.cjs:41`) se siguen cumpliendo con holgura: el
        más estrecho es 294px.

        El motivo histórico de bajar a 3 columnas (`bfdda30`) NO era el ancho:
        era que el título tenía UNA sola línea parapia (`truncate`), y a 294px
        eso lo dejaba en 17-31px. Con dos líneas (`line-clamp-2` en el `<h3>`
        de `EPKCard`) el título se lee entero a 294px, así que las 4 columnas
        vuelven sin volver a perder legibilidad.

        Y esto sigue siendo una REJILLA, no un carrusel: el carrusel del
        catálogo (`components/carousel/**`, `lib/carousel.ts`) es de 1 artista
        por página y `lib/carousel.ts` documenta que los slides responsivos se
        borraron a propósito para no dejar dos fuentes de verdad. Reintroducirlos
        aquí mezclaría ambos mecanismos sobre el mismo catálogo.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
        {groups.map(({ release, tracks }) => {
          const isOpen = !!expanded[release.id];
          const hidden = tracks.length - VISIBLE_TRACKS;
          const visibleTracks = isOpen ? tracks : tracks.slice(0, VISIBLE_TRACKS);

          return (
            <div key={release.id} className="flex flex-col gap-4 min-w-0">
              {/* EPKCard de la fila padre: conserva like, métricas y portada
                  clickeable; el PLAY ya no lo conserva, y es deliberado.

                  Un padre no tiene audio propio (`audio_preview_url` vacío, que
                  `lib/db.ts` convierte en el truthy `"—"`), así que su botón de
                  play era un control inerte. Con `childrenTracks` + `queue` la
                  tarjeta cambia ese estado muerto por uno honesto: un play
                  circular real rotulado "Reproducir • N pistas", que monta la
                  cola completa en el contexto con avance automático. (El
                  "botón deshabilitado con la explicación" que había aquí se
                  retiró en RC.33 Ola 1: decía "no hay audio" sobre una tarjeta
                  que sí lo tenía.)
                  La duración mostrada también sale de las hijas (`sumDurations`).

                  `detailHref` apunta a la ficha que corresponda: un single suelto
                  solo tiene `/track/{id}`, un álbum tiene su página
                  `/releases/{id}` donde ya se listan las pistas. */}
              <EPKCard
                track={release}
                onLoginPrompt={handleLoginPrompt}
                youtubeStats={statsFor(release)}
                lastfmPlaycount={lastfmFor(release)}
        lastfmByTrack={lastfmByTrack}
                detailHref={
                  tracks.length > 0 ? `/releases/${release.id}` : `/track/${release.id}`
                }
                childrenTracks={tracks.length > 0 ? tracks : undefined}
                queue={queues[release.id]}
              />

              {/* Solo un release con hijas dibuja lista: un single suelto
                  queda como EPKCard normal, sin bloque vacío debajo. */}
              {tracks.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <Link
                    href={`/releases/${release.id}`}
                    className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {release.title}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {capitalizeReleaseType(release.release_type || "single")} ·{" "}
                        {tracks.length} {tracks.length === 1 ? "pista" : "pistas"}
                      </span>
                    </span>
                    <svg
                      className="w-4 h-4 shrink-0 text-indigo-500 dark:text-indigo-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>

                  <div className="p-3">
                    {/*
                      `queueTracks` es la lista COMPLETA, no `visibleTracks`.
                      Plegar a 6 es una decisión de pantalla, no de audio: si la
                      cola saliera de las 6 filas visibles, "Reproducir • 6 pistas"
                      pararía en el sexto tema de un disco de 8 y el avance
                      automático se acabaría antes de tiempo.
                    */}
                    <ReleaseTrackList
                      tracks={visibleTracks}
                      queueTracks={tracks}
                      releaseTitle={release.title}
                      releaseCoverImage={release.cover_image || undefined}
                      releaseYoutubeVideoId={release.youtube_video_id || undefined}
                    />

                    {hidden > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleRelease(release.id)}
                        aria-expanded={isOpen}
                        className="mt-3 w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      >
                        {isOpen ? "Mostrar menos" : `Ver los ${hidden} restantes`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
    </section>
  );
}
