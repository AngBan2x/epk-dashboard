"use client";

import { useState } from "react";
import Link from "next/link";
import { EPKCard } from "@/components/EPKCard";
import { ReleaseTrackList } from "@/components/ReleaseTrackList";
import { LoginModal } from "@/components/LoginModal";
import { capitalizeReleaseType } from "@/lib/null-safe";
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
}

export function ArtistTracksSection({ groups, youtubeStats = {} }: ArtistTracksSectionProps) {
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  // Estado de colapso por release, no global: plegar un álbum no debe
  // replegar los demás. Objeto plano, no Map.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleLoginPrompt = () => {
    setLoginModalOpen(true);
  };

  const statsFor = (track: Track) =>
    track.youtube_video_id ? youtubeStats[track.youtube_video_id] ?? null : null;

  const toggleRelease = (releaseId: string) => {
    setExpanded((prev) => ({ ...prev, [releaseId]: !prev[releaseId] }));
  };

  if (groups.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Lanzamientos</h2>
      {/* `items-start`: sin eso, una celda con 10 pistas estira a todas las
          de su fila y las EPKCard sueltas quedan flotando en el vacío. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
        {groups.map(({ release, tracks }) => {
          const isOpen = !!expanded[release.id];
          const hidden = tracks.length - VISIBLE_TRACKS;
          const visibleTracks = isOpen ? tracks : tracks.slice(0, VISIBLE_TRACKS);

          return (
            <div key={release.id} className="flex flex-col gap-4 min-w-0">
              {/* EPKCard de la fila padre: conserva play, like y métricas.
                  `detailHref` apunta a la ficha que corresponda: un single
                  suelto solo tiene `/track/{id}`, un álbum tiene su página
                  `/releases/{id}` donde ya se listan las pistas. Sin esto un
                  single se quedaba sin ninguna forma de abrir su ficha. */}
              <EPKCard
                track={release}
                onLoginPrompt={handleLoginPrompt}
                youtubeStats={statsFor(release)}
                detailHref={
                  tracks.length > 0 ? `/releases/${release.id}` : `/track/${release.id}`
                }
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
                    <ReleaseTrackList
                      tracks={visibleTracks}
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
