"use client";

import { Metadata } from "next";

import { EPKCard } from "@/components/EPKCard";
import { BioSection } from "@/components/BioSection";
// C6: `ArtistSocialLinks` se retiró del catálogo. Sus datos ya son públicos en
// `/artists/[id]` y aquí solo se duplicaban.
import { CatalogArtistsCarousel } from "@/components/dashboard/CatalogArtistsCarousel";
import { ShowsBooking } from "@/components/ShowsBooking";
import { LoginModal } from "@/components/LoginModal";
import LastfmMetrics from "@/components/LastfmMetrics";
import { DossierEditor } from "@/components/DossierEditor";
import { DownloadCenter } from "@/components/DownloadCenter";
import { CatalogDownloadButton } from "@/components/CatalogDownloadButton";
import { PageTransition, SlideIn, PitchHeading } from "@/components/MotionWrappers";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShowForm } from "@/components/ShowForm";
import type { Track, ArtistProfile, Show, ShowStatus } from "@/types/music";
import { formatDateES, safeString } from "@/lib/null-safe";
import { showStatusLabel } from "@/lib/show-status";
import { sortList } from "@/lib/search";
import { collectVideoIds, type YouTubeStatsRecord } from "@/lib/youtube";
import { SortSelect, useListSort } from "@/components/SortSelect";

const TRACK_ACCESSORS = {
  text: (track: Track) => track.title,
  date: (track: Track) => track.release_date,
};

const DEFAULT_SORT = { sort: "date", order: "desc" } as const;

