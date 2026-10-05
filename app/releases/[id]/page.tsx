import Image from "next/image";
import Link from "next/link";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReleaseActions } from "@/components/ReleaseActions";
import { ReleaseTrackList } from "@/components/ReleaseTrackList";
import { VideoShowcase } from "@/components/VideoShowcase";
import { ReleaseVideoList } from "@/components/ReleaseVideoList";
import { ProductionDetailsWrapper } from "@/components/ProductionDetailsWrapper";
import { ImageGalleryWrapper } from "@/components/ImageGalleryWrapper";
import { CatalogDownloadButton } from "@/components/CatalogDownloadButton";
import { getArtistByName } from "@/lib/db";
import { hasProductionDetails } from "@/lib/production-fields";
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
import { NO_VALUE, ownDurationLabel, showableVideo } from "@/lib/release-page";
import type { Track } from "@/types/music";

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

  /**
   * El artista, para el bloque de descargas de prensa.
   *
   * `getReleaseNeighbours` ya lo busca por dentro para el catálogo, así que esto
   * no introduce una fuente de datos nueva: es la **misma** fila de `artists`,
   * leída por su nombre. Lo que hace falta es el `id`, porque `dossier` y
   * `rider` lo exigen en servidor (`lib/export-bundle.ts` responde 400 sin él) y
   * son las dos secciones por las que un periodista viene aquí.
   */
  const artist = await getArtistByName(release.artist_name);

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

  /**
   * ## Esta fila ES una pista
   *
   * La misma fila es cabecera de release y pista, y **no hay forma de decirlo por
   * el esquema**: la única señal es si tiene hijas. Así que `!isMultiTrack` es
   * exactamente "esta fila es una canción".
   *
   * De eso depende la ficha: el videoclip, la ficha técnica y la galería de
   * prensa son **datos de una pista**, no de un disco. Un álbum no tiene
   * videoclip oficial propio ni una única afinación, y pintarlos sería la
   * tarjeta vacía que la plantilla de `/track/[id]` ya tenía (era su rama
   * `isRelease`). La descarga de prensa, en cambio, es **del artista**, y se
   * muestra en los dos casos: es la mitad del motivo por el que existe un EPK.
   */
  const isTrackRow = !isMultiTrack;
  const links = buildReleaseLinks(release);
  /** El vídeo de **esta** fila, si se puede enseñar. `null` en un álbum. */
  const ownVideo = showableVideo(release);

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
        {/*
          `links` es la unión de todas las fuentes, no solo de
          `external_links`. Antes se leía únicamente `external_links`, y para 7 de
          los 9 singles del catálogo esa columna está vacía: su Spotify y su Apple
          Music viven en `spotify_url` e `itunes_track_id`, y su vídeo en
          `youtube_video_id`. El resultado era una sección de Enlaces que **no
          salía**, con el single lleno de enlaces en la base de datos.
        */}
        {links.length > 0 ? (
          <section className="mb-8" aria-labelledby="release-links">
            <h2 id="release-links" className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Enlaces
            </h2>
            <div className="flex flex-wrap gap-3">
              {links.map((link) => (
                <ExternalLink key={link.key} href={link.href} className={link.className}>
                  {link.icon}
                  {link.label}
                </ExternalLink>
              ))}
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

        {/* ── La ficha de una PISTA: lo que el 301 dejó sin página ─────────── */}
        {/*
          `/track/[id]` es hoy un 301 para **toda** fila —hija o cabecera—, así que
          su ficha solo se renderiza para las huérfanas. Con eso, el videoclip
          oficial, la ficha técnica y la galería de prensa de un single dejaron de
          tener **ninguna** página donde estar: no estaban en la de release y la
          otra es un redirect.

          Aquí vuelven, y solo cuando la fila **es** una pista (`isTrackRow`): un
          álbum no tiene un videoclip oficial propio ni una única afinación, y
          enseñar esos datos como si los tuviera sería la tarjeta vacía que este
          proyecto ya pagó una vez (era la rama `isRelease` de `/track/[id]`).
        */}
        {isTrackRow && ownVideo ? (
          <section className="mb-8">
            <VideoShowcase
              youtubeVideoId={ownVideo.youtubeVideoId}
              videoEmbedUrl={ownVideo.videoEmbedUrl}
              title="Videoclip Oficial"
              coverImage={cover}
            />
          </section>
        ) : null}

        {/* ── Y los del ÁLBUM, que son de sus hijas ─────────────────────────── */}
        {/*
          Un álbum no tiene un vídeo propio: sus vídeos son los de sus pistas. Y
          aquí hay una regla que antes no existía en ninguna parte de la UI:
          `video_kind` (RC.33, Ola 4) **no lo leía nadie**. Con la sección por
          scoped, se lee, y su regla es la de `showableVideo`: un `- Topic`
          autogenerado o un directo **no** son el videoclip de la pista.

          Con los datos de hoy la sección **no se monta**: las 28 hijas con vídeo
          son 11 `live` y 17 `topic_audio`, y no hay ningún `videoclip` curado.
          Está para cuando lo haya, y para que la exclusión esté testeada en vez
          de depender de la memoria.
        */}
        {!isTrackRow ? <ReleaseVideoList tracks={childTracks} releaseTitle={safeString(release.title)} /> : null}

        {isTrackRow && hasProductionDetails(release.production_details) ? (
          <section className="mb-8">
            <ProductionDetailsWrapper
              details={release.production_details}
              trackId={release.id}
              artistName={release.artist_name}
            />
          </section>
        ) : null}
        {isTrackRow && release.gallery_images && release.gallery_images.length > 0 ? (
          <section className="mb-8">
            <ImageGalleryWrapper
              images={release.gallery_images}
              title="Galería de Prensa"
              trackId={release.id}
              artistName={release.artist_name}
            />
          </section>
        ) : null}

        {/* ── Ficha técnica para prensa ─────────────────────────────────────── */}
        {/*
          Esto NO es de la pista: es **del artista**, y es la mitad del motivo por
          el que existe un EPK. `dossier` y `rider` exigen `artist_id` en servidor
          (`lib/export-bundle.ts` responde 400 sin él), así que sin este bloque no
          había forma de bajar nada desde una ficha de lanzamiento: la única otra
          página que montaba `CatalogDownloadButton` con alcance de artista era
          `/track/[id]`, que es un 301.

          Sin artista en la tabla `artists` degrada solo: `artistId` va a `null`, el
          componente **no monta** las dos filas que lo exigen (en vez de
          deshabilitarlas) y el catálogo sigue funcionando.
        */}
        <section className="mb-8" aria-labelledby="release-press">
          <h2 id="release-press" className="text-xl font-bold text-slate-900 dark:text-white mb-4">
            Ficha técnica para prensa
          </h2>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            {artist ? (
              <>
                Descarga el catálogo de{" "}
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {safeString(artist.name)}
                </span>
                : dossier de prensa, rider técnico y fichas de cada lanzamiento
                aprobado, con métricas y enlaces.
              </>
            ) : (
              <>
                Descarga el catálogo público de PressPlay con métricas, enlaces y
                detalles de producción de cada lanzamiento aprobado. El dossier y el
                rider son por artista y todavía no hay ficha de artista para{" "}
                {safeString(release.artist_name)}.
              </>
            )}
          </p>
          <CatalogDownloadButton
            artistId={artist?.id ?? null}
            artistName={
              artist ? safeString(artist.name) : safeString(release.artist_name, "PressPlay")
            }
          />
        </section>

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

const SPOTIFY_ICON = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

const APPLE_ICON = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0019.2.25a9.472 9.472 0 00-1.317-.24c-.58-.06-1.16-.08-1.74-.06H7.857c-.58-.02-1.16 0-1.74.06-.46.04-.92.1-1.36.2A5.022 5.022 0 002.426.89C1.308 1.624.564 2.624.246 3.934a9.23 9.23 0 00-.24 2.19c-.06.58-.08 1.16-.06 1.74v10.68c-.02.58 0 1.16.06 1.74.04.46.1.92.24 1.36.318 1.31 1.062 2.31 2.18 3.043a9.472 9.472 0 001.868.64c.44.1.9.16 1.36.2.58.06 1.16.08 1.74.06h8.286c.58.02 1.16 0 1.74-.06.46-.04.92-.1 1.36-.2a5.022 5.022 0 001.868-.64c1.118-.734 1.862-1.734 2.18-3.043.14-.44.2-.9.24-1.36.06-.58.08-1.16.06-1.74V7.864c.02-.58 0-1.16-.06-1.74zM17.994 15.854l-.002-6.48-5.496 3.22v6.08l5.498-2.82z" />
  </svg>
);

const YOUTUBE_ICON = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const DEEZER_ICON = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18.81 4.16v3.19h-4.78V4.16h4.78zm0 4.57v3.19h-4.78V8.73h4.78zm0 4.58v3.19h-4.78v-3.19h4.78zM6.39 4.16v3.19H1.61V4.16h4.78zm0 4.57v3.19H1.61V8.73h4.78zm0 4.58v3.19H1.61v-3.19h4.78zM12.6 9.56v7.93h-4.78V9.56h4.78z" />
  </svg>
);

