"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageTransition } from "@/components/MotionWrappers";
import { useAuth } from "@/context/AuthContext";
import { parseYouTubeChapters, parseISO8601Duration, secondsToTimestamp, type YouTubeChapter } from "@/lib/youtube";
import { ITunesSearch } from "@/components/ITunesSearch";

type ReleaseType = "single" | "ep" | "album";

interface TrackInput {
  title: string;
  duration: string;
  isrc: string;
  // P3.27: YouTube timestamps
  start_time: number;
  end_time: number;
}

import { getYouTubeThumbnail } from "@/lib/null-safe";

export default function NewReleasePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [artistProfileLoading, setArtistProfileLoading] = useState(true);
  const [artistProfileError, setArtistProfileError] = useState<string | null>(null);

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

const handleYouTubeUrlChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setForm(prev => ({ ...prev, youtube_url: url }));
    if (url) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        // Always set thumbnail as fallback
        if (!form.cover_image) {
          const thumbnail = getYouTubeThumbnail(videoId, "maxres") || "";
          setForm((prev) => ({ ...prev, cover_image: thumbnail }));
        }

        // Fetch full metadata from YouTube API
        try {
          const res = await fetch(`/api/youtube?id=${videoId}`);
          if (res.ok) {
            const data = await res.json();
            setForm((prev) => {
              const updates: Record<string, string> = {};

              // Auto-fill cover image from YouTube thumbnails if not set
              if (!prev.cover_image && data.thumbnails) {
                const maxRes = data.thumbnails.maxres?.url
                  || data.thumbnails.standard?.url
                  || data.thumbnails.high?.url
                  || data.thumbnails.medium?.url
                  || getYouTubeThumbnail(videoId, "maxres")
                  || "";
                updates.cover_image = maxRes;
              }

              // Auto-fill release date from publishedAt (always update, no guard)
              updates.release_date = data.publishedAt ? data.publishedAt.substring(0, 10) : "";

              // Auto-fill first track title from YouTube video title if track title is empty
              if (data.title && tracks.length > 0 && !tracks[0].title) {
                setTracks(prevTracks => prevTracks.map((track, index) =>
                  index === 0 ? { ...track, title: data.title } : track
                ));
              }

              return { ...prev, ...updates };
            });

            // Auto-fill first track duration (format seconds as MM:SS)
            if (data.durationSeconds && tracks.length > 0) {
              const totalSec = Math.round(data.durationSeconds);
              const minutes = Math.floor(totalSec / 60);
              const seconds = totalSec % 60;
              const formatted = `${minutes}:${seconds.toString().padStart(2, "0")}`;
              updateTrack(0, "duration", formatted);
            }
          }
        } catch (error) {
          console.error("Error fetching YouTube metadata:", error);
          setMessage({ type: "error", text: "Error al obtener metadatos de YouTube" });
        }
      }
    }
  };

  const handleITunesSelect = (track: any) => {
    setForm(prev => ({
      ...prev,
      title: prev.title || track.trackName,
      artist_name: prev.artist_name || track.artistName,
      cover_image: prev.cover_image || track.artworkUrl600 || "",
      genre: prev.genre || track.primaryGenreName || "",
      release_date: prev.release_date || (track.releaseDate ? track.releaseDate.substring(0, 10) : ""),
      apple_music_url: prev.apple_music_url || `https://music.apple.com/us/album/${track.trackId}`,
    }));
    // Auto-fill duration
    if (track.trackTimeMillis) {
      const totalSec = Math.round(track.trackTimeMillis / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      updateTrack(0, "duration", `${min}:${sec.toString().padStart(2, "0")}`);
    }
  };

  const [tracks, setTracks] = useState<TrackInput[]>([{ title: "", duration: "", isrc: "", start_time: 0, end_time: 0 }]);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") {
      setArtistProfileLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/artists/me");
        if (!res.ok) throw new Error("Perfil no encontrado");
        const data = await res.json();
        if (!data?.name) throw new Error("Perfil sin nombre");
        if (cancelled) return;
        setForm((prev) => ({ ...prev, artist_name: data.name }));
      } catch {
        if (!cancelled) {
          setArtistProfileError("No se pudo cargar tu perfil de artista. Crea tu perfil para poder crear releases.");
        }
      } finally {
        if (!cancelled) setArtistProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading || !user) return null;

  const addTrack = () => setTracks([...tracks, { title: "", duration: "", isrc: "", start_time: 0, end_time: 0 }]);
  const removeTrack = (index: number) => setTracks(tracks.filter((_, i) => i !== index));
  const updateTrack = (index: number, field: keyof TrackInput, value: string) => {
    const newTracks = [...tracks];
    (newTracks[index] as any)[field] = value;
    setTracks(newTracks);
  };

  // P3.27: Detect chapters from YouTube video
  const detectChapters = async () => {
    const videoId = extractYouTubeId(form.youtube_url);
    if (!videoId) {
      setMessage({ type: "error", text: "URL de YouTube no válida" });
      return;
    }

    setChaptersLoading(true);
    try {
      const res = await fetch(`/api/youtube?id=${videoId}`);
      if (!res.ok) {
        throw new Error("No se pudo obtener información del video");
      }

      const videoData = await res.json();
      const description = videoData.description || "";
      const durationSeconds = videoData.durationSeconds || parseISO8601Duration(videoData.duration || "PT0S");

      const chapters = parseYouTubeChapters(description, durationSeconds);

      if (chapters.length === 0) {
        setMessage({ type: "error", text: "No se detectaron chapters en la descripción del video" });
        return;
      }

      // Convert chapters to track inputs
      const newTracks: TrackInput[] = chapters.map((chapter) => ({
        title: chapter.title,
        duration: secondsToTimestamp(chapter.endTime - chapter.startTime),
        isrc: "",
        start_time: chapter.startTime,
        end_time: chapter.endTime,
      }));

      setTracks(newTracks);
      setMessage({ type: "success", text: `${chapters.length} chapters detectados y agregados como tracks` });
    } catch (error) {
      console.error("Error detecting chapters:", error);
      setMessage({ type: "error", text: "Error al detectar chapters" });
    } finally {
      setChaptersLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent, submitForReview = false) => {
    e.preventDefault();
    if (artistProfileLoading || artistProfileError) {
      setMessage({ type: "error", text: artistProfileError || "Cargando tu perfil de artista..." });
      return;
    }
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
              {user.role === "admin" ? (
                <input
                  type="text"
                  required
                  value={form.artist_name}
                  onChange={(e) => setForm({ ...form, artist_name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  placeholder="Nombre del artista"
                />
              ) : (
                <>
                  <input
                    type="text"
                    required
                    readOnly
                    value={form.artist_name}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-not-allowed"
                    placeholder={artistProfileLoading ? "Cargando tu perfil..." : "Nombre del artista"}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Se usa el nombre de tu perfil de artista.</p>
                </>
              )}
              {artistProfileError && (
                <div className="mt-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 text-sm text-red-700 dark:text-red-300">
                  {artistProfileError}
                </div>
              )}
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

            {/* Buscar en iTunes */}
            <div>
              <ITunesSearch onSelect={handleITunesSelect} placeholder="Buscar en iTunes" />
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
                {/* P3.27: Detect chapters button */}
                {form.youtube_url && (
                  <button
                    type="button"
                    onClick={detectChapters}
                    disabled={chaptersLoading}
                    className="mt-2 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors disabled:opacity-50"
                  >
                    {chaptersLoading ? "⏳ Detectando..." : "🎯 Detectar chapters"}
                  </button>
                )}
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
                    {/* P3.27: Show timestamps for YouTube chapters */}
                    {track.start_time > 0 && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{secondsToTimestamp(track.start_time)}</span>
                        <span>—</span>
                        <span className="font-mono">{secondsToTimestamp(track.end_time)}</span>
                      </div>
                    )}
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
                disabled={loading || artistProfileLoading || !!artistProfileError}
                className="px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-semibold transition disabled:opacity-50"
              >
                {loading ? "Guardando..." : "Guardar como borrador"}
              </button>
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={loading || artistProfileLoading || !!artistProfileError}
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
