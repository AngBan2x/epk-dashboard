"use client";

import { Metadata } from "next";

import { Header } from "@/components/Header";
import { EPKCard } from "@/components/EPKCard";
import { EPKExporter } from "@/components/EPKExporter";
import { BioSection } from "@/components/BioSection";
import { SocialBar } from "@/components/SocialBar";
import { ShowsBooking } from "@/components/ShowsBooking";
import { LoginModal } from "@/components/LoginModal";
import { PageTransition, SlideIn, PitchHeading } from "@/components/MotionWrappers";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { Track, ArtistProfile, Show, ShowStatus } from "@/types/music";

interface DashboardData {
  tracks: Track[];
  artists: ArtistProfile[];
  artistProfile: ArtistProfile | null;
  artistShows: Show[];
  showsByArtist: Record<string, Show[]>;
  subscribers?: number;
  likes?: number;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6"
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

interface QuickActionProps {
  label: string;
  icon: string;
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
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition ${color}`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
    </Wrapper>
  );
}

interface DashboardData {
  tracks: Track[];
  artists: ArtistProfile[];
  artistProfile: ArtistProfile | null;
  artistShows: Show[];
  showsByArtist: Record<string, Show[]>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [data, setData] = useState<DashboardData>({ tracks: [], artists: [], artistProfile: null, artistShows: [], showsByArtist: {} });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState({
    artist_id: "",
    venue_name: "",
    city: "",
    country: "",
    date: "",
    time: "",
    price_range: "",
    status: "proximamente" as ShowStatus,
    ticket_url: "",
  });
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [showFormOpen, setShowFormOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
  const isAdmin = user?.role === "admin";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-20 text-slate-400">Cargando...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <PageTransition>
          {/* ===== ADMIN VIEW ===== */}
          {isAdmin ? (
            <section className="mb-10">
              <PitchHeading>
                <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
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
              <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
                {tracks.map((track, i) => (
                  <SlideIn key={track.id} index={i}>
                    <a href={`/track/${track.id}`} className="block h-full">
                      <EPKCard track={track} onLoginPrompt={() => setShowLoginModal(true)} />
                    </a>
                  </SlideIn>
                ))}
              </section>
            </section>
          ) : artistProfile ? (
            /* ===== ARTIST VIEW ===== */
            <>
              <section className="mb-10">
                <PitchHeading>
                  <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
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
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Acciones Rápidas</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <QuickAction label="Nuevo Release" icon="+" href="/releases/new" color="hover:bg-amber-50 dark:hover:bg-amber-950" />
                  <QuickAction label="Nuevo Show" icon="+" onClick={() => setShowFormOpen(true)} color="hover:bg-emerald-50 dark:hover:bg-emerald-950" />
                  <QuickAction label="Editar Perfil" icon="✏️" href="/profile" color="hover:bg-blue-50 dark:hover:bg-blue-950" />
                </div>
              </section>

              {/* Recent Activity */}
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Actividad Reciente</h2>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {artistTracks.slice(0, 3).map((track) => (
                    <div key={track.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{track.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Release publicado</p>
                      </div>
                      <span className="text-xs text-slate-400">{track.release_date || "N/A"}</span>
                    </div>
                  ))}
                  {artistShows.slice(0, 2).map((show) => (
                    <div key={show.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{show.venue_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Próximo show</p>
                      </div>
                      <span className="text-xs text-slate-400">{show.date || "TBD"}</span>
                    </div>
                  ))}
                  {artistTracks.length === 0 && artistShows.length === 0 && (
                    <div className="px-4 py-8 text-center text-slate-400">
                      <p className="text-sm">No hay actividad reciente</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Artist's tracks */}
              <section className="mb-12">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Mis Tracks</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {artistTracks.map((track, i) => (
                    <SlideIn key={track.id} index={i}>
                      <a href={`/track/${track.id}`} className="block h-full">
                        <EPKCard track={track} onLoginPrompt={() => setShowLoginModal(true)} />
                      </a>
                    </SlideIn>
                  ))}
                  {artistTracks.length === 0 && (
                    <div className="col-span-4 text-center py-12 text-slate-400">
                      <p>No tienes tracks aún.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Artist's Bio + Shows */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
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
                      setShowForm({
                        artist_id: "",
                        venue_name: "",
                        city: "",
                        country: "",
                        date: "",
                        time: "",
                        price_range: "",
                        status: "proximamente" as ShowStatus,
                        ticket_url: "",
                      });
                    }}
                    onEdit={(show) => {
                      setEditingShow(show);
                      setShowFormOpen(true);
                      setShowForm({
                        artist_id: show.artist_id,
                        venue_name: show.venue_name,
                        city: show.city || "",
                        country: show.country || "",
                        date: show.date || "",
                        time: show.time || "",
                        price_range: show.price_range || "",
                        status: show.status || "proximamente" as ShowStatus,
                        ticket_url: show.ticket_url || "",
                      });
                    }}
                    onDelete={async (showId) => {
                      if (confirm("¿Eliminar este show?")) {
                        await fetch(`/api/shows?id=${showId}`, { method: "DELETE" });
                        window.location.reload();
                      }
                    }}
                  />
                </SlideIn>
              </div>

              {/* Show Form Modal */}
              {showFormOpen || editingShow !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 w-full max-w-lg m-6 p-8">
                    <h4 className="text-lg font-semibold mb-4">
                      {editingShow ? "Editar Show" : "Nuevo Show"}
                    </h4>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          if (editingShow) {
                            const res = await fetch("/api/shows", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: editingShow.id, ...showForm }),
                            });
                            if (res.ok) {
                              setEditingShow(null);
                              setShowFormOpen(false);
                              setShowForm({
                                artist_id: "",
                                venue_name: "",
                                city: "",
                                country: "",
                                date: "",
                                time: "",
                                price_range: "",
                                status: "proximamente" as ShowStatus,
                                ticket_url: "",
                              });
                              const url = user?.id ? `/api/dashboard?user_id=${user.id}` : "/api/dashboard";
                              fetch(url).then((res) => res.json()).then((json) => {
                                setData(json);
                              });
                              setMessage({ type: "success", text: "Show actualizado" });
                            }
                          } else {
                            const res = await fetch("/api/shows", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(showForm),
                            });
                            if (res.ok) {
                              setShowFormOpen(false);
                              setShowForm({
                                artist_id: "",
                                venue_name: "",
                                city: "",
                                country: "",
                                date: "",
                                time: "",
                                price_range: "",
                                status: "proximamente" as ShowStatus,
                                ticket_url: "",
                              });
                              const url = user?.id ? `/api/dashboard?user_id=${user.id}` : "/api/dashboard";
                              fetch(url).then((res) => res.json()).then((json) => {
                                setData(json);
                              });
                              setMessage({ type: "success", text: "Show creado" });
                            }
                          }
                        } catch {
                          setMessage({ type: "error", text: "Error al guardar show" });
                        }
                      }}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Artista *</label>
                          <select
                            required
                            value={showForm.artist_id}
                            onChange={(e) => setShowForm({ ...showForm, artist_id: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                          >
                            <option value="">Seleccionar artista</option>
                            {artists.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Lugar *</label>
                          <input
                            type="text"
                            required
                            value={showForm.venue_name}
                            onChange={(e) => setShowForm({ ...showForm, venue_name: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                            placeholder="Nombre del lugar"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ciudad</label>
                          <input
                            type="text"
                            value={showForm.city}
                            onChange={(e) => setShowForm({ ...showForm, city: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">País</label>
                          <input
                            type="text"
                            value={showForm.country}
                            onChange={(e) => setShowForm({ ...showForm, country: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha</label>
                          <input
                            type="date"
                            value={showForm.date}
                            onChange={(e) => setShowForm({ ...showForm, date: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Hora</label>
                          <input
                            type="time"
                            value={showForm.time}
                            onChange={(e) => setShowForm({ ...showForm, time: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Rango de Precio</label>
                          <input
                            type="text"
                            value={showForm.price_range}
                            onChange={(e) => setShowForm({ ...showForm, price_range: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                            placeholder="ej: $20-$50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Estado</label>
                        <select
                          value={showForm.status}
                          onChange={(e) => setShowForm({ ...showForm, status: e.target.value as ShowStatus })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                        >
                          <option value="proximamente">Próximamente</option>
                          <option value="agotado">Agotado</option>
                          <option value="proximamente">Próximamente</option>
                          <option value="vip">VIP</option>
                          <option value="cancelado">Cancelado</option>
                          <option value="pausado">Pausado</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL Tickets</label>
                        <input
                          type="url"
                          value={showForm.ticket_url}
                          onChange={(e) => setShowForm({ ...showForm, ticket_url: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                          placeholder="https://..."
                        />
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          className="px-6 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                        >
                          {editingShow ? "Guardar Cambios" : "Crear Show"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingShow(null);
                            setShowFormOpen(false);
                            setShowForm({
                              artist_id: "",
                              venue_name: "",
                              city: "",
                              country: "",
                              date: "",
                              time: "",
                              price_range: "",
                              status: "proximamente" as ShowStatus,
                              ticket_url: "",
                            });
                          }}
                          className="px-6 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <SlideIn index={artistTracks.length + 2}>
                <EPKExporter tracks={artistTracks} />
              </SlideIn>
            </>
          ) : (
            /* ===== GUEST VIEW ===== */
            <>
              <section className="mb-10">
                <PitchHeading>
                  <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
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
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
                {tracks.map((track, i) => (
                  <SlideIn key={track.id} index={i}>
                    <a href={`/track/${track.id}`} className="block h-full">
                      <EPKCard track={track} onLoginPrompt={() => setShowLoginModal(true)} />
                    </a>
                  </SlideIn>
                ))}
                {tracks.length === 0 && (
                  <div className="col-span-4 text-center py-12 text-slate-400">
                    <p>No se encontraron tracks.</p>
                  </div>
                )}
              </section>

              {/* Carousel of all artists' Bio + Shows */}
              {artists.length > 0 && (
                <section className="mb-12">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Artistas</h2>
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
