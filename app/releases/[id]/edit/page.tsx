"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageTransition } from "@/components/MotionWrappers";
import { useAuth } from "@/context/AuthContext";
import { extractYouTubeId, getYouTubeThumbnail, fetchYouTubeVideo } from "@/lib/youtube";
import type { ReleaseStatus } from "@/types/music";

type ReleaseType = "single" | "ep" | "album";

interface TrackInput {
  title: string;
  duration: string;
  isrc: string;
}

export default function EditReleasePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const releaseId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [releaseData, setReleaseData] = useState<any>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);

  const [form, setForm] = useState({
    type: "single" as ReleaseType,
    title: "",
    artist_name: "",
    release_date: "",
    genre: "",
    cover_image: "",
    description: "",
    duration: "",
    spotify_url: "",
    apple_music_url: "",
    youtube_url: "",
    status: "draft" as ReleaseStatus,
  });

  const [tracks, setTracks] = useState<TrackInput[]>([{ title: "", duration: "", isrc: "" }]);

  // Fetch release data on mount
  useEffect(() => {
    const fetchRelease = async () => {
      try {
        const res = await fetch(`/api/releases?id=${releaseId}`);
        if (res.ok) {
          const data = await res.json();
          setReleaseData(data);
          setForm({
            type: data.type || "single",
            title: data.title || "",
            artist_name: data.artist_name || "",
            release_date: data.release_date || "",
            genre: data.genre || "",
            cover_image: data.cover_image || "",
            description: data.description || "",
            duration: data.duration || "",
            spotify_url: data.external_links?.spotify || "",
            apple_music_url: data.external_links?.apple_music || "",
            youtube_url: data.external_links?.youtube || "",
            status: data.status || "draft",
          });
          if (data.tracks) {
            setTracks(data.tracks.map((t: any) => ({
              title: t.title,
              duration: t.duration,
              isrc: t.isrc || "",
            })));
          }
        }
      } catch (error) {
        console.error("Error fetching release:", error);
      }
    };
    fetchRelease();
  }, [releaseId]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Redirect if not owner/admin
  useEffect(() => {
    if (releaseData && user && releaseData.artist_id !== user.id && user.role !== "admin") {
      router.push("/dashboard");
    }
  }, [releaseData, user, router]);

  if (authLoading || !user || (releaseData && releaseData.artist_id !== user.id && user.role !== "admin")) {
    return null;
  }

  // Auto-extract YouTube video ID and generate thumbnail + fetch metadata
  const extractYouTubeId = (url: string): string | null => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  };

  const handleYouTubeUrlChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setForm({ ...form, youtube_url: url });
    if (url && !form.cover_image) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        const thumbnail = getYouTubeThumbnail(videoId, "maxresdefault") || "";
        setForm({ ...form, cover_image: thumbnail });
      }
    }
    
    // Auto-fetch YouTube metadata
    const videoId = extractYouTubeId(url);
    if (videoId && (!form.title || !form.duration)) {
      setYoutubeLoading(true);
      try {
        const videoData = await fetchYouTubeVideo(videoId);
        if (videoData) {
          setForm(prev => ({
            ...prev,
            title: prev.title || videoData.title,
            duration: prev.duration || videoData.duration,
            cover_image: prev.cover_image || getYouTubeThumbnail(videoId, "maxresdefault"),
            description: prev.description || videoData.description,
          }));
        }
      } catch (error) {
        console.error("Error fetching YouTube video:", error);
      } finally {
        setYoutubeLoading(false);
      }
    }
  };

  const addTrack = () => setTracks([...tracks, { title: "", duration: "", isrc: "" }]);
  const removeTrack = (index: number) => setTracks(tracks.filter((_, i) => i !== index));
  const updateTrack = (index: number, field: keyof TrackInput, value: string) => {
    const newTracks = [...tracks];
    newTracks[index][field] = value;
    setTracks(newTracks);
  };

  const handleSubmit = async (e: React.FormEvent, submitForReview = false) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const videoId = extractYouTubeId(form.youtube_url);
    const status = submitForReview ? "pending" : form.status;

    try {
      const res = await fetch(`/api/releases?id=${releaseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          status,
          artist_id: user?.id,
          tracks: tracks.filter((t) => t.title),
          external_links: {
            spotify: form.spotify_url,
            apple_music: form.apple_music_url,
            youtube: form.youtube_url,
            youtube_video_id: videoId,
          },
        }),
      });

      if (res.ok) {
        const msg = submitForReview ? "Release enviado para revisión" : "Release actualizado exitosamente";
        setMessage({ type: "success", text: msg });
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.error || "Error al actualizar release" });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <PageTransition>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">Editar Release</h1>

          {message && (
            <div className={`mb-6 p-4 rounded-lg ${message.type === "success" ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Release Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Release *</label>
              <div className="flex gap-2">
                {(["single", "ep", "album"] as ReleaseType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm({ ...form, type })}
                    className={`flex-1 px-4 py-2 rounded-lg border font-medium transition ${
                      form.type === type
                        ? "bg-primary-600 text-white border-primary-600"
                        : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-primary-300"
                    }`}
                  >
                    {type === "single" ? "Single" : type === "ep" ? "EP" : "Álbum"}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Título *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                placeholder="Nombre del release"
              />
            </div>

            {/* Artist Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre del Artista *</label>
              <input
                type="text"
                required
                value={form.artist_name}
                onChange={(e) => setForm({ ...form, artist_name: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                placeholder="Nombre del artista"
              />
            </div>

            {/* Release Date & Genre */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha de Lanzamiento *</label>
                <input
                  type="date"
                  required
                  value={form.release_date}
                  onChange={(e) => setForm({ ...form, release_date: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Género</label>
                <input
                  type="text"
                  value={form.genre}
                  onChange={(e) => setForm({ ...form, genre: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  placeholder="Rock, Pop, etc."
                />
              </div>
            </div>

            {/* Cover Image */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL de Portada *</label>
              <input
                type="url"
                required
                value={form.cover_image}
                onChange={(e) => setForm({ ...form, cover_image: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                placeholder="https://..."
              />
              {youtubeLoading && <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">Obteniendo metadatos de YouTube...</p>}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descripción</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                placeholder="Descripción del release..."
              />
            </div>

            {/* External Links */}
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Links Externos</h3>
              <div className="space-y-3">
                <input
                  type="url"
                  value={form.spotify_url}
                  onChange={(e) => setForm({ ...form, spotify_url: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  placeholder="Spotify URL"
                />
                <input
                  type="url"
                  value={form.apple_music_url}
                  onChange={(e) => setForm({ ...form, apple_music_url: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  placeholder="Apple Music URL"
                />
                <input
                  type="url"
                  value={form.youtube_url}
                  onChange={handleYouTubeUrlChange}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  placeholder="YouTube URL"
                />
              </div>
            </div>

            {/* Tracks */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Tracks</h3>
                <button type="button" onClick={addTrack} className="text-sm text-amber-600 hover:text-amber-700">+ Agregar track</button>
              </div>
              <div className="space-y-3">
                {tracks.map((track, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={track.title}
                      onChange={(e) => updateTrack(index, "title", e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                      placeholder={`Track ${index + 1}`}
                    />
                    <input
                      type="text"
                      value={track.duration}
                      onChange={(e) => updateTrack(index, "duration", e.target.value)}
                      className="w-20 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                      placeholder="3:45"
                    />
                    <input
                      type="text"
                      value={track.isrc}
                      onChange={(e) => updateTrack(index, "isrc", e.target.value)}
                      className="w-32 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                      placeholder="ISRC"
                    />
                    {tracks.length > 1 && (
                      <button type="button" onClick={() => removeTrack(index)} className="p-2 text-red-500 hover:text-red-600">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Status Display */}
            {releaseData && (
              <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Estado actual:</span>
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${
                    form.status === "draft" ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" :
                    form.status === "pending" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300" :
                    form.status === "approved" ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" :
                    "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                  }`}>
                    {form.status === "draft" ? "📝 Borrador" :
                     form.status === "pending" ? "⏳ Pendiente de revisión" :
                     form.status === "approved" ? "✅ Aprobado" :
                     "❌ Rechazado"}
                  </span>
                </div>
                {form.status === "rejected" && releaseData.admin_notes && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    Motivo: {releaseData.admin_notes}
                  </p>
                )}
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Guardando..." : "Guardar Cambios"}
              </button>
              {(form.status === "draft" || form.status === "rejected") && (
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Enviando..." : "Enviar para revisión"}
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="flex-1 px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600"
              >
                Cancelar
              </button>
            </div>
          </form>
        </PageTransition>
      </main>
    </div>
  );
}