interface DashboardData {
  tracks: Track[];
  artists: ArtistProfile[];
  artistProfile: ArtistProfile | null;
  artistShows: Show[];
  showsByArtist: Record<string, Show[]>;
  subscribers?: number;
  likes?: number;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6"
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

interface QuickActionProps {
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  color: string;
}

function QuickAction({ label, icon, href, onClick, color }: QuickActionProps) {
  const Wrapper = href ? "a" : "button";
  const props = href ? { href } : { onClick };
  return (
    <Wrapper
      {...props}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition ${color}`}
    >
      <span className="text-amber-500 dark:text-amber-400">{icon}</span>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
    </Wrapper>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [data, setData] = useState<DashboardData>({ tracks: [], artists: [], artistProfile: null, artistShows: [], showsByArtist: {} });
  const [loading, setLoading] = useState(true);
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [showFormOpen, setShowFormOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sortState, setSortState] = useListSort(DEFAULT_SORT);
  const [youtubeStats, setYoutubeStats] = useState<YouTubeStatsRecord>({});

  useEffect(() => {
    const base = user?.id ? `/api/dashboard?user_id=${user.id}` : "/api/dashboard";
    const url = `${base}${base.includes("?") ? "&" : "?"}_t=${Date.now()}`;
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user?.id]);

  const { tracks, artists, artistProfile, artistShows } = data;

  /**
   * Fase E — UN solo fetch con todos los ids para las 3 rejillas.
   * Antes cada `EPKCard` pedía `/api/youtube/stats?videoId=...` en su
   * `useEffect`: un catálogo de N tracks = N llamadas upstream por visitante,
   * y el `useEffect` se re-disparaba en cada reordenación (SortSelect).
   *
   * La dependencia es el string de ids, no el array: `setData` crea un array
   * nuevo en cada recarga y con `[tracks]` se volvería a pedir el lote entero
   * aunque los ids sean los mismos.
   */
  const youtubeIdsKey = collectVideoIds(tracks).join(",");
  useEffect(() => {
    if (!youtubeIdsKey) {
      setYoutubeStats({});
      return;
    }
    let cancelled = false;
    fetch(`/api/youtube/stats?ids=${youtubeIdsKey}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setYoutubeStats(json?.stats ?? {});
      })
      .catch(() => {
        if (!cancelled) setYoutubeStats({});
      });
    return () => {
      cancelled = true;
    };
  }, [youtubeIdsKey]);

  const artistTracks = artistProfile ? tracks.filter((t) => t.artist_name === artistProfile.name) : tracks;
  const sortedTracks = sortList(tracks, sortState, TRACK_ACCESSORS);
  const sortedArtistTracks = sortList(artistTracks, sortState, TRACK_ACCESSORS);
  const isAdmin = user?.role === "admin";
  const isSubscriber = !!user && !isAdmin && !artistProfile;
  /** Stats del lote para una tarjeta concreta (ya resueltas, sin fetch). */
  const statsFor = (track: Track) =>
    track.youtube_video_id ? youtubeStats[track.youtube_video_id] ?? null : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-20 text-slate-400">Cargando...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <PageTransition>
          {/* ===== ADMIN VIEW ===== */}
          {isAdmin ? (
            <section className="mb-8">
              <PitchHeading>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  Panel de Administración
                </h1>
                <p className="text-slate-600 dark:text-slate-400 text-base mb-4">
                  Gestiona el catálogo, artistas y shows desde el panel de admin
                </p>
              </PitchHeading>
              <a
                href="/admin"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition"
              >
                🛠️ Abrir Panel Admin
              </a>

{/* Show all tracks in grid */}
              <section className="mt-8 mb-8">
                <div className="mb-4 flex justify-end">
                  <SortSelect value={sortState} onChange={setSortState} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {sortedTracks.map((track, i) => (
                    <SlideIn key={track.id} index={i}>
                      {/*
                        P8: la tarjeta NO va dentro de un `<a>`.

                        Este bloque envolvía `<EPKCard>` entera en
                        `<a href={/track/${track.id}}>`, y dentro hay un `<button>`
                        de like y otro de play. Anidar un enlace alrededor de un
                        botón es HTML inválido: axe lo reporta como
                        `nested-interactive` (WCAG 2A) en `/dashboard`, y el
                        tabulador cae en un enlace que contiene otro control.

                        El enlace lo lleva la tarjeta: la portada es su propia
                        superficie de clic (`EPKCard`, hermano del botón de
                        like) y el título es el enlace tabulable. Aquí solo se
                        pasa `detailHref`.
                      */}
                      <EPKCard
                        track={track}
                        priority={i === 0}
                        onLoginPrompt={() => setShowLoginModal(true)}
                        youtubeStats={statsFor(track)}
                        detailHref={`/track/${track.id}`}
                      />
                    </SlideIn>
                  ))}
                </div>
              </section>
            </section>
          ) : isSubscriber ? (
            /* ===== SUBSCRIBER VIEW ===== */
            <section className="mb-8">
              <PitchHeading>
                <h1 className="mb-3 text-2xl font-bold text-slate-900 dark:text-white">
                  Bienvenido a PressPlay
                </h1>
                <p className="text-base text-slate-600 dark:text-slate-400">
                  Tu cuenta es de <strong className="text-primary-600 dark:text-primary-400">Suscriptor</strong>.{" "}
                  Sigue a los artistas que te gustan y, cuando quieras publicar, crea tu primer
                  lanzamiento o show.
                </p>
              </PitchHeading>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    1. Publica tu primer release o show
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Se envía a revisión y aparece como pendiente. Nadie más puede editarlo.
                  </p>
                  <a
                    href="/releases/new"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    Crear mi primer release
                  </a>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    2. Te conviertes en Artista
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Al aprobarse tu primera publicación tu cuenta pasa a Artista automáticamente y
                    se desbloquean el dossier, el rider y las descargas para prensa.
                  </p>
                  <a
                    href="/shows"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Ver shows publicados
                  </a>
                </div>
              </div>

              {/*
                P2 (CTA) — "Enviar música" también para suscriptores.

                Este es el caso para el que la cuenta existe: cualquiera puede
                enviar un release, y `/submissions` es donde se ve en qué estado
                    está cada envío (pendiente, aprobado, rechazado) y qué motivo dio
                    la revisión. Es el equivalente de "mis envíos" para el
                suscriptor, y por eso va con los otros dos pasos en lugar de
                escondida en un menú.

                Solo autenticados: este bloque entero es la vista de
                suscriptor, que ya exige `user`; la vista de invitado no lo
                monta.
              */}
              <a
                href="/submissions"
                className="mt-4 flex flex-col gap-2 rounded-2xl border border-primary-200 bg-primary-50/60 p-5 transition hover:border-primary-400 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-primary-900 dark:bg-primary-950/30 dark:hover:border-primary-700 dark:hover:bg-primary-950/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <svg className="w-4 h-4 shrink-0 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    ¿Ya tienes música?
                  </span>
                  <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">
                    Envía un release o un show y sigue su estado de revisión desde el portal de
                    envíos. No necesitas ser artista para empezar.
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 sm:self-auto">
                  Enviar música
                </span>
              </a>

              {artists.length > 0 && (
                <div className="mt-6">
                  <SectionHeader
                    emoji="🎤"
                    title="Artistas del catálogo"
                    subtitle=" Sigue a los que te interesen para no perderte nada"
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {artists.slice(0, 6).map((artist) => (
                      <a
                        key={artist.id}
                        href={`/artists/${artist.id}`}
                        className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-primary-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {artist.name}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {artist.genre || "Multi-género"}
                          {artist.location ? ` · ${artist.location}` : ""}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : artistProfile ? (
            /* ===== ARTIST VIEW ===== */
            <>
              <section className="mb-8">
                <PitchHeading>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                    Mi Dashboard
                  </h1>
                  <p className="text-slate-600 dark:text-slate-400 text-base">
                    Administra tu perfil, tracks y shows
                  </p>
                </PitchHeading>
              </section>

              {/* Stats Cards */}
              <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard
                  label="Releases"
                  value={artistTracks.length}
                  icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>}
                  color="bg-amber-500"
                />
                <StatCard
                  label="Shows"
                  value={artistShows.length}
                  icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                  color="bg-emerald-500"
                />
                <StatCard
                  label="Suscriptores"
                  value={data.subscribers ?? 0}
                  icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                  color="bg-blue-500"
                />
                <StatCard
                  label="Likes"
                  value={data.likes ?? 0}
                  icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>}
                  color="bg-pink-500"
                />
              </section>

              {/* Quick Actions */}
              <section className="mb-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                <SectionHeader
                  emoji="🎯"
                  title="Acciones Rápidas"
                  subtitle="Atajos para gestionar tu EPK"
                />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <QuickAction
                    label="Nuevo Release"
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
                    href="/releases/new"
                    color="hover:bg-amber-50 dark:hover:bg-amber-950"
                  />
                  <QuickAction
                    label="Nuevo Show"
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
                    onClick={() => setShowFormOpen(true)}
                    color="hover:bg-emerald-50 dark:hover:bg-emerald-950"
                  />
                  <QuickAction
                    label="Editar Perfil"
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>}
                    href="/profile"
                    color="hover:bg-blue-50 dark:hover:bg-blue-950"
                  />
                  {/*
                    P2 (CTA) — "Enviar música" al portal de envíos.

                    El enlace estaba metido dentro de `components/ReleaseActions.tsx`
                    (fichero de otro agente) porque `/dashboard` es la entrada
                    natural y ese no lo era. Aquí ya no hace falta: el portal de
                    envíos (`/submissions`) es exactamente donde se ve lo que
                    has enviado y en qué estado está, así que es una acción
                    rápida más, del mismo peso que las otras tres.

                    Solo para usuarios autenticados: el portal exige sesión
                    (`GET /api/submissions` responde 401 sin cookie) y un
                    anónimo que pulse estoicrobota en `/login`. La vista de
                    invitado no monta este bloque.
                  */}
                  {user && (
                    <QuickAction
                      label="Enviar música"
                      icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                      href="/submissions"
                      color="hover:bg-violet-50 dark:hover:bg-violet-950"
                    />
                  )}
                </div>
              </section>

              {/* Recent Activity */}
              <section className="mb-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                <SectionHeader
                  emoji="🕒"
                  title="Actividad Reciente"
                  subtitle="Últimos cambios en tu catálogo"
                />
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {artistTracks.slice(0, 3).map((track) => (
                    <div key={track.id} className="px-4 py-3 flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{track.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Release publicado</p>
                      </div>
                      <span className="text-xs text-slate-400 mr-2">{track.release_date ? formatDateES(track.release_date) : "N/A"}</span>
                      <a
                        href={`/releases/${track.id}/edit`}
                        title="Editar release"
                        aria-label="Editar release"
                        className="p-1.5 rounded-lg text-slate-400 opacity-60 group-hover:opacity-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </a>
                    </div>
                  ))}
                  {artistShows.slice(0, 2).map((show) => {
                    const isPast = !!show.date && new Date(show.date) < new Date();
                    return (
                    <div key={show.id} className="px-4 py-3 flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{show.venue_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{isPast ? "Show finalizado" : showStatusLabel(show.status)}</p>
                      </div>
                      <span className="text-xs text-slate-400">{show.date ? formatDateES(show.date) : "TBD"}</span>
                      <button
                        onClick={() => {
                          setEditingShow(show);
                          setShowFormOpen(true);
                        }}
                        title="Editar show"
                        aria-label="Editar show"
                        className="p-1.5 rounded-lg text-slate-400 opacity-60 group-hover:opacity-100 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    </div>
                    );
                  })}
                  {artistTracks.length === 0 && artistShows.length === 0 && (
                    <div className="px-4 py-8 text-center text-slate-400">
                      <p className="text-sm">No hay actividad reciente</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Artist's tracks */}
              <section className="mb-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                <SectionHeader
                  emoji="🎵"
                  title="Mis Tracks"
                  subtitle="Tu catálogo musical"
                />
                <div className="mb-4 flex justify-end">
                  <SortSelect value={sortState} onChange={setSortState} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {sortedArtistTracks.map((track, i) => (
                    <SlideIn key={track.id} index={i}>
                      {/*
                        P8: aquí había dos enlaces apilados sobre la MISMA
                        tarjeta: un `<a href=/track/{id}>` envolviendo la
                        `EPKCard` entera (con su botón de like y su play
                        dentro) y encima, en `absolute bottom-2 right-2`, un
                        segundo `<a href=/releases/{id}/edit>` que se pintaba
                        encima del pie de métricas de la tarjeta y se comía sus
                        clics.

                        Ahora la tarjeta no está dentro de ningún enlace (lleva
                        `detailHref` y su portada es la superficie de clic) y
                        "Editar" es un enlace **hermano**, debajo, en su propia
                        fila. Ademas se muestra siempre: `opacity-0
                        group-hover:opacity-100` es un enlace invisible en táctil
                        —no hay hover— y en un viewport de 4 columnas cabía
                        justo encima del contador de likes.
                      */}
                      <div className="flex h-full flex-col">
                        <EPKCard
                          track={track}
                          priority={i === 0}
                          onLoginPrompt={() => setShowLoginModal(true)}
                          youtubeStats={statsFor(track)}
                          detailHref={`/track/${track.id}`}
                        />
                        <a
                          href={`/releases/${track.id}/edit`}
                          className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-amber-800 dark:hover:bg-amber-950 dark:hover:text-amber-300"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          Editar {safeString(track.title, "release")}
                        </a>
                      </div>
                    </SlideIn>
                  ))}
                  {artistTracks.length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-400">
                      <p>No tienes tracks aún.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Dossier / Rider + Descargas unificadas */}
              {artistProfile && (
                <div className="mb-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
                  <SlideIn index={artistTracks.length + 2}>
                    <DossierEditor
                      artistId={artistProfile.id}
                      artistName={artistProfile.name}
                      onSaved={() => {
                        const url = user?.id ? `/api/dashboard?user_id=${user.id}` : "/api/dashboard";
                        fetch(url, { cache: "no-store" })
                          .then((r) => r.json())
                          .then((json) => setData(json));
                      }}
                    />
                  </SlideIn>
                  <SlideIn index={artistTracks.length + 3}>
                    <DownloadCenter
                      artistId={artistProfile.id}
                      artistName={artistProfile.name}
                      trackCount={artistTracks.length}
                    />
                  </SlideIn>
                </div>
              )}

              {/* Artist's Bio + Shows */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <SlideIn index={artistTracks.length}>
                  <BioSection
                    artistName={artistProfile.name}
                    genre={artistProfile.genre || "Multi-género"}
                    location={artistProfile.location || "Latinoamérica"}
                    monthlyListeners={artistProfile.monthly_listeners || 0}
                    biography={artistProfile.biography}
                    pressText={artistProfile.press_text}
                    pressHighlights={artistProfile.press_highlights}
                  />
                </SlideIn>
                <SlideIn index={artistTracks.length + 1}>
                  <ShowsBooking
                    artistId={artistProfile.id}
                    shows={artistShows}
                    editable={true}
                    onAdd={() => {
                      setShowFormOpen(true);
                      setEditingShow(null);
                    }}
                    onEdit={(show) => {
                      setEditingShow(show);
                      setShowFormOpen(true);
                    }}
                    onDelete={async (showId) => {
                      if (confirm("¿Eliminar este show?")) {
                        const res = await fetch(`/api/shows?id=${showId}`, { method: "DELETE" });
                        if (res.ok) {
                          setData((prev) => {
                            const pid = prev.artistProfile?.id;
                            const drop = (list: Show[]) => list.filter((s) => s.id !== showId);
                            return {
                              ...prev,
                              artistShows: drop(prev.artistShows),
                              showsByArtist: pid ? { ...prev.showsByArtist, [pid]: drop(prev.showsByArtist[pid] ?? []) } : prev.showsByArtist,
                            };
                          });
                          setMessage({ type: "success", text: "Show eliminado" });
                        }
                      }
                    }}
                  />
                </SlideIn>
              </div>

              {/* Last.fm Metrics */}
              <div className="mb-8">
                <SlideIn index={artistTracks.length + 2}>
                  <LastfmMetrics artist={artistProfile.name} />
                </SlideIn>
              </div>

              {/* Show Form Modal */}
{showFormOpen || editingShow !== null ? (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 w-full max-w-2xl m-6 p-8 max-h-[90vh] overflow-y-auto">
      <ShowForm
        show={editingShow ?? undefined}
        artistId={artistProfile?.id}
        artists={artists.map(a => ({ id: a.id, name: a.name }))}
        onSave={async (data) => {
          try {
            if (editingShow) {
              const res = await fetch("/api/shows", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editingShow.id, ...data }),
              });
              if (res.ok) {
                const saved = await res.json().catch(() => null);
                const showId = editingShow.id;
                // Optimistic update (immune to replica lag) + re-fetch as backup
                if (saved && saved.id) {
                  setData((prev) => {
                    const pid = prev.artistProfile?.id;
                    const merge = (list: Show[]) => list.map((s) => (s.id === showId ? { ...s, ...saved } : s));
                    return {
                      ...prev,
                      artistShows: merge(prev.artistShows),
                      showsByArtist: pid ? { ...prev.showsByArtist, [pid]: merge(prev.showsByArtist[pid] ?? []) } : prev.showsByArtist,
                    };
                  });
                }
                setEditingShow(null);
                setShowFormOpen(false);
                // Refresh data
                const url = user?.id ? `/api/dashboard?user_id=${user.id}` : "/api/dashboard";
                fetch(url).then(r => r.json()).then(json => setData(json));
                setMessage({ type: "success", text: "Show actualizado" });
              }
            } else {
              const res = await fetch("/api/shows", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
              });
              if (res.ok) {
                const saved = await res.json().catch(() => null);
                if (saved && saved.id) {
                  setData((prev) => {
                    const pid = prev.artistProfile?.id;
                    return {
                      ...prev,
                      artistShows: [...prev.artistShows, saved],
                      showsByArtist: pid ? { ...prev.showsByArtist, [pid]: [...(prev.showsByArtist[pid] ?? []), saved] } : prev.showsByArtist,
                    };
                  });
                }
                setShowFormOpen(false);
                const url = user?.id ? `/api/dashboard?user_id=${user.id}` : "/api/dashboard";
                fetch(url).then(r => r.json()).then(json => setData(json));
                setMessage({ type: "success", text: "Show creado" });
              } else {
                const err = await res.text();
                setMessage({ type: "error", text: err || "Error al crear show" });
              }
            }
          } catch {
            setMessage({ type: "error", text: "Error al guardar show" });
          }
        }}
        onCancel={() => {
          setEditingShow(null);
          setShowFormOpen(false);
        }}
      />
    </div>
  </div>
) : null}
            </>
          ) : (
            /* ===== GUEST VIEW ===== */
            <>
              <section className="mb-8">
                <PitchHeading>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                    PressPlay
                  </h1>
                  <p className="text-slate-600 dark:text-slate-400 text-base">
                    Catálogo completo · <strong className="text-primary-600 dark:text-primary-400">{tracks.length} tracks</strong>
                  </p>
                </PitchHeading>

              </section>

              {/* All tracks */}
              <section>
                <div className="mb-4 flex justify-end">
                  <SortSelect value={sortState} onChange={setSortState} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                  {sortedTracks.map((track, i) => (
                    <SlideIn key={track.id} index={i}>
                      {/* P8: sin `<a>` envolviendo la tarjeta. Ver la nota del
                          panel de admin, que tenía el mismo defecto. */}
                      <EPKCard
                        track={track}
                        priority={i === 0}
                        onLoginPrompt={() => setShowLoginModal(true)}
                        youtubeStats={statsFor(track)}
                        detailHref={`/track/${track.id}`}
                      />
                    </SlideIn>
                  ))}
                  {tracks.length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-400">
                      <p>No se encontraron tracks.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Carousel of all artists' Bio + Shows */}
              {artists.length > 0 && (
                <CatalogArtistsCarousel
                  artists={artists}
                  showsByArtist={data.showsByArtist}
                />
              )}

              <SlideIn index={tracks.length + artists.length}>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    ¿Trabajas en prensa o Contrataciones?
                  </h2>
                  {/*
                    P15 — el alcance, por escrito.

                    Esta vista es la de invitado: no hay artista en contexto, así
                    que la descarga es legítimamente la GLOBAL. El problema era
                    el copy, que decía "el catálogo completo del EPK" sin decir
                    de quién, y el `CatalogDownloadButton` sin props que lo
                    confirmaba. Ahora el texto dice las tres cosas que el
                    backend hace de verdad:

                    - es el catálogo de los {n} lanzamientos APROBADOS de
                      PressPlay (no hay un artist's id al que acotarlo);
                    - el dossier y el rider son por artista y salen
                      deshabilitados aquí, con su explicación, en vez de fallar
                      con un 400 (los necesita un usuario autenticado con
                      perfil: `/artists/{id}`);
                    - el nombre del archivo lo pone el servidor en
                      `Content-Disposition`, no esta página.
                  */}
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Descarga el catálogo público de PressPlay:{" "}
                    <strong className="font-semibold text-slate-800 dark:text-slate-200">
                      {tracks.length} lanzamientos aprobados
                    </strong>{" "}
                    con métricas, enlaces y detalles de producción. El dossier y el
                    rider técnico son por artista: entra a la ficha de un artista
                    para descargarlos.
                  </p>
                  <CatalogDownloadButton artistName="PressPlay" />
                </div>
              </SlideIn>
            </>
          )}
        </PageTransition>
      </main>

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
}
