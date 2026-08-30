"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { safeString } from "@/lib/null-safe";
import type { Track } from "@/types/music";

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

export default function AdminPage() {
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTrack, setEditingTrack] = useState<AdminTrack | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
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

  useEffect(() => {
    fetchTracks();
  }, []);

  const fetchTracks = async () => {
    try {
      const res = await fetch("/api/tracks");
      if (res.ok) {
        const data = await res.json();
        setTracks(data.tracks || []);
      }
    } catch {
      // Fallback: load from a mock endpoint
      setMessage({ type: "error", text: "No se pudieron cargar los tracks. Endpoint API no disponible." });
    } finally {
      setLoading(false);
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
    setShowNewForm(false);
  };

  const handleNew = () => {
    setEditingTrack(null);
    setFormData({
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
    setShowNewForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    try {
      const method = editingTrack ? "PUT" : "POST";
      const body = editingTrack ? { ...formData, id: editingTrack.id } : formData;

      const res = await fetch("/api/tracks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage({ type: "success", text: editingTrack ? "Track actualizado exitosamente" : "Track creado exitosamente" });
        setEditingTrack(null);
        setShowNewForm(false);
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
              Gestiona el catálogo de tracks, letras y métricas
            </p>
          </div>
          <button
            onClick={handleNew}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white transition"
          >
            + Nuevo Track
          </button>
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

        {/* Form */}
        {(showNewForm || editingTrack) && (
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
                  className="px-6 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white transition"
                >
                  {editingTrack ? "Guardar Cambios" : "Crear Track"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingTrack(null); setShowNewForm(false); }}
                  className="px-6 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tracks Table */}
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
                            className="px-2 py-1 rounded text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950 transition"
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
      </main>
    </div>
  );
}
