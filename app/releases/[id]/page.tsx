import Image from "next/image";
import Link from "next/link";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReleaseActions } from "@/components/ReleaseActions";
import { ReleaseTrackList } from "@/components/ReleaseTrackList";
import {
  capitalizeReleaseType,
  formatDateES,
  formatNumber,
  getCoverImage,
  safeString,
  sumDurations,
} from "@/lib/null-safe";
import { metricsTooltip } from "@/lib/metrics-source";
import { getReleaseNeighbours, getReleaseWithTracks } from "@/lib/releases";
import { NO_VALUE, ownDurationLabel } from "@/lib/release-page";

interface ReleaseDetailPageProps {
  params: { id: string };
}

export const dynamic = "force-dynamic";

/**
 * ## Por qué esta página se ve como se ve (C1)
 *
 * P2 (RC.33) maquetó aquí un diseño "rico": cabecera con degradado a partir de
 * la portada, type-line en mayúsculas, un panel de métricas y la lista de
 * pistas dentro de una caja con su propio encabezado. **El usuario lo pidió
 * revertido** (2026-10-03): el diseño acordado era el anterior, y el nuevo
 * dejaba los demás datos por debajo del pliegue.
 *
 * Así que la maquetación vuelve a la de `cebc700~1`: cabecera sobria con la
 * portada a un lado y la ficha al otro, y las **cuatro secciones** —
 * Descripción, Pistas, Enlaces, Letra — en secciones planas y a la vista.
 *
 * Lo que NO vuelve atrás, porque no es diseño sino arreglos, y viven fuera de
 * este fichero (o en helpers que no se tocan):
 *
 * - **`getReleaseWithTracks`** (`lib/releases.ts`) en vez de `getTrackById`: es
 *   la misma lectura más la FORMA del lanzamiento, y es lo que da `metrics`
 *   resuelto en una sola fuente (RC.33).
 * - **La duración con filtro de relleno**: `ownDurationLabel`, no
 *   `release.duration` en crudo. Un single sin hijas de 3:45 real ya no cae al
 *   `"00:00"` del seed.
 * - **`trackCount`, no `childTracks.length`**: un single suelto tiene **una**
 *   pista, no cero. "0 pistas" era un dato falso.
 * - **Anterior / siguiente sobre lanzamientos** (`getReleaseNeighbours`), que
 *   corrigió el peor de los cuatro puntos de P2: el vecino ya no avanza por
 *   dentro de un álbum.
 * - **`—` en vez de `0`** en las métricas (`NO_VALUE`), porque `0` afirma que
 *   nadie escuchó y lo único que sabemos es que nadie preguntó.
 *
 * Y lo que sí se trasplanta del diseño nuevo, porque son arreglos de a11y y
 * no se pierden al revertir: botones con anillo de foco, `aria-label` con
 * número y título, y 44 px de área táctil. Viven en `components/ReleaseTrackList.tsx`,
 * que es el componente que vuelve a montar esta sección y **no** se revierte.
 */
export async function generateMetadata({ params }: ReleaseDetailPageProps): Promise<Metadata> {
  const data = await getReleaseWithTracks(params.id);
  if (!data) return { title: "Release no encontrado" };

  const { release, trackCount, isMultiTrack, durationLabel } = data;
  const cover = getCoverImage(release);
  const type = capitalizeReleaseType(release.release_type);

  /**
   * Un álbum no tiene duración ni streams propios, así que la descripción
   * terminaba en "Álbum - 00:00 - 0 streams" en buscadores y previews de
   * enlaces. Aquí se cuenta lo que describe la página de verdad: cuántas pistas
   * tiene y cuánto duran. Y si no hay duración, **no se escribe ninguna**: una
   * descripción que anuncia "0:00" es peor que una que anuncia solo el tipo.
   */
  const parts = [type, `de ${release.artist_name}`, `${trackCount} ${trackCount === 1 ? "pista" : "pistas"}`];
  if (durationLabel !== NO_VALUE) parts.push(durationLabel);
  if (release.release_date) parts.push(release.release_date);

  return {
    title: `${release.title} — PressPlay`,
    description: parts.join(" · "),
    /**
     * `canonical` a la página del release. Es la respuesta a que en el esquema
     * un single y un álbum **son la misma fila** (`lib/db.ts:2926`), de modo
     * que `/track/<id>` y `/releases/<id>` pueden servir el mismo contenido con
     * dos plantillas. El buscador debe ver una sola URL, y esta es la que
     * sobrevive a la reorg.
     */
    alternates: { canonical: `/releases/${release.id}` },
    openGraph: {
      title: release.title,
      description: parts.join(" · "),
      images: cover ? [cover] : [],
    },
  };
}

