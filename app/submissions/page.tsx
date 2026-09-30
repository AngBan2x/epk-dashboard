"use client";

/**
 * P16 — Portal de envíos (`/submissions`).
 *
 * ── Por qué esta página existe ────────────────────────────────────────────
 * El flujo de promoción de `subscriber` → `artist` estaba muerto en la práctica
 * aunque TODO el backend estuviera escrito y funcionando:
 *
 *   · `POST /api/submissions` solo exige sesión, toma el `userId` de la sesión
 *     (nunca de un header falsificable), fuerza `status: "pending"` y escribe
 *     en `track_submissions`.
 *   · `createArtistProfileForUser` (`lib/artist-promotion.ts:148`) ya sabe
 *     crear la fila en `artists` cuando el admin aprueba.
 *   · `userHasApprovedContent` (`lib/artist-promotion.ts:112-116`) lee
 *     `track_submissions` y dispara la promoción.
 *
 * Lo que faltaba era la UI: esta página no existía y ningún cliente hacía POST
 * a `/api/submissions` — el único `fetch("/api/submissions")` del repo era el
 * GET del admin (`app/admin/page.tsx:239`). Un suscriptor que entraba a crear
 * un release por `/releases/new` recibía un 403 de `POST /api/releases`
 * (`:116-118`, exige rol admin/artist) y de `/api/shows` (`:123-125`), sin
 * ninguna ruta alternativa a la que ir.
 *
 * ── La promoción vía show es estructuralmente imposible ──────────────────
 * No es un bug pendiente de arreglar aquí, y NO se debe "arreglar" cerrando más
 * endpoints. En `lib/artist-promotion.ts`:
 *
 *   · `userHasApprovedContent` (`:112-116`) solo mira `track_submissions`.
 *   · Para shows exige `getArtistByUserId(userId)` (`:119-126`), que un
 *     `subscriber` no tiene porque la fila en `artists` se crea precisamente
 *     como efecto de la promoción: no hay perfil de artista que pueda tener un
 *     show aprobado antes de ser artista. Es un círculo vicioso, no un hueco.
 *
 * Conclusión: SOLO un track submission puede promover. Por eso este portal es
 * de tracks. Queda escrito aquí para que nadie lo descubra por el camino
 * difícil, ni lo "solucione" aflojando el rol de `POST /api/shows` — eso
 * escribiría filas `pending` en `shows` sin Disparar la promoción y reopening
 * la superficie de escritura que P6 acaba de cerrar.
 *
 * ── Por qué NO se aflojó `/api/releases` ni `/api/shows` ───────────────────
 * Habría sido el arreglo de dos líneas y el error: la promoción seguiría sin
 * dispararse (sus lecturas no miran `tracks` ni `shows`), y además dejaría
 * filas `pending` en las tablas del catálogo en vez de en la cola de revisión
 * de `track_submissions`, que es donde la revisión vive.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ITunesSearch } from "@/components/ITunesSearch";
import { formatDateES } from "@/lib/null-safe";

/** Subconjunto de la respuesta de `/api/itunes-search` que este portal usa. */
interface ITunesHit {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl600?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
  releaseDate?: string;
}

interface SubmissionRow {
  id: string;
  status: string;
  status_label: string;
  admin_notes: string | null;
  created_at: string;
  track_data: string;
}

const STATUS_CLASSES: Record<string, string> = {
  approved: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  rejected: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  revision: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
};

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent";
const LABEL_CLASS = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

/**
 * `cover_image` y `audio_preview_url` son `z.string().url()` OBLIGATORIAS en
 * `CreateSubmissionSchema` (`app/api/submissions/route.ts:15-51`). No hay forma
 * de enviar sin las dos, así que el formulario no puede ofrecer "dejar vacío":
 * o vienen de iTunes, o el envío se rechaza con 400.
 *
 * Los campos del formulario son EXACTAMENTE los del schema. Zod no es `strict()`
 * aquí, así que mandar `genre` o `description` de más no daría error: los
 * descartaría en silencio y el usuario escribiría un texto que no se guarda
 * nunca. Por eso el formulario no los ofrece.
 */
const EMPTY_FORM = {
  title: "",
  artist_name: "",
  release_type: "single",
  release_date: "",
  duration: "",
  cover_image: "",
  audio_preview_url: "",
  spotify_url: "",
  itunes_track_id: "",
};

