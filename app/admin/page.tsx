"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { safeString } from "@/lib/null-safe";
import type { Track, ArtistProfile } from "@/types/music";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface AdminTrack {
  id: string;
  title: string;
  release_type: string;
  release_date: string;
  duration: string;
  cover_image: string;
  audio_preview_url: string;
  spotify_url: string | null;
  youtube_video_id: string | null;
  lyrics: string | null;
}

interface Submission {
  id: string;
  user_id: string;
  track_data: string;
  status: "pending" | "approved" | "rejected";
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SubmissionTrackData {
  title: string;
  artist_name: string;
  release_type: string;
  release_date: string;
  duration: string;
  cover_image: string;
  audio_preview_url: string;
  spotify_url: string | null;
  youtube_video_id: string | null;
  lyrics: string;
  production_details: {
    daw: string | null;
    guitars: string | null;
    effects_chain: string | null;
    tuning: string | null;
    key: string | null;
  };
}

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: string | null;
  read: boolean;
  created_at: string;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"tracks" | "submissions" | "notifications" | "artists">("tracks");
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [editingArtist, setEditingArtist] = useState<ArtistProfile | null>(null);
  const [artistForm, setArtistForm] = useState({
    name: "",
    biography: "",
    press_text: "",
    press_highlights: "",
    genre: "",
    location: "",
    monthly_listeners: 0,
  });
  const [loading, setLoading] = useState(true);
  const [editingTrack, setEditingTrack] = useState<AdminTrack | null>(null);
  //
  const [viewingSubmission, setViewingSubmission] = useState<Submission | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    release_type: "Single",
    release_date: "",
    duration: "",
    cover_image: "",
    audio_preview_url: "",
    spotify_url: "",
    youtube_video_id: "",
    lyrics: "",
  });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Auth guard — redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.push("/dashboard");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    fetchTracks();
    fetchSubmissions();
    fetchNotifications();
    fetchArtists();
  }, []);

  const fetchTracks = async () => {
    try {
      const res = await fetch("/api/tracks");
      if (res.ok) {
        const data = await res.json();
        setTracks(data.tracks || []);
      }
    } catch {
      setMessage({ type: "error", text: "No se pudieron cargar los tracks. Endpoint API no disponible." });
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const res = await fetch("/api/submissions");
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data);
      }
    } catch {
      console.error("Failed to fetch submissions");
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {
      console.error("Failed to fetch notifications");
    }
  };

  const fetchArtists = async () => {
    try {
      const res = await fetch("/api/artists");
      if (res.ok) {
        const data = await res.json();
        setArtists(data.artists || []);
      }
    } catch {
      console.error("Error fetching artists");
    }
  };

  const handleEdit = (track: AdminTrack) => {
    setEditingTrack(track);
    setFormData({
      title: track.title,
      release_type: track.release_type,
      release_date: track.release_date,
      duration: track.duration,
      cover_image: track.cover_image,
      audio_preview_url: track.audio_preview_url,
      spotify_url: track.spotify_url || "",
      youtube_video_id: track.youtube_video_id || "",
      lyrics: track.lyrics || "",
    });
  };

  //

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    try {
      if (!editingTrack) return;
      const method = "PUT";
      const body = { ...formData, id: editingTrack.id };

      const res = await fetch("/api/tracks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Track actualizado exitosamente" });
        setEditingTrack(null);
        fetchTracks();
      } else {
        setMessage({ type: "error", text: "Error al guardar el track" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión con la API" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este track?")) return;

    try {
      const res = await fetch(`/api/tracks?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setMessage({ type: "success", text: "Track eliminado" });
        fetchTracks();
      }
    } catch {
      setMessage({ type: "error", text: "Error al eliminar" });
    }
  };

  const handleSubmissionAction = async (submissionId: string, status: "approved" | "rejected", notes?: string) => {
    setActionLoading(submissionId);
    setMessage(null);

    try {
      const res = await fetch(`/api/submissions?id=${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_notes: notes }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: `Submission ${status}` });
        fetchSubmissions();
        setViewingSubmission(null);
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.error || "Error al actualizar" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setActionLoading(null);
    }
  };

  const parseTrackData = (trackData: string): SubmissionTrackData => {
    try {
      return JSON.parse(trackData);
    } catch {
      return {
        title: "",
        artist_name: "",
        release_type: "",
        release_date: "",
        duration: "",
        cover_image: "",
        audio_preview_url: "",
        spotify_url: null,
        youtube_video_id: null,
        lyrics: "",
        production_details: { daw: null, guitars: null, effects_chain: null, tuning: null, key: null },
      };
    }
  };

  const statusColors = {
    pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700",
    approved: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700",
    rejected: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700",
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              🛠️ Panel de Administración
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Gestiona el catálogo y revisa envíos de artistas
            </p>
          </div>
          //
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
          <nav className="flex gap-4" aria-label="Admin tabs">
            <button
              onClick={() => setActiveTab("tracks")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                activeTab === "tracks"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Tracks ({tracks.length})
            </button>
            <button
              onClick={() => setActiveTab("submissions")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                activeTab === "submissions"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Envíos ({submissions.filter(s => s.status === "pending").length} pendientes)
            </button>
            <button
              onClick={() => setActiveTab("notifications")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                activeTab === "notifications"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Notificaciones ({notifications.filter(n => !n.read).length} sin leer)
            </button>
            <button
              onClick={() => setActiveTab("artists")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                activeTab === "artists"
                  ? "bg-emerald-500 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Artistas ({artists.length})
            </button>
          </nav>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
              : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800"
          }`}>
            {message.type === "success" ? "✅" : "⚠️"} {message.text}
          </div>
        )}

        {/* Track Form */}
        {activeTab === "tracks" && editingTrack && (
          <div className="mb-8 p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
              {editingTrack ? "Editar Track" : "Nuevo Track"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Título *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo *</label>
                  <select
                    required
                    value={formData.release_type}
                    onChange={(e) => setFormData({ ...formData, release_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  >
                    <option>Single</option>
                    <option>EP</option>
                    <option>Album</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={formData.release_date}
                    onChange={(e) => setFormData({ ...formData, release_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Duración *</label>
                  <input
                    type="text"
                    required
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder="MM:SS"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL Portada</label>
                  <input
                    type="url"
                    value={formData.cover_image}
                    onChange={(e) => setFormData({ ...formData, cover_image: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL Audio Preview</label>
                  <input
                    type="url"
                    value={formData.audio_preview_url}
                    onChange={(e) => setFormData({ ...formData, audio_preview_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Spotify URL</label>
                  <input
                    type="url"
                    value={formData.spotify_url}
                    onChange={(e) => setFormData({ ...formData, spotify_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">YouTube Video ID</label>
                  <input
                    type="text"
                    value={formData.youtube_video_id}
                    onChange={(e) => setFormData({ ...formData, youtube_video_id: e.target.value })}
                    placeholder="ej: fJ9rUzIMcZQ"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Letra</label>
                <textarea
                  value={formData.lyrics}
                  onChange={(e) => setFormData({ ...formData, lyrics: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition"
                >
                  {editingTrack ? "Guardar Cambios" : "Crear Track"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTrack(null)}
                  className="px-6 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tracks Table */}
        {activeTab === "tracks" && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                Catálogo ({tracks.length} tracks)
              </h2>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400">Cargando tracks...</div>
            ) : tracks.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p>No hay tracks en el catálogo.</p>
                <p className="text-sm mt-2">Ejecuta <code className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">pnpm seed</code> para agregar tracks de ejemplo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Título</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Tipo</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Fecha</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Duración</th>
                      <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((track) => (
                      <tr key={track.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                              {track.cover_image ? (
                                <img src={track.cover_image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-lg">🎵</div>
                              )}
                            </div>
                            <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                              {safeString(track.title)}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{track.release_type}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{track.release_date}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{track.duration}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(track)}
                              className="px-2 py-1 rounded text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition"
                            >
                              ✏️ Editar
                            </button>
                            <button
                              onClick={() => handleDelete(track.id)}
                              className="px-2 py-1 rounded text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                            >
                              🗑️ Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Submissions Table */}
        {activeTab === "submissions" && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                Envíos de Artistas ({submissions.length} total)
              </h2>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400">Cargando envíos...</div>
            ) : submissions.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p>No hay envíos pendientes.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Título</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Artista</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Usuario</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Estado</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Fecha</th>
                      <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((sub) => {
                      const trackData = parseTrackData(sub.track_data);
                      return (
                        <tr key={sub.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                                {trackData.cover_image ? (
                                  <img src={trackData.cover_image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-lg">🎵</div>
                                )}
                              </div>
                              <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                                {safeString(trackData.title)}
                              </span>
                            </div>
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">{safeString(trackData.artist_name)}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{sub.user_id.slice(0, 8)}...</td>
                          <td className="p-3">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${statusColors[sub.status]}`}>
                              {sub.status === "pending" ? "⏳ Pendiente" : sub.status === "approved" ? "✅ Aprobado" : "❌ Rechazado"}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">
                            {new Date(sub.created_at).toLocaleDateString("es-ES")}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setViewingSubmission(sub)}
                                className="px-2 py-1 rounded text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition"
                              >
                                👁️ Ver
                              </button>
                              {sub.status === "pending" && (
                                <>
                                  <button
                                    onClick={() => handleSubmissionAction(sub.id, "approved")}
                                    disabled={actionLoading === sub.id}
                                    className="px-2 py-1 rounded text-xs font-semibold text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950 transition disabled:opacity-50"
                                  >
                                    ✅ Aprobar
                                  </button>
                                  <button
                                    onClick={() => {
                                      const notes = prompt("Notas de rechazo (opcional):");
                                      if (notes !== null) handleSubmissionAction(sub.id, "rejected", notes);
                                    }}
                                    disabled={actionLoading === sub.id}
                                    className="px-2 py-1 rounded text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition disabled:opacity-50"
                                  >
                                    ❌ Rechazar
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Notifications Table */}
        {activeTab === "notifications" && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                Notificaciones ({notifications.length} total)
              </h2>
              {notifications.some(n => !n.read) && (
                <button
                  onClick={async () => {
                    // Mark all as read
                    try {
                      const res = await fetch("/api/notifications/read-all", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                      });
                      if (res.ok) {
                        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                        setMessage({ type: "success", text: "Todas marcadas como leídas" });
                      }
                    } catch {
                      setMessage({ type: "error", text: "Error al marcar como leídas" });
                    }
                  }}
                  className="px-3 py-1 rounded text-xs font-semibold bg-slate-600 hover:bg-slate-500 text-white transition"
                >
                  Marcar todas como leídas
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400">Cargando notificaciones...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p>No hay notificaciones.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Tipo</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Título</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Mensaje</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Usuario</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Estado</th>
                      <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Fecha</th>
                      <th className="text-right p-3 font-semibold text-slate-700 dark:text-slate-300">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications.map((notif) => (
                      <tr key={notif.id} className={`border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition ${!notif.read ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                        <td className="p-3">
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700">
                            {notif.type}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{notif.title}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400 max-w-[300px] truncate">{notif.message}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{notif.user_id.slice(0, 8)}...</td>
                        <td className="p-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${!notif.read 
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700"}`}>
                            {!notif.read ? "🔵 Sin leer" : "✅ Leída"}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">
                          {new Date(notif.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!notif.read && (
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/notifications/read?id=${notif.id}`, { method: "POST" });
                                    if (res.ok) {
                                      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                                    }
                                  } catch {
                                    // silent fail
                                  }
                                }}
                                className="px-2 py-1 rounded text-xs font-semibold text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950 transition"
                              >
                                ✅ Leer
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm("¿Eliminar esta notificación?")) {
                                  // Could add delete API later
                                }
                              }}
                              className="px-2 py-1 rounded text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Artists Tab */}
        {activeTab === "artists" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Artistas ({artists.length})
              </h3>
            </div>

            {artists.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No hay artistas registrados.
              </div>
            ) : (
              <div className="space-y-3">
                {artists.map((artist) => (
                  <div
                    key={artist.id}
                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <div>
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">{artist.name}</h4>
                      <p className="text-sm text-slate-500">
                        {artist.genre || "Sin género"} • {artist.location || "Sin ubicación"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingArtist(artist);
                        setArtistForm({
                          name: artist.name,
                          biography: artist.biography || "",
                          press_text: artist.press_text || "",
                          press_highlights: artist.press_highlights?.join("\n") || "",
                          genre: artist.genre || "",
                          location: artist.location || "",
                          monthly_listeners: artist.monthly_listeners,
                        });
                      }}
                      className="px-3 py-1 text-sm text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition"
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario de edición de artista */}
            {editingArtist && (
              <div className="mt-6 p-6 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-semibold mb-4">Editar Artista: {editingArtist.name}</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const res = await fetch(`/api/artists?id=${editingArtist.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: artistForm.name,
                          biography: artistForm.biography || null,
                          press_text: artistForm.press_text || null,
                          press_highlights:
                            artistForm.press_highlights?.split("\n").filter((h) => h.trim()) || [],
                          genre: artistForm.genre || null,
                          location: artistForm.location || null,
                          monthly_listeners: artistForm.monthly_listeners,
                        }),
                      });
                      if (res.ok) {
                        setEditingArtist(null);
                        fetchArtists();
                        setMessage({ type: "success", text: "Artista actualizado correctamente" });
                      }
                    } catch {
                      setMessage({ type: "error", text: "Error al actualizar artista" });
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre *</label>
                    <input
                      type="text"
                      required
                      value={artistForm.name}
                      onChange={(e) =>
                        setArtistForm({ ...artistForm, name: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Género</label>
                    <input
                      type="text"
                      value={artistForm.genre}
                      onChange={(e) =>
                        setArtistForm({ ...artistForm, genre: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ubicación</label>
                    <input
                      type="text"
                      value={artistForm.location}
                      onChange={(e) =>
                        setArtistForm({ ...artistForm, location: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Biografía</label>
                    <textarea
                      value={artistForm.biography}
                      onChange={(e) =>
                        setArtistForm({ ...artistForm, biography: e.target.value })
                      }
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Texto de Prensa</label>
                    <textarea
                      value={artistForm.press_text}
                      onChange={(e) =>
                        setArtistForm({ ...artistForm, press_text: e.target.value })
                      }
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Destacados de Prensa</label>
                    <textarea
                      value={artistForm.press_highlights}
                      onChange={(e) =>
                        setArtistForm({ ...artistForm, press_highlights: e.target.value })
                      }
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Orejas Mensuales</label>
                    <input
                      type="number"
                      value={artistForm.monthly_listeners}
                      onChange={(e) =>
                        setArtistForm({ ...artistForm, monthly_listeners: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="px-6 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingArtist(null);
                        setArtistForm({
                          name: "",
                          biography: "",
                          press_text: "",
                          press_highlights: "",
                          genre: "",
                          location: "",
                          monthly_listeners: 0,
                        });
                      }}
                      className="px-6 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Submission Detail Modal */}
        {viewingSubmission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setViewingSubmission(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Detalle del Envío</h2>
                <button onClick={() => setViewingSubmission(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none">×</button>
              </div>
              <div className="p-6 space-y-4">
                {(() => {
                  const trackData = parseTrackData(viewingSubmission.track_data);
                  return (
                    <>
                      <div className="flex items-center gap-4">
                        <img src={trackData.cover_image} alt="" className="w-24 h-24 rounded-lg object-cover" />
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{trackData.title}</h3>
                          <p className="text-slate-600 dark:text-slate-400">{trackData.artist_name}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-500">Usuario: {viewingSubmission.user_id.slice(0, 8)}...</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div><span className="font-medium text-slate-700 dark:text-slate-300">Tipo: </span>{trackData.release_type}</div>
                        <div><span className="font-medium text-slate-700 dark:text-slate-300">Fecha: </span>{trackData.release_date}</div>
                        <div><span className="font-medium text-slate-700 dark:text-slate-300">Duración: </span>{trackData.duration}</div>
                        <div><span className="font-medium text-slate-700 dark:text-slate-300">Estado: </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[viewingSubmission.status]}`}>
                            {viewingSubmission.status === "pending" ? "Pendiente" : viewingSubmission.status === "approved" ? "Aprobado" : "Rechazado"}
                          </span>
                        </div>
                        {trackData.spotify_url && <div><span className="font-medium text-slate-700 dark:text-slate-300">Spotify: </span><a href={trackData.spotify_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Ver</a></div>}
                        {trackData.youtube_video_id && <div><span className="font-medium text-slate-700 dark:text-slate-300">YouTube: </span>{trackData.youtube_video_id}</div>}
                      </div>
                      {trackData.lyrics && (
                        <div>
                          <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Letra</h4>
                          <pre className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg max-h-60 overflow-auto">{trackData.lyrics}</pre>
                        </div>
                      )}
                      {viewingSubmission.admin_notes && (
                        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                          <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-1">Notas del Admin</h4>
                          <p className="text-amber-700 dark:text-amber-400">{viewingSubmission.admin_notes}</p>
                        </div>
                      )}
                      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                        {viewingSubmission.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleSubmissionAction(viewingSubmission.id, "approved")}
                              className="flex-1 px-4 py-2 rounded-lg font-semibold bg-green-600 text-white hover:bg-green-500 transition"
                            >
                              ✅ Aprobar
                            </button>
                            <button
                              onClick={() => {
                                const notes = prompt("Notas de rechazo (opcional):");
                                if (notes !== null) handleSubmissionAction(viewingSubmission.id, "rejected", notes);
                              }}
                              className="flex-1 px-4 py-2 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-500 transition"
                            >
                              ❌ Rechazar
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setViewingSubmission(null)}
                          className="flex-1 px-4 py-2 rounded-lg font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                        >
                          Cerrar
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}