export default async function ReleaseDetailPage({ params }: ReleaseDetailPageProps) {
  const data = await getReleaseWithTracks(params.id);

  if (!data) {
    notFound();
  }

  /**
   * El narrowing. `notFound()` devuelve `never`, así que TypeScript ya sabe que
   * a partir de aquí `data` no es `null` — y no hace falta ni `as` ni `!`.
   * Ese es el motivo de meter la comprobación y el `notFound()` juntos y en
   * este orden: separarlos obligaría a un cast, y el cast habitual
   * (`data!`) rompe justo el caso de "no existe", que es el que importa.
   */
  const { release, tracks: childTracks, isMultiTrack, trackCount, discCount, metrics } = data;

  /**
   * ## La duración, y por qué la línea tiene esta forma
   *
   * P15 (RC.31) ya fijó —y `tests/unit/itunes-previews.test.ts` sigue fijando,
   * con un check sobre el TEXTO de este fichero— que la etiqueta sale de la
   * SUMA de las hijas cuando hay hijas, y nunca del valor crudo del padre. Esa
   * forma se conserva tal cual, porque es lo que evita que un disco de cero
   * segundos se pinte como tal.
   *
   * Lo que P2 añade es la rama de los **0 hijas**, que antes no existía:
   * `sumDurations([])` es `null`, así que la expresión caía a
   * `release.duration` en crudo, y el relleno `"00:00"` del seed salía como si
   * el disco durara cero. `ownDurationLabel` (`lib/release-page.ts`) es la que
   * aplica el filtro del relleno, y está en UN sitio: aquí no se reimplementa
   * nada, se le pregunta.
   */
  const totalDuration = sumDurations(childTracks.map((t) => t.duration));
  const durationLabel = (isMultiTrack ? totalDuration?.label : null) ?? ownDurationLabel(release);

  const neighbours = await getReleaseNeighbours(release);

  const cover = getCoverImage(release);
  const type = capitalizeReleaseType(release.release_type);
  const metricsTitle = metricsTooltip(metrics);
  const metricsValue = metrics.value === null ? NO_VALUE : formatNumber(metrics.value);

  const description = (release as unknown as { description?: string | null }).description;

  /**
   * Las pistas que se montan. Con hijas, las hijas. Sin hijas, **la fila del
   * propio release**: en el esquema un single es a la vez pista y cabecera, así
   * que su lista de pistas tiene una fila, y esa fila es él.
   *
   * Antes (diseño de `cebc700~1`) esta sección solo se montaba
   * `if (isMultiTrack)`, y los 6 singles sin hijas del catálogo se quedaban sin
   * un solo control de reproducción en su propia página. Es el arreglo nº 1 de
   * P2 y no es diseño: se conserva.
   */
  const listedTracks = childTracks.length > 0 ? childTracks : [release];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* ── Cabecera ────────────────────────────────────────────────────────
            La de siempre: portada a un lado, ficha al otro. Sin degradado, sin
            velo, sin type-line en mayúsculas. Lo que hace "rico" un lanzamiento
            es que se le vea la portada de un vistazo, y para eso basta con la
            portada, no con fondo desenfocado. */}
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          {cover ? (
            <div className="w-full md:w-64 flex-shrink-0">
              <Image
                src={cover}
                alt={safeString(release.title)}
                width={256}
                height={256}
                unoptimized
                className="w-full aspect-square object-cover rounded-xl shadow-lg"
              />
            </div>
          ) : null}

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                {type}
              </span>
            </div>

            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              {safeString(release.title)}
            </h1>

            <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
              {release.artist_name}
            </p>

            <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400 mb-4">
              {release.release_date ? (
                <span>📅 {formatDateES(release.release_date, { month: "long" })}</span>
              ) : null}
              <span>⏱️ {durationLabel}</span>
              {/* `trackCount`, no `childTracks.length`: sin hijas, un single
                  tiene UNA pista. Decir "0 pistas" es afirmar algo falso. */}
              <span>
                🎵 {trackCount} {trackCount === 1 ? "pista" : "pistas"}
                {discCount > 1 ? ` · ${discCount} discos` : ""}
              </span>
            </div>

            {/*
              Las métricas, en la línea de datos y no en un panel propio.
              `value === null` se pinta como `—` y se explica con el mismo
              `title` que el diseño nuevo usaba: sin texto, un guion suelto
              parece un bug de render. Y el texto va también en `sr-only`,
              porque el `title` solo existe en hover.
            */}
            <p
              className="mb-4 text-sm text-slate-500 dark:text-slate-400"
              title={metricsTitle}
              data-testid="release-metrics"
            >
              {metricsValue} {isMultiTrack ? "reproducciones del lanzamiento" : "streams"}
              <span className="sr-only">. {metricsTitle}</span>
            </p>

            {/* Acciones + badge de estado (solo admin o dueño) */}
            <ReleaseActions
              releaseId={release.id}
              artistName={release.artist_name}
              status={release.status}
            />
          </div>
        </div>

        {/* ── 1 · Descripción ───────────────────────────────────────────────── */}
        {description ? (
          <section className="mb-8" aria-labelledby="release-description">
            <h2
              id="release-description"
              className="text-xl font-bold text-slate-900 dark:text-white mb-4"
            >
              Descripción
            </h2>
            <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{description}</p>
          </section>
        ) : null}

        {/* ── 2 · Pistas ─────────────────────────────────────────────────────
            Vuelve `ReleaseTrackList`, el componente de antes, con sus arreglos
            de a11y (44 px, anillo de foco, etiqueta con número y título). Las
            filas NO enlazan a `/track/`: esa ruta es hoy un 301 a esta misma
            página, así que un enlace ahí sería un enlace a donde ya estás. */}
        <section
          className="mb-8"
          aria-labelledby="release-tracks"
          data-testid="release-play-section"
        >
          <h2 id="release-tracks" className="text-xl font-bold text-slate-900 dark:text-white mb-4">
            Pistas ({trackCount})
          </h2>
          <ReleaseTrackList
            tracks={listedTracks}
            releaseTitle={safeString(release.title)}
            releaseCoverImage={release.cover_image}
            releaseYoutubeVideoId={release.youtube_video_id || undefined}
          />
        </section>

        {/* ── 3 · Enlaces ──────────────────────────────────────────────────── */}
        {release.external_links && Object.keys(release.external_links).length > 0 ? (
          <section className="mb-8" aria-labelledby="release-links">
            <h2 id="release-links" className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Enlaces
            </h2>
            <div className="flex flex-wrap gap-3">
              {release.external_links.spotify ? (
                <ExternalLink
                  href={release.external_links.spotify}
                  className="bg-[#1DB954] hover:bg-[#1ed760]"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  Spotify
                </ExternalLink>
              ) : null}
              {release.external_links.apple_music ? (
                <ExternalLink
                  href={release.external_links.apple_music}
                  className="bg-[#FC3C44] hover:bg-[#e0353c]"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0019.2.25a9.472 9.472 0 00-1.317-.24c-.58-.06-1.16-.08-1.74-.06H7.857c-.58-.02-1.16 0-1.74.06-.46.04-.92.1-1.36.2A5.022 5.022 0 002.426.89C1.308 1.624.564 2.624.246 3.934a9.23 9.23 0 00-.24 2.19c-.06.58-.08 1.16-.06 1.74v10.68c-.02.58 0 1.16.06 1.74.04.46.1.92.24 1.36.318 1.31 1.062 2.31 2.18 3.043a9.472 9.472 0 001.868.64c.44.1.9.16 1.36.2.58.06 1.16.08 1.74.06h8.286c.58.02 1.16 0 1.74-.06.46-.04.92-.1 1.36-.2a5.022 5.022 0 001.868-.64c1.118-.734 1.862-1.734 2.18-3.043.14-.44.2-.9.24-1.36.06-.58.08-1.16.06-1.74V7.864c.02-.58 0-1.16-.06-1.74zM17.994 15.854l-.002-6.48-5.496 3.22v6.08l5.498-2.82z" />
                  </svg>
                  Apple Music
                </ExternalLink>
              ) : null}
              {release.external_links.youtube ? (
                <ExternalLink
                  href={release.external_links.youtube}
                  className="bg-[#FF0000] hover:bg-[#cc0000]"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  YouTube
                </ExternalLink>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ── 4 · Letra ─────────────────────────────────────────────────────── */}
        {release.lyrics ? (
          <section className="mb-8" aria-labelledby="release-lyrics">
            <h2 id="release-lyrics" className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Letra
            </h2>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
              <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono text-sm">
                {release.lyrics}
              </p>
            </div>
          </section>
        ) : null}

        {/* ── Anterior / siguiente, SOBRE LANZAMIENTOS ────────────────────── */}
        {/*
          Los vecinos llegan de `getReleaseNeighbours`, que usa el catálogo del
          ARTISTA. No usan `getAllTracks()`: ese array mezcla las cabeceras con
          todas sus hijas, así que el "siguiente" de un álbum era su primer
          corte — y ese corte, desde P2, redirige a la página del propio álbum.
          Un enlace que vuelve al sitio del que saliste no es navegación.
        */}
        {neighbours.previous || neighbours.next ? (
          <nav
            aria-label="Otros lanzamientos del artista"
            className="mt-8 flex items-stretch justify-between gap-3"
          >
            {neighbours.previous ? (
              <NeighbourLink
                href={`/releases/${neighbours.previous.id}`}
                direction="previous"
                title={safeString(neighbours.previous.title)}
              />
            ) : (
              <span />
            )}
            {neighbours.next ? (
              <NeighbourLink
                href={`/releases/${neighbours.next.id}`}
                direction="next"
                title={safeString(neighbours.next.title)}
              />
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </main>
    </div>
  );
}

/**
 * Un enlace externo de la sección de Enlaces.
 *
 * Lo que trae del diseño nuevo y NO es adorno: `min-h-[44px]` (el botón del
 * diseño anterior era `py-2` con un icono de 20 px, que se quedaba en 36) y el
 * anillo de foco. El icono va `aria-hidden`: el nombre de la plataforma ya lo
 * dice el texto, y un lector de pantalla no necesita oír "Spotify" dos veces.
 */
function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${className}`}
    >
      {children}
    </a>
  );
}

const CHEVRON_LEFT = "M15 19l-7-7 7-7";
const CHEVRON_RIGHT = "M9 5l7 7-7 7";

function NeighbourLink({
  href,
  direction,
  title,
}: {
  href: string;
  direction: "previous" | "next";
  title: string;
}) {
  const isNext = direction === "next";
  return (
    <Link
      href={href}
      rel={isNext ? "next" : "prev"}
      className={`group flex min-w-0 max-w-[48%] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition-colors hover:border-primary-400 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-primary-600 dark:hover:text-primary-300 dark:focus-visible:ring-offset-slate-950 ${
        isNext ? "flex-row-reverse text-right" : ""
      }`}
    >
      <svg
        className={`h-4 w-4 shrink-0 transition-transform ${
          isNext ? "group-hover:translate-x-0.5" : "group-hover:-translate-x-0.5"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={isNext ? CHEVRON_RIGHT : CHEVRON_LEFT} />
      </svg>
      <span className="min-w-0">
        <span className="block text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {isNext ? "Siguiente" : "Anterior"}
        </span>
        <span className="block truncate" title={title}>
          {title}
        </span>
      </span>
    </Link>
  );
}