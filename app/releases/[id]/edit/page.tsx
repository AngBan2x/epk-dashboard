"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageTransition } from "@/components/MotionWrappers";
import { useAuth } from "@/context/AuthContext";
import { extractYouTubeId, getYouTubeThumbnail, fetchYouTubeVideo } from "@/lib/youtube";
import { capitalizeReleaseType } from "@/lib/null-safe";
import {
  PRODUCTION_FIELDS,
  PRODUCTION_INPUT_CLASS,
  PRODUCTION_CREDITS_LABEL,
  PRODUCTION_CREDITS_PLACEHOLDER,
  type ProductionFieldKey,
} from "@/lib/production-fields";
import type { ReleaseStatus } from "@/types/music";
import { ITunesSearch } from "@/components/ITunesSearch";

type ReleaseType = "single" | "ep" | "album";

interface TrackInput {
  title: string;
  duration: string;
  isrc: string;
  start_time: number;
  end_time: number;
  /** M0: numero de pista dentro del disco. null = sin numerar. */
  track_number: number | null;
}

/**
 * C3 — **un solo botón**, y su etiqueta **es** la consecuencia.
 *
 * Antes coexistían dos controles en el mismo formulario: uno que **guardaba**
 * ("Guardar cambios", "Actualizar publicación") y otro que **despublicaba**
 * ("Enviar para revisión (retira del catálogo)"). Dos botones para decidir si el
 * release se guarda o se retira, sin jerarquía entre ellos: el que guardaba y el
 * que desaparecía del catálogo tenían el mismo peso visual.
 *
 * Ahora hay uno, y el texto dice qué va a pasar:
 *
 *   borrador              → "Publicar"                 entra en revisión
 *   aprobado              → "Actualizar publicación"  sigue publicado
 *   pendiente / rechazado → "Enviar para revisión"    entra en revisión
 *
 * El estado es lo único que decide, así que la etiqueta y la operación no pueden
 * separarse: `primaryLabel` y `primaryIntent` son la misma tabla partida en dos, y
 * un test ata que no se puedan contradecir.
 *
 * ## Lo que se pierde, y por qué se acepta
 *
 * El botón secundario era el **único** camino del artista para retirar del
 * catálogo un release ya aprobado. Ya no existe desde aquí. Queda el camino del
 * admin (`POST /api/admin/approvals/[id]` → `rejected`), que además te da el
 * motivo escrito y la cola de revisión: es más lento, y es la razón por la que
 * esta decisión está escrita aquí y no en un commit.
 *
 * Y con él se cae la confirmación de `window.confirm` que lo protegía
 * (`handleSubmit` la tenía). No es que se haya eliminado un cuidado: es que la
 * combinación que la disparaba —intención "request" sobre un `approved`— ya no
 * es alcanzable desde este formulario.
 */
function primaryLabel(status: ReleaseStatus): string {
  switch (status) {
    case "draft":
      return "Publicar";
    case "approved":
      return "Actualizar publicación";
    default:
      return "Enviar para revisión";
  }
}

/**
 * La Intención que corresponde a `primaryLabel`. `submitState` es lo que se manda
 * y es SIEMPRE una Intención —nunca el estado que devuelve el servidor—:
 *
 *   - `save`    → el servidor conserva el estado vigente (ver
 *                 `app/api/releases/route.ts`, Tarea 1).
 *   - `request` → `pending`: entrar en la cola de revisión.
 *
 * Para `pending` la operación es idempotente: ya está en la cola, y volver a
 * pedirla no cambia nada. Es lo que hace que la etiqueta pueda ser la misma en
 * `pending` y en `rejected` sin mentir en ninguno de los dos.
 */