function millisToDuration(millis?: number): string {
  if (!millis || !Number.isFinite(millis)) return "";
  const totalSec = Math.round(millis / 1000);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

function readTitle(trackData: string): string {
  try {
    const parsed = JSON.parse(trackData) as { title?: unknown };
    return typeof parsed?.title === "string" ? parsed.title : "—";
  } catch {
    return "—";
  }
}

export default function SubmissionsPage() {
  const { user, loading: authLoading } = useAuth();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadSubmissions = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/submissions", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : []);
      }
    } catch {
      setMessage({ type: "error", text: "No se pudieron cargar tus envíos" });
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void loadSubmissions();
  }, [authLoading, user, loadSubmissions]);

  /**
   * `ITunesSearch` devuelve `artworkUrl600` Y `previewUrl`.
   *
   * `app/releases/new/page.tsx:116` rellena `cover_image` desde ahí pero
   * DESCARTA `previewUrl`, que es justo el segundo campo obligatorio del schema
   * de envíos. Aquí se rellenan los dos, más duración y fecha, para que el
   * suscriptor pueda enviar sin salir a buscar una URL de preview a mano.
   */
  const handleITunesSelect = (hit: ITunesHit) => {
    setForm((prev) => ({
      ...prev,
      title: prev.title || hit.trackName,
      artist_name: prev.artist_name || hit.artistName,
      cover_image: prev.cover_image || hit.artworkUrl600 || "",
      audio_preview_url: prev.audio_preview_url || hit.previewUrl || "",
      duration: prev.duration || millisToDuration(hit.trackTimeMillis),
      release_date: prev.release_date || (hit.releaseDate ? hit.releaseDate.substring(0, 10) : ""),
      spotify_url: prev.spotify_url || `https://music.apple.com/us/album/${hit.trackId}`,
      itunes_track_id: prev.itunes_track_id || String(hit.trackId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!form.cover_image || !form.audio_preview_url) {
      setMessage({
        type: "error",
        text: "Portada y preview de audio son obligatorios. Usa el buscador de iTunes para rellenarlos.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track_data: {
            title: form.title,
            artist_name: form.artist_name,
            release_type: form.release_type,
            release_date: form.release_date,
            duration: form.duration,
            cover_image: form.cover_image,
            audio_preview_url: form.audio_preview_url,
            spotify_url: form.spotify_url || null,
            itunes_track_id: form.itunes_track_id || null,
          },
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Envío recibido. El equipo lo revisará antes de publicarlo." });
        setForm({ ...EMPTY_FORM });
        await loadSubmissions();
      } else {
        const data = await res.json().catch(() => ({}));
        const detail = Array.isArray(data?.error) ? data.error[0]?.message : data?.error;
        setMessage({ type: "error", text: detail || "No se pudo registrar el envío" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <main className="max-w-3xl mx-auto px-4 py-12">
          <p className="text-slate-500 dark:text-slate-400">Cargando…</p>
        </main>
      </div>
    );
  }

  // `middleware.ts` ya redirige a /login sin sesión; esto es solo el estado
  // intermedio del contexto para no renderizar un formulario a medio montar.
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
        <header>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Enviar música</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Envía un release para que el equipo de PressPlay lo revise. Al aprobarlo tu cuenta pasa a
            artista y tu perfil queda activo en el catálogo.
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            ¿Ya eres artista? Gestiona tu catálogo desde{" "}
            <Link href="/dashboard" className="text-primary-600 dark:text-primary-400 underline">
              el dashboard
            </Link>
            .
          </p>
        </header>

        {message && (
          <div
            role="status"
            className={`p-4 rounded-lg ${
              message.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
          <div>
            <label className={LABEL_CLASS} htmlFor="sub-itunes">
              Buscar en iTunes (recomendado)
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Rellena título, artista, portada, duración y el preview de audio. Los dos últimos son
              obligatorios.
            </p>
            <div id="sub-itunes">
              <ITunesSearch onSelect={handleITunesSelect} placeholder="Buscar en iTunes" />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sub-title">
              Título *
            </label>
            <input
              id="sub-title"
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sub-artist">
              Artista *
            </label>
            <input
              id="sub-artist"
              type="text"
              required
              value={form.artist_name}
              onChange={(e) => setForm({ ...form, artist_name: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="sub-type">
                Tipo *
              </label>
              <select
                id="sub-type"
                required
                value={form.release_type}
                onChange={(e) => setForm({ ...form, release_type: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Álbum</option>
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="sub-date">
                Fecha de lanzamiento *
              </label>
              <input
                id="sub-date"
                type="date"
                required
                value={form.release_date}
                onChange={(e) => setForm({ ...form, release_date: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="sub-duration">
                Duración *
              </label>
              <input
                id="sub-duration"
                type="text"
                required
                placeholder="3:45"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sub-cover">
              URL de portada *
            </label>
            <input
              id="sub-cover"
              type="url"
              required
              value={form.cover_image}
              onChange={(e) => setForm({ ...form, cover_image: e.target.value })}
              className={INPUT_CLASS}
              placeholder="https://…"
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sub-preview">
              URL de preview de audio *
            </label>
            <input
              id="sub-preview"
              type="url"
              required
              value={form.audio_preview_url}
              onChange={(e) => setForm({ ...form, audio_preview_url: e.target.value })}
              className={INPUT_CLASS}
              placeholder="https://…"
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sub-spotify">
              Enlace a Spotify
            </label>
            <input
              id="sub-spotify"
              type="url"
              value={form.spotify_url}
              onChange={(e) => setForm({ ...form, spotify_url: e.target.value })}
              className={INPUT_CLASS}
              placeholder="https://…"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Enviando…" : "Enviar para revisión"}
          </button>
        </form>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Mis envíos</h2>

          {listLoading ? (
            <p className="text-slate-500 dark:text-slate-400">Cargando…</p>
          ) : submissions.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">
              Todavía no has enviado nada. Tu primer envío aprobado es el que convierte tu cuenta en
              artista.
            </p>
          ) : (
            <ul className="space-y-3">
              {submissions.map((submission) => (
                <li
                  key={submission.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {readTitle(submission.track_data)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDateES(submission.created_at)}
                    </p>
                    {submission.status === "rejected" && submission.admin_notes && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        Motivo: {submission.admin_notes}
                      </p>
                    )}
                    {submission.status === "revision" && submission.admin_notes && (
                      <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                        Cambio solicitado: {submission.admin_notes}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      STATUS_CLASSES[submission.status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {submission.status_label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
