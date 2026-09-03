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
import type { Track, ArtistProfile, Show, ShowStatus } from "@/types/music";

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
    status: "disponible" as ShowStatus,
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
                        status: "disponible" as ShowStatus,
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
                        status: show.status || "disponible" as ShowStatus,
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
                                status: "disponible" as ShowStatus,
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
                                status: "disponible" as ShowStatus,
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
                          <option value="disponible">Disponible</option>
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
                              status: "disponible" as ShowStatus,
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