function primaryIntent(status: ReleaseStatus): "save" | "request" {
  return status === "approved" ? "save" : "request";
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

  /**
   * RC.32 — `status` sale del estado del formulario. Antes vivía en `form` y se
   * reenviaba en el payload, que es la causa literal del 403 que impedía
   * guardar los 83 releases aprobados. Ahora el formulario no tiene un campo
   * `status` que reenviar: `currentStatus` es de SOLO LECTURA (pinta la etiqueta
   * y elige el texto del botón) y nunca entra en el body.
   */
  const [currentStatus, setCurrentStatus] = useState<ReleaseStatus>("draft");

  const [form, setForm] = useState({
    type: "single" as ReleaseType,
    title: "",
    artist_name: "",
    release_date: "",
    cover_image: "",
    description: "",
    duration: "",
    spotify_url: "",
    apple_music_url: "",
    youtube_url: "",
  });

  const [tracks, setTracks] = useState<TrackInput[]>([{ title: "", duration: "", isrc: "", start_time: 0, end_time: 0, track_number: null }]);
  const [lyrics, setLyrics] = useState("");
  const [productionDetails, setProductionDetails] = useState({
    daw: "",
    guitars: "",
    effects_chain: "",
    tuning: "",
    key: "",
    genre: "",
    sub_genre: "",
    bpm: "",
    mood: "",
    recording_date: "",
    production_credits: "",
  });

  // Fetch release data on mount
  useEffect(() => {
    const fetchRelease = async () => {
      try {
        const res = await fetch(`/api/releases?id=${releaseId}`);
        if (res.ok) {
          const data = await res.json();
          setReleaseData(data);
          // Parse external_links: Turso returns JSON string, local SQLite returns object
          const el = typeof data.external_links === "string"
            ? JSON.parse(data.external_links || "{}")
            : (data.external_links || {});
          // Parse production_details: same pattern
          const pd = typeof data.production_details === "string"
            ? JSON.parse(data.production_details || "{}")
            : (data.production_details || {});
          setForm({
            type: data.release_type || data.type || "single",
            title: data.title || "",
            artist_name: data.artist_name || "",
            release_date: data.release_date || "",
            cover_image: data.cover_image || "",
            description: data.description || "",
            duration: data.duration || "",
            spotify_url: el.spotify || "",
            apple_music_url: el.apple_music || "",
            youtube_url: el.youtube || "",
          });
          // RC.32: el estado va a su propio state de solo lectura. No se manda
          // de vuelta en el payload (ver Tarea 1).
          setCurrentStatus(data.status || "draft");
          setLyrics(data.lyrics || "");
          setProductionDetails({
            daw: pd.daw || "",
            guitars: pd.guitars || "",
            effects_chain: pd.effects_chain || pd.effects || "",
            tuning: pd.tuning || "",
            key: pd.key || "",
            genre: pd.genre || "",
            sub_genre: pd.sub_genre || "",
            bpm: pd.bpm?.toString() || "",
            mood: pd.mood || "",
            recording_date: pd.recording_date || "",
            production_credits: pd.production_credits || "",
          });
          // Las hijas llegan en `data.tracks` solo en el brazo privilegiado del
          // GET (dueño o admin). Antes esto nunca se cumplía —ni `parseTrack`
          // ni un `SELECT *` inventan una columna `tracks`— así que el tracklist
          // de un álbum se editaba sobre UNA fila vacía y, al guardar, se
          // perdía. Si el GET no trae hijas, se deja la fila vacía inicial:
          // el payload se armará sin `tracks` y el backend no tocará nada.
          if (Array.isArray(data.tracks) && data.tracks.length > 0) {
            setTracks(data.tracks.map((t: any) => ({
              title: t.title ?? "",
              duration: t.duration ?? "",
              isrc: t.isrc || "",
              start_time: t.start_time ?? 0,
              end_time: t.end_time ?? 0,
              track_number: t.track_number ?? null,
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

  // Check ownership: tracks use artist_name, so we verify via user's artist profile
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    if (!releaseData || !user) return;
    if (user.role === "admin") { setIsOwner(true); return; }

    // Look up the user's artist profile and check if name matches
    fetch(`/api/artists/me?user_id=${user.id}`)
      .then((res) => res.json())
      .then((profile) => {
        setIsOwner(profile?.name === releaseData.artist_name);
      })
      .catch(() => setIsOwner(false));
  }, [releaseData, user]);

  useEffect(() => {
    if (isOwner === false) {
      router.push("/dashboard");
    }
  }, [isOwner, router]);

  if (authLoading || !user || isOwner === null || isOwner === false) {
    return null;
  }

  // RC.32 Tarea 7: aquí vivía un `extractYouTubeId` local que SOMBREADABA el
  // import de `@/lib/youtube` con un cuerpo byte a byte idéntico. No estaba
  // muerto —se usaba tres veces más abajo—, pero sí era una segunda copia de
  // un extractor que otro stream mantiene, y el import de la línea 7 quedaba
  // sin uso real. Se borra la copia; el import pasa a ser el que manda.

  const handleYouTubeUrlChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setForm({ ...form, youtube_url: url });
    if (url && !form.cover_image) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        const thumbnail = getYouTubeThumbnail(videoId, "maxres") || "";
        setForm({ ...form, cover_image: thumbnail });
      }
    }
    
    // Auto-fetch YouTube metadata (only when fields are empty)
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
            cover_image: prev.cover_image || getYouTubeThumbnail(videoId, "maxres"),
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

  const handleITunesSelect = (track: any) => {
    setForm(prev => ({
      ...prev,
      title: prev.title || track.trackName,
      cover_image: prev.cover_image || track.artworkUrl600 || "",
      release_date: prev.release_date || (track.releaseDate ? track.releaseDate.substring(0, 10) : ""),
      apple_music_url: prev.apple_music_url || `https://music.apple.com/us/album/${track.trackId}`,
    }));
    // RC.32 Tarea 5: el género de iTunes va a `production_details.genre`, que
    // es la fuente que se renderiza y se exporta. Antes iba a `tracks.genre`,
    // que `parseTrack` no expone: se escribía y nadie lo leía nunca.
    setProductionDetails(prev => ({
      ...prev,
      genre: prev.genre || track.primaryGenreName || "",
    }));
    // Auto-fill duration
    if (track.trackTimeMillis) {
      const totalSec = Math.round(track.trackTimeMillis / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      updateTrack(0, "duration", `${min}:${sec.toString().padStart(2, "0")}`);
    }
  };

  // P3.30: Force YouTube auto-fill even when fields are populated
  const forceYouTubeAutoFill = async () => {
    const videoId = extractYouTubeId(form.youtube_url);
    if (!videoId) {
      setMessage({ type: "error", text: "URL de YouTube no válida" });
      return;
    }

    // Confirm if fields are populated
    if (form.title || form.duration) {
      const confirmed = window.confirm(
        "¿Sobrescribir datos existentes con información de YouTube?"
      );
      if (!confirmed) return;
    }

    setYoutubeLoading(true);
    try {
      const videoData = await fetchYouTubeVideo(videoId);
      if (videoData) {
        setForm(prev => ({
          ...prev,
          title: videoData.title,
          duration: videoData.duration,
          cover_image: getYouTubeThumbnail(videoId, "maxres"),
          description: videoData.description,
        }));
        setMessage({ type: "success", text: "Datos de YouTube cargados exitosamente" });
      } else {
        setMessage({ type: "error", text: "No se pudo obtener información del video" });
      }
    } catch (error) {
      console.error("Error fetching YouTube video:", error);
      setMessage({ type: "error", text: "Error al obtener datos de YouTube" });
    } finally {
      setYoutubeLoading(false);
    }
  };

  const addTrack = () => setTracks([...tracks, { title: "", duration: "", isrc: "", start_time: 0, end_time: 0, track_number: null }]);
  const removeTrack = (index: number) => setTracks(tracks.filter((_, i) => i !== index));
  const updateTrack = (index: number, field: keyof TrackInput, value: string | number | null) => {
    const newTracks = [...tracks];
    (newTracks[index] as unknown as Record<string, string | number | null>)[field] = value;
    setTracks(newTracks);
  };

  /**
   * RC.32 — el cuerpo del PUT, campo por campo.
   *
   * Ya no es `{ ...form }`: el spread era el problema, porque `form` llevaba
   * `status` dentro y la clave viajaba dos veces en el JSON (una por el spread y
   * otra por la propiedad explícita). Aquí no hay spread y no hay `status` de
   * origen en ninguna parte: lo que sale es una INTENCIÓN (`save` o `request`)
   * y el servidor decide el estado.
   *
   * `tracks` solo se manda si hay ALGO que mandar. El backend rechaza con 400
   * un array vacío sobre un release que ya tiene hijas, precisamente para que
   * un cliente que no las cargó no las borre; omittingir la clave es la forma
   * explícita de decir "no las toques".
   *
   * `type` viaja como `release_type` (su columna): el selector de Single/EP/
   * Álbum mandaba `type`, que no está en la allowlist del PUT, así que era otro
   * control muerto. `capitalizeReleaseType` deja el valor en la forma que usa el
   * resto del catálogo ("Single", "EP", "Album").
   */
  const buildPayload = (submitState: "save" | "request") => {
    const videoId = extractYouTubeId(form.youtube_url);
    const children = tracks.filter((t) => t.title.trim().length > 0);
    return {
      id: releaseId,
      status: submitState === "request" ? "pending" : "draft",
      title: form.title,
      release_type: capitalizeReleaseType(form.type),
      artist_name: form.artist_name,
      release_date: form.release_date,
      cover_image: form.cover_image,
      description: form.description,
      duration: form.duration,
      lyrics: lyrics || null,
      production_details: JSON.stringify(productionDetails),
      external_links: {
        spotify: form.spotify_url,
        apple_music: form.apple_music_url,
        youtube: form.youtube_url,
        youtube_video_id: videoId,
      },
      ...(children.length > 0 ? { tracks: children } : {}),
    };
  };

  /**
   * La Intención sale de `primaryIntent(currentStatus)`, no de un argumento: con
   * un solo botón ya no hay quién elija. El botón sigue siendo `type="submit"`,
   * y eso es a propósito —los cuatro `required` del formulario dependen de la
   * validación nativa, que un `type="button"` se saltaría.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitState = primaryIntent(currentStatus);

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/releases?id=${releaseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(submitState)),
      });

      if (res.ok) {
        const json = await res.json().catch(() => null);
        const askedForReview = submitState === "request";
        const msg = askedForReview ? "Release enviado para revisión" : "Release actualizado exitosamente";
        // Si el servidor ignora el estado (no debería pasar con este
        // formulario, pero el contrato lo garantiza), el aviso lo dice en
        // lugar de dejar pensar al artista que su release se despublicó.
        if (json?.statusIgnored) {
          setMessage({ type: "error", text: "Se guardaron los cambios, pero el estado del release no se pudo cambiar." });
        } else {
          setMessage({ type: "success", text: msg });
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        const error = await res.json().catch(() => null);
        setMessage({ type: "error", text: error?.error || "Error al actualizar release" });
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

            {/* Artist Name — RC.32: SOLO LECTURA */}
            <div>
              <label htmlFor="artist-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre del Artista *
              </label>
              <input
                id="artist-name"
                type="text"
                required
                readOnly
                value={form.artist_name}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Es el nombre de tu perfil de artista. Los releases se vinculan a él por nombre, así que
                no se puede cambiar desde aquí: se cambia en tu perfil.
              </p>
            </div>

            {/* Release Date — RC.32 Tarea 5: el input de "Género" (`tracks.genre`,
                columna MUERTA) desaparece de aquí. El género vive en la Ficha de
                Producción, más abajo, y es el único sitio donde se escribe. */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label htmlFor="release-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha de Lanzamiento *</label>
                <input
                  id="release-date"
                  type="date"
                  required
                  value={form.release_date}
                  onChange={(e) => setForm({ ...form, release_date: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
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
                {/* P3.30: Force YouTube auto-fill button */}
                {form.youtube_url && (
                  <button
                    type="button"
                    onClick={forceYouTubeAutoFill}
                    disabled={youtubeLoading}
                    className="mt-2 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
                  >
                    {youtubeLoading ? "⏳ Cargando..." : "🔄 Auto-completar desde YouTube"}
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
                  <>
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
                    <div className="flex gap-2 ml-4 pt-1 items-center">
                      <label
                        htmlFor={`track-number-${index}`}
                        className="text-xs text-slate-500 dark:text-slate-400"
                      >
                        Nº
                      </label>
                      <input
                        id={`track-number-${index}`}
                        type="number"
                        value={track.track_number ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          // Vacio = sin numerar (null), no 0
                          updateTrack(index, "track_number", raw === "" ? null : parseInt(raw, 10) || 0);
                        }}
                        className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                        placeholder="Nº"
                        min="0"
                        step="1"
                      />
                      <input
                        type="number"
                        value={track.start_time}
                        onChange={(e) => updateTrack(index, "start_time", parseInt(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                        placeholder="Start (s)"
                        min="0"
                      />
                      <input
                        type="number"
                        value={track.end_time}
                        onChange={(e) => updateTrack(index, "end_time", parseInt(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                        placeholder="End (s)"
                        min="0"
                      />
                      <span className="text-xs text-slate-400 mt-1">segundos</span>
                    </div>
                  </>
                ))}
              </div>
            </div>

            {/* Lyrics */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Letras</label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                rows={6}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-sm resize-y"
                placeholder="Pega las letras del track aquí..."
              />
            </div>

            {/* Production Details */}
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Ficha de Producción</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PRODUCTION_FIELDS.map(({ key, label, placeholder, type }) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</label>
                    <input
                      type={type}
                      value={productionDetails[key as ProductionFieldKey] ?? ""}
                      onChange={(e) => setProductionDetails({ ...productionDetails, [key]: e.target.value })}
                      className={PRODUCTION_INPUT_CLASS}
                      placeholder={placeholder || undefined}
                      {...(type === "number" ? { min: 1, max: 999 } : {})}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{PRODUCTION_CREDITS_LABEL}</label>
                <textarea
                  value={productionDetails.production_credits}
                  onChange={(e) => setProductionDetails({ ...productionDetails, production_credits: e.target.value })}
                  rows={3}
                  placeholder={PRODUCTION_CREDITS_PLACEHOLDER}
                  className={`${PRODUCTION_INPUT_CLASS} resize-none placeholder-slate-400 dark:placeholder-slate-500`}
                />
              </div>
            </div>

            {/* Status Display */}
            {releaseData && (
              <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Estado actual:</span>
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${
                    currentStatus === "draft" ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" :
                    currentStatus === "pending" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300" :
                    currentStatus === "approved" ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" :
                    "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                  }`}>
                    {currentStatus === "draft" ? "📝 Borrador" :
                     currentStatus === "pending" ? "⏳ Pendiente de revisión" :
                     currentStatus === "approved" ? "✅ Aprobado" :
                     "❌ Rechazado"}
                  </span>
                </div>
                {/* El texto de abajo tiene que describir lo que hace el botón de
                    al lado. Con C3 solo hay un botón, así que la línea ya no
                    puede señalar "usa el otro": describe la consecuencia. */}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {currentStatus === "draft" && "Borrador. Al publicar, el release entra en la cola de revisión y un administrador lo aprueba."}
                  {currentStatus === "pending" && "En revisión. Al guardar los cambios, el release sigue en la cola."}
                  {currentStatus === "approved" && "Publicado. Al actualizar, sigue en el catálogo sin pasar por revisión."}
                  {currentStatus === "rejected" && "Rechazado. Corrige lo que quieras y envíalo de nuevo a revisión."}
                </p>
                {currentStatus === "rejected" && releaseData.admin_notes && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    Motivo: {releaseData.admin_notes}
                  </p>
                )}
              </div>
            )}

            {/* C3 — UN botón de envío, y su etiqueta ES la consecuencia
                (`primaryLabel`). El secundario "Enviar para revisión" ya no
                existe: con dos botones, el que guardaba y el que despublicaba
                tenían el mismo peso visual. */}
            <div className="flex flex-wrap gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 min-w-[200px] px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Guardando..." : primaryLabel(currentStatus)}
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="flex-1 min-w-[200px] px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600"
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