interface ReleaseLink {
  key: string;
  href: string;
  label: string;
  className: string;
  icon: React.ReactNode;
}

/**
 * ## Los enlaces de un lanzamiento, de TODAS las fuentes
 *
 * Hay dos sitios donde vive un enlace a una plataforma, y se llenan por caminos
 * distintos:
 *
 * | Plataforma | Columna "preferida" | La que se leía antes |
 * |---|---|---|
 * | Spotify | `external_links.spotify` | `external_links.spotify` |
 * | Apple Music | `external_links.apple_music` | `external_links.apple_music` |
 * | YouTube | `external_links.youtube` | `external_links.youtube` |
 * | Deezer | `external_links.deezer` | — no salía |
 * | Bandcamp | `external_links.bandcamp` | — no salía |
 *
 * Con **solo** `external_links`, 7 de los 9 singles del catálogo no tenían
 * sección de Enlaces: su Spotify está en `spotify_url`, su Apple en
 * `itunes_track_id` y su vídeo en `youtube_video_id`. La sección se escondía
 * entera porque la condición era `Object.keys(external_links).length > 0`.
 *
 * Las reglas son tres, y las tres importan:
 *
 * 1. **Primero `external_links`, después la columna de la fila.** Es la que
 *    escribe una persona; la otra la rellena un proceso. Si las dos existen, gana
 *    la curada.
 * 2. **`""` es ausencia.** `lib/db.ts` pasa la columna por `safeString`, que
 *    convierte `""` en el string **truthy** `"—"`. Por eso hay que filtrar por
 *    largo y no por "no es null": sin esto, un `external_links.spotify` vacío
 *    pinta un botón que lleva a una página que no existe.
 * 3. **Un enlace por plataforma.** Si `external_links.youtube` y
 *    `youtube_video_id` apuntan al mismo vídeo, sale **un** botón. Con un
 *    `??` por plataforma sale solo, y por eso no hace falta un `Set`.
 */
