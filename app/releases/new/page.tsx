"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageTransition } from "@/components/MotionWrappers";
import { useAuth } from "@/context/AuthContext";

type ReleaseType = "single" | "ep" | "album";

interface TrackInput {
  title: string;
  duration: string;
  isrc: string;
}

import { getYouTubeThumbnail } from "@/lib/null-safe";

export default function NewReleasePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = useState({
    type: "single" as ReleaseType,
    title: "",
    artist_name: "",
    release_date: "",
    genre: "",
    cover_image: "",
    description: "",
    spotify_url: "",
    apple_music_url: "",
    youtube_url: "",
  });

  // Auto-extract YouTube video ID and generate thumbnail
  const extractYouTubeId = (url: string): string | null => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  };

  const handleYouTubeUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setForm({ ...form, youtube_url: url });
    if (url && !form.cover_image) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        const thumbnail = getYouTubeThumbnail(videoId, "maxres") || "";
        setForm({ ...form, cover_image: thumbnail });
      }
    }
  };

  const [tracks, setTracks] = useState<TrackInput[]>([{ title: "", duration: "", isrc: "" }]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

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

    const videoId = extractYouTubeId(form.youtube_url) || undefined;

    try {
      const res = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          artist_id: user?.id,
          tracks: tracks.filter((t) => t.title),
          external_links: {
            spotify: form.spotify_url,
            apple_music: form.apple_music_url,
            youtube: form.youtube_url,
            youtube_video_id: videoId,
          },
          status: submitForReview ? "pending" : "draft",
        }),
      });

      if (res.ok) {
        const msg = submitForReview ? "Release enviado para revisión" : "Release guardado como borrador";
        setMessage({ type: "success", text: msg });
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        setMessage({ type: "error", text: "Error al crear release" });
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
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">Nuevo Release</h1>

          {message && (
            <div className={`mb-6 p-4 rounded-lg ${message.type === "success" ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Release Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de Release *</label>
              <div className="flex gap-3">
                {(["single", "ep", "album"] as ReleaseType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm({ ...form, type })}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                      form.type === type
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                        : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-400"
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
            <div className="grid grid-cols-2 gap-4">
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
                    {tracks.length > 1 && (
                      <button type="button" onClick={() => removeTrack(index)} className="p-2 text-red-500 hover:text-red-600">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-semibold transition disabled:opacity-50"
              >
                {loading ? "Guardando..." : "Guardar como borrador"}
              </button>
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={loading}
                className="px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition disabled:opacity-50"
              >
                {loading ? "Enviando..." : "Enviar para revisión"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
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
