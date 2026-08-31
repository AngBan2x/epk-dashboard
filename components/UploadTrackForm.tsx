"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  artistId: number;
  collectionName: string;
  artworkUrl100: string;
  artworkUrl600: string;
  previewUrl: string | null;
  trackTimeMillis: number;
  primaryGenreName: string;
  releaseDate: string;
}

interface FormData {
  title: string;
  artist_name: string;
  release_type: string;
  release_date: string;
  duration: string;
  cover_image: string;
  audio_preview_url: string;
  spotify_url: string;
  youtube_video_id: string;
  lyrics: string;
  production_details: {
    daw: string;
    guitars: string;
    effects_chain: string;
    tuning: string;
    key: string;
  };
}

const RELEASE_TYPES = ["Single", "EP", "Album", "Compilation"];

const DEFAULT_FORM_DATA: FormData = {
  title: "",
  artist_name: "",
  release_type: "Single",
  release_date: "",
  duration: "",
  cover_image: "",
  audio_preview_url: "",
  spotify_url: "",
  youtube_video_id: "",
  lyrics: "",
  production_details: {
    daw: "",
    guitars: "",
    effects_chain: "",
    tuning: "",
    key: "",
  },
};

export function UploadTrackForm() {
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ITunesTrack[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<ITunesTrack | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  const searchTracks = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/itunes-search?term=${encodeURIComponent(query)}&limit=10`);
      const data = await response.json();
      if (data.results) {
        setSearchResults(data.results);
        setShowResults(true);
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchTracks(searchQuery);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchTracks]);

  const handleTrackSelect = (track: ITunesTrack) => {
    const minutes = Math.floor(track.trackTimeMillis / 60000);
    const seconds = Math.floor((track.trackTimeMillis % 60000) / 1000);
    const duration = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    setFormData((prev) => ({
      ...prev,
      title: track.trackName,
      artist_name: track.artistName,
      cover_image: track.artworkUrl600,
      audio_preview_url: track.previewUrl || "",
      release_date: track.releaseDate?.split("T")[0] || "",
      duration,
    }));
    setSelectedTrack(track);
    setSearchQuery(`${track.trackName} - ${track.artistName}`);
    setSearchResults([]);
    setShowResults(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.startsWith("production_details.")) {
      const field = name.replace("production_details.", "");
      setFormData((prev) => ({
        ...prev,
        production_details: { ...prev.production_details, [field]: value },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      // Get session from cookie
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        throw new Error("Usuario no autenticado");
      }
      const user = await response.json();

      const submitResponse = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({ track_data: formData }),
      });

      if (!submitResponse.ok) {
        const error = await submitResponse.json();
        throw new Error(error.error || "Error al enviar");
      }

      setSubmitStatus("success");
      setFormData(DEFAULT_FORM_DATA);
      setSelectedTrack(null);
      setSearchQuery("");
    } catch (error) {
      setSubmitStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
      setShowResults(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-8">Subir Nuevo Track</h1>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        {/* Búsqueda iTunes con Autocomplete */}
        <div>
          <label htmlFor="itunes-search" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Buscar en iTunes (Autocompletar)
          </label>
          <div className="relative">
            <input
              ref={searchInputRef}
              id="itunes-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowResults(searchResults.length > 0)}
              placeholder="Buscar canción, artista o álbum..."
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              autoComplete="off"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>
          {selectedTrack && (
            <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-300">
                Seleccionado: <strong>{selectedTrack.trackName}</strong> - {selectedTrack.artistName}
              </p>
            </div>
          )}

          {/* Dropdown Results */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-auto">
              {searchResults.map((track) => (
                <button
                  key={track.trackId}
                  type="button"
                  onClick={() => handleTrackSelect(track)}
                  className="w-full px-4 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors"
                >
                  <img
                    src={track.artworkUrl100}
                    alt=""
                    className="w-12 h-12 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{track.trackName}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{track.artistName}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{track.collectionName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Información Básica */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Título *
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={formData.title}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="artist_name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Artista *
            </label>
            <input
              id="artist_name"
              name="artist_name"
              type="text"
              value={formData.artist_name}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="release_type" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tipo de Lanzamiento *
            </label>
            <select
              id="release_type"
              name="release_type"
              value={formData.release_type}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {RELEASE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="release_date" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Fecha de Lanzamiento *
            </label>
            <input
              id="release_date"
              name="release_date"
              type="date"
              value={formData.release_date}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Duración (MM:SS) *
            </label>
            <input
              id="duration"
              name="duration"
              type="text"
              value={formData.duration}
              onChange={handleInputChange}
              placeholder="3:45"
              required
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="cover_image" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              URL Portada *
            </label>
            <input
              id="cover_image"
              name="cover_image"
              type="url"
              value={formData.cover_image}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {formData.cover_image && (
              <img src={formData.cover_image} alt="Preview" className="mt-2 h-20 w-20 object-cover rounded border border-slate-300 dark:border-slate-600" />
            )}
          </div>

          <div className="md:col-span-2">
            <label htmlFor="audio_preview_url" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              URL Preview Audio *
            </label>
            <input
              id="audio_preview_url"
              name="audio_preview_url"
              type="url"
              value={formData.audio_preview_url}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Enlaces Opcionales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-200 dark:border-slate-700 pt-6">
          <div>
            <label htmlFor="spotify_url" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Spotify URL
            </label>
            <input
              id="spotify_url"
              name="spotify_url"
              type="url"
              value={formData.spotify_url}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="youtube_video_id" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              YouTube Video ID
            </label>
            <input
              id="youtube_video_id"
              name="youtube_video_id"
              type="text"
              value={formData.youtube_video_id}
              onChange={handleInputChange}
              placeholder="dQw4w9WgXcQ"
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Producción (Opcional) */}
        <fieldset className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <legend className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Detalles de Producción (Opcional)</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="daw" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">DAW</label>
              <input id="daw" name="production_details.daw" type="text" value={formData.production_details.daw} onChange={handleInputChange} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label htmlFor="guitars" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Guitarras</label>
              <input id="guitars" name="production_details.guitars" type="text" value={formData.production_details.guitars} onChange={handleInputChange} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label htmlFor="effects_chain" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cadena de Efectos</label>
              <input id="effects_chain" name="production_details.effects_chain" type="text" value={formData.production_details.effects_chain} onChange={handleInputChange} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label htmlFor="tuning" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Afinación</label>
              <input id="tuning" name="production_details.tuning" type="text" value={formData.production_details.tuning} onChange={handleInputChange} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label htmlFor="key" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tonalidad</label>
              <input id="key" name="production_details.key" type="text" value={formData.production_details.key} onChange={handleInputChange} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>
        </fieldset>

        {/* Letra (Opcional) */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <label htmlFor="lyrics" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Letra (Opcional)
          </label>
          <textarea
            id="lyrics"
            name="lyrics"
            value={formData.lyrics}
            onChange={handleInputChange}
            rows={6}
            className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            placeholder="Pega la letra aquí..."
          />
        </div>

        {/* Status Messages */}
        {submitStatus === "success" && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-300">
            ✅ Track enviado correctamente. Pendiente de revisión por el admin.
          </div>
        )}
        {submitStatus === "error" && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-300">
            ❌ {errorMessage}
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="submit"
            disabled={isSubmitting || !formData.title || !formData.artist_name}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Enviando...
              </span>
            ) : (
              "Enviar para Revisión"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}