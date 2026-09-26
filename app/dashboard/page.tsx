"use client";

import { Metadata } from "next";

import { EPKCard } from "@/components/EPKCard";
import { EPKExporter } from "@/components/EPKExporter";
import { BioSection } from "@/components/BioSection";
import { SocialBar } from "@/components/SocialBar";
import { ShowsBooking } from "@/components/ShowsBooking";
import { LoginModal } from "@/components/LoginModal";
import LastfmMetrics from "@/components/LastfmMetrics";
import { DossierEditor } from "@/components/DossierEditor";
import { DownloadCenter } from "@/components/DownloadCenter";
import { PageTransition, SlideIn, PitchHeading } from "@/components/MotionWrappers";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShowForm } from "@/components/ShowForm";
import type { Track, ArtistProfile, Show, ShowStatus } from "@/types/music";
import { formatDateES } from "@/lib/null-safe";
import { showStatusLabel } from "@/lib/show-status";
import { sortList } from "@/lib/search";
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
  const artistTracks = artistProfile ? tracks.filter((t) => t.artist_name === artistProfile.name) : tracks;
  const sortedTracks = sortList(tracks, sortState, TRACK_ACCESSORS);
  const sortedArtistTracks = sortList(artistTracks, sortState, TRACK_ACCESSORS);
  const isAdmin = user?.role === "admin";

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
                      <a href={`/track/${track.id}`} className="block h-full">
                        <EPKCard track={track} onLoginPrompt={() => setShowLoginModal(true)} />
                      </a>
                    </SlideIn>
                  ))}
                </div>
              </section>
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
                      <div className="relative group">
                        <a href={`/track/${track.id}`} className="block h-full">
                          <EPKCard track={track} onLoginPrompt={() => setShowLoginModal(true)} />
                        </a>
                        <a
                          href={`/releases/${track.id}/edit`}
                          className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm text-xs font-medium text-slate-700 dark:text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950 dark:hover:text-amber-300 shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          Editar
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

              {/* Dossier / Rider + Centro de Descargas */}
              {artistProfile && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                  <SlideIn index={artistTracks.length + 2}>
                    <DossierEditor
                      artistId={artistProfile.id}
                      artistName={artistProfile.name}
                      onSaved={() => {
                        const url = user?.id ? `/api/dashboard?user_id=${user.id}` : "/api/dashboard";
                        fetch(url).then(r => r.json()).then(json => setData(json));
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

              <SlideIn index={artistTracks.length + 3}>
                <EPKExporter tracks={artistTracks} />
              </SlideIn>
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

                <div className="mt-4">
                  <SocialBar
                    spotifyUrl="https://open.spotify.com"
                    youtubeUrl="https://www.youtube.com"
                    instagramUrl="https://www.instagram.com"
                  />
                </div>
              </section>

              {/* All tracks */}
              <section>
                <div className="mb-4 flex justify-end">
                  <SortSelect value={sortState} onChange={setSortState} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                  {sortedTracks.map((track, i) => (
                    <SlideIn key={track.id} index={i}>
                      <a href={`/track/${track.id}`} className="block h-full">
                        <EPKCard track={track} onLoginPrompt={() => setShowLoginModal(true)} />
                      </a>
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
                <section className="mb-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                  <SectionHeader
                    emoji="🎤"
                    title="Artistas"
                    subtitle="Bios y shows del catálogo"
                  />
                  <div className="space-y-8">
                    {artists.map((art, i) => {
                      const artShows = data.showsByArtist[art.id] || [];
                      return (
                        <SlideIn key={art.id} index={tracks.length + i}>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <BioSection
                              artistName={art.name}
                              genre={art.genre || "Multi-género"}
                              location={art.location || "Latinoamérica"}
                              monthlyListeners={art.monthly_listeners || 0}
                              biography={art.biography}
                              pressText={art.press_text}
                              pressHighlights={art.press_highlights}
                            />
                            <ShowsBooking artistId={art.id} shows={artShows} />
                          </div>
                        </SlideIn>
                      );
                    })}
                  </div>
                </section>
              )}

              <SlideIn index={tracks.length + artists.length}>
                <EPKExporter tracks={tracks} />
              </SlideIn>
            </>
          )}
        </PageTransition>
      </main>

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
}