function buildReleaseLinks(release: Track): ReleaseLink[] {
  const external = release.external_links ?? {};
  const links: ReleaseLink[] = [];

  const usable = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    // `—` es el placeholder de `safeString` para una columna vacía.
    if (trimmed === "" || trimmed === "—" || trimmed === "-") return null;
    return trimmed;
  };

  const spotify = usable(external.spotify) ?? usable(release.spotify_url);
  if (spotify) {
    links.push({
      key: "spotify",
      href: spotify,
      label: "Spotify",
      className: "bg-[#1DB954] hover:bg-[#1ed760]",
      icon: SPOTIFY_ICON,
    });
  }

  const apple =
    usable(external.apple_music) ??
    (usable(release.itunes_track_id)
      ? `https://music.apple.com/us/album/${usable(release.itunes_track_id)}`
      : null);
  if (apple) {
    links.push({
      key: "apple",
      href: apple,
      label: "Apple Music",
      className: "bg-[#FC3C44] hover:bg-[#e0353c]",
      icon: APPLE_ICON,
    });
  }

  const youtube =
    usable(external.youtube) ??
    (usable(release.youtube_video_id)
      ? `https://www.youtube.com/watch?v=${usable(release.youtube_video_id)}`
      : null);
  if (youtube) {
    links.push({
      key: "youtube",
      href: youtube,
      label: "YouTube",
      className: "bg-[#FF0000] hover:bg-[#cc0000]",
      icon: YOUTUBE_ICON,
    });
  }

  const deezer = usable(external.deezer);
  if (deezer) {
    links.push({
      key: "deezer",
      href: deezer,
      label: "Deezer",
      className: "bg-[#a238ff] hover:bg-[#8f2ee0]",
      icon: DEEZER_ICON,
    });
  }

  const bandcamp = usable(external.bandcamp);
  if (bandcamp) {
    links.push({
      key: "bandcamp",
      href: bandcamp,
      label: "Bandcamp",
      className: "bg-[#629aa9] hover:bg-[#548794]",
      icon: null,
    });
  }

  return links;
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