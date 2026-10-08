import Link from "next/link";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoverImage } from "@/components/CoverImage";
import { AudioPlayer } from "@/components/AudioPlayer";
import { PageTransition, SlideIn } from "@/components/MotionWrappers";
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
import { NO_VALUE, ownDurationLabel, releaseTypeLabel, showableVideo } from "@/lib/release-page";
import { buildReleaseLinks, type ReleaseLink } from "@/lib/release-links";
import { getSocialPlatform } from "@/lib/social-platforms";
import { SocialPlatformIcon } from "@/components/ArtistSocialLinks";
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

  const { release, trackCount, isMultiTrack, durationLabel, tracks: metaChildren } = data;
  const cover = getCoverImage(release);
  /**
   * El MISMO helper que el badge, y no `capitalizeReleaseType`: si el badge dice
   * "EP" y la meta description dice "Single", el buscador sigue anunciando la
   * contradicción que se acaba de quitar de la carta.
   */
  const type = releaseTypeLabel(release.release_type, metaChildren.length > 0);

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

  /**
   * El tipo sale de un helper y no de `capitalizeReleaseType` porque las dos
   * reglas no coinciden en los datos: `Tour de France` (Kraftwerk) tiene
   * `release_type = 'Single'` y **2 hijas**, y el badge decía "Single" sobre una
   * carta que decía "2 pistas". Un single es una pista; si hay hijas, no es un
   * single. El helper vive en `lib/release-page.ts` porque `generateMetadata` lo
   * usa también — y por eso el buscador deja de anunciar lo mismo.
   */
  const type = releaseTypeLabel(release.release_type, childTracks.length > 0);
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

  /**
   * El reproductor, y por qué decide él solo.
   *
   * Un álbum no tiene audio: su fila existe solo para agrupar, y su
   * `audio_preview_url` está vacía. El reproductor caía en "No hay audio
   * disponible" con un botón de play que no hace nada, que es exactamente el
   * fallo que se pidió quitar. Así que solo se monta cuando **esta fila es una
   * pista** (`isTrackRow`).
   *
   * Y dentro de la pista no hay que decidir nada: `AudioPlayer` ya resuelve la
   * precedencia (preview de iTunes > Spotify/Apple > YouTube) y su `canPlay`
   * pregunta "¿suena algo?" y no "¿tiene enlaces?", así que un single con solo
   * YouTube reproduce el vídeo y uno sin ninguna fuente enseña el altavoz
   * apagado con su texto. Nada de esto se reimplementa aquí: se le pasa la fila
   * y se deja que decida.
   */
  const playableRow = isTrackRow ? release : null;

  /**
   * La duración de la barra de métricas. Ya viene calculada arriba y con el
   * filtro del relleno `"00:00"` aplicado (`ownDurationLabel`), así que aquí no
   * se vuelve a decidir nada: se enseña lo que hay, o un guion si no hay nada.
   */
  const heroFacts = [
    trackCount > 0 ? { label: "Pistas", value: String(trackCount) } : null,
    discCount > 1 ? { label: "Discos", value: String(discCount) } : null,
    durationLabel ? { label: "Duración", value: durationLabel } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32">
        {/* ── Migas ────────────────────────────────────────────────────────── */}
        <SlideIn index={0}>
          <nav
            className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4"
            aria-label="Ruta de navegación"
          >
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-slate-400 dark:hover:text-primary-400"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Dashboard
              </Link>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="truncate text-sm font-medium text-slate-900 dark:text-white">
                {safeString(release.title)}
              </span>
            </div>
          </nav>
        </SlideIn>

        {/* ── Carta: portada, datos, reproductor y barra de hechos ────────────
            El esqueleto es el de la ficha de pista: una sola caja blanca con la
            portada a un lado y la ficha al otro. Lo que cambia respecto a
            aquella —y es deliberado— es que aquí la portada se ve a tamaño de
            disco y no de miniatura, porque en un lanzamiento la portada ES el
            producto. */}
        <SlideIn index={1}>
          <section className="max-w-6xl mx-auto px-4 sm:px-6 mb-8">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-700/50 dark:bg-slate-800">
              <div className="flex flex-col sm:flex-row">
                {/* Portada. `CoverImage`, no `<Image>`: una URL que existe pero
                    está MUERTA sale igual con `<Image>` y se ve el icono de
                    imagen rota del navegador. Era lo que pasaba con las 9
                    portadas de la semilla, que apuntaban a `example.com`. */}
                {/* Portada, **siempre** 1:1.
                `CoverImage`, no `<Image>`: una URL que existe pero está MUERTA sale
                igual con `<Image>` y se ve el icono de imagen rota del navegador.
                Era lo que pasaba con las 9 portadas de la semilla, que apuntaban a
                `example.com`.

                El cuadrado es fijo y no `sm:h-full` a propósito. Con `h-full` la caja
                toma la altura de la fila, que depende de cuánto texto hay al lado: la
                misma portada salía a 288×288 en *Bohemian Rhapsody* y a 288×354 en
                otra ficha, y dos lanzamientos con la misma carátula no se veían
                igual. Un 1:1 declarado es el mismo siempre.

                El fondo del marco es para cuando la "portada" no existe y
                `getCoverImage` cae a la miniatura de YouTube, que es 16:9:
                `object-cover` la recorta a cuadrado y, sin fondo, el recorte deja
                un borde negro pegado al hueco. */}
                {cover ? (
                  <div className="flex-shrink-0 w-full sm:w-56 md:w-64 lg:w-72">
                    <div className="aspect-square bg-slate-100 dark:bg-slate-900">
                      <CoverImage
                        src={cover}
                        alt={safeString(release.title)}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ) : null}

                <div className="flex min-w-0 flex-1 flex-col justify-between p-5 sm:p-6 lg:p-8">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="inline-block rounded-full border border-primary-300 bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700 dark:border-primary-800 dark:bg-primary-950 dark:text-primary-300">
                        {type}
                      </span>
                    </div>

                    <h1 className="mb-2 text-2xl font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl lg:text-4xl">
                      {safeString(release.title)}
                    </h1>

                    <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">
                      {release.artist_name}
                    </p>

                    {/* Una sola línea de metadatos. La fecha solo si la hay: el
                        `—` de `safeString` es un relleno, no una fecha. */}
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {[
                        release.release_date && release.release_date !== "—"
                          ? formatDateES(release.release_date, { month: "long" })
                          : null,
                        `${trackCount} ${trackCount === 1 ? "pista" : "pistas"}`,
                        discCount > 1 ? `${discCount} discos` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>

                    {/*
                      Las métricas, en la línea de datos y no en un panel propio.
                      `value === null` se pinta como `—` y se explica con el
                      mismo `title`: sin texto, un guion suelto parece un bug de
                      render. Y el texto va también en `sr-only`, porque el
                      `title` solo existe en hover.
                    */}
                    <p
                      className="mt-2 text-sm text-slate-500 dark:text-slate-400"
                      title={metricsTitle}
                      data-testid="release-metrics"
                    >
                      {metricsValue} {isMultiTrack ? "reproducciones del lanzamiento" : "streams"}
                      <span className="sr-only">. {metricsTitle}</span>
                    </p>

                    {/* Acciones + badge de estado (solo admin o dueño) */}
                    <div className="mt-3">
                      <ReleaseActions
                        releaseId={release.id}
                        artistName={release.artist_name}
                        artistId={artist?.id ?? null}
                        status={release.status}
                      />
                    </div>
                  </div>

                  {playableRow ? (
                    <div className="mt-5">
                      <AudioPlayer
                        src={
                          playableRow.audio_preview_url &&
                          playableRow.audio_preview_url !== "—"
                            ? playableRow.audio_preview_url
                            : undefined
                        }
                        title={playableRow.title}
                        id={playableRow.id}
                        artist={playableRow.artist_name}
                        coverImage={getCoverImage(playableRow) || undefined}
                        track={{
                          audio_preview_url:
                            playableRow.audio_preview_url &&
                            playableRow.audio_preview_url !== "—"
                              ? playableRow.audio_preview_url
                              : null,
                          spotify_url: playableRow.spotify_url,
                          apple_music_url: playableRow.external_links?.apple_music ?? null,
                          youtube_video_id: playableRow.youtube_video_id,
                          external_links: playableRow.external_links ?? undefined,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Barra de hechos. Los tres datos que un periodista mira primero
                  de un disco: cuántas pistas, en cuántos discos y cuánto dura.
                  Se omiten los que no hay dato, en vez de enseñar un "0 discos"
                  que suena a disco de.formato único cuando lo que pasa es que no
                  se sabe. */}
              {heroFacts.length > 0 ? (
                <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {heroFacts.map((fact) => (
                      <div key={fact.label}>
                        <dt className="text-xs text-slate-500 dark:text-slate-400">
                          {fact.label}
                        </dt>
                        <dd className="text-lg font-bold text-slate-900 dark:text-white">
                          {fact.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          </section>
        </SlideIn>

        {/* ── Dos columnas: contenido arriba, datos de referencia al lado ────
            La barra lateral es lo que se consulta sin leer: dónde escucharlo,
            qué descargarse y qué hay al lado en el catálogo. */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="space-y-6 lg:space-y-8 lg:col-span-2">
              {/* ── 1 · Descripción ─────────────────────────────────────── */}
              {description ? (
                <section aria-labelledby="release-description">
                  <h2
                    id="release-description"
                    className="mb-4 text-xl font-bold text-slate-900 dark:text-white"
                  >
                    Descripción
                  </h2>
                  <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">
                    {description}
                  </p>
                </section>
              ) : null}

              {/* ── 2 · Pistas ─────────────────────────────────────────────
                  Vuelve `ReleaseTrackList`, el componente de antes, con sus
                  arreglos de a11y (44 px, anillo de foco, etiqueta con número y
                  título). Las filas NO enlazan a `/track/`: esa ruta es hoy un
                  301 a esta misma página, así que un enlace ahí sería un enlace
                  a donde ya estás. */}
              <section aria-labelledby="release-tracks" data-testid="release-play-section">
                <h2
                  id="release-tracks"
                  className="mb-4 text-xl font-bold text-slate-900 dark:text-white"
                >
                  Pistas ({trackCount})
                </h2>
                <ReleaseTrackList
                  tracks={listedTracks}
                  releaseTitle={safeString(release.title)}
                  releaseCoverImage={release.cover_image}
                  releaseYoutubeVideoId={release.youtube_video_id || undefined}
                />
              </section>

              {/* ── La ficha de una PISTA: lo que el 301 dejó sin página ───
                  `/track/[id]` es hoy un 301 para **toda** fila —hija o
                  cabecera—, así que su ficha solo se renderiza para las
                  huérfanas. Con eso, el videoclip oficial, la ficha técnica y la
                  galería de prensa de un single dejaron de tener **ninguna**
                  página donde estar.

                  Aquí vuelven, y solo cuando la fila **es** una pista
                  (`isTrackRow`): un álbum no tiene un videoclip oficial propio
                  ni una única afinación, y enseñar esos datos como si los
                  tuviera sería la tarjeta vacía que este proyecto ya pagó una
                  vez (era la rama `isRelease` de `/track/[id]`). */}
              {isTrackRow && ownVideo ? (
                <section>
                  <VideoShowcase
                    youtubeVideoId={ownVideo.youtubeVideoId}
                    videoEmbedUrl={ownVideo.videoEmbedUrl}
                    title="Videoclip Oficial"
                    coverImage={cover}
                  />
                </section>
              ) : null}

              {/* ── Y los del ÁLBUM, que son de sus hijas ──────────────────
                  Un álbum no tiene un vídeo propio: sus vídeos son los de sus
                  pistas. Y aquí hay una regla que antes no existía en ninguna
                  parte de la UI: `video_kind` (RC.33, Ola 4) **no lo leía
                  nadie**. Con la sección por scope, se lee, y su regla es la de
                  `showableVideo`: un `- Topic` autogenerado o un directo **no**
                  son el videoclip de la pista.

                  Con los datos de hoy la sección **no se monta**: las 28 hijas
                  con vídeo son 11 `live` y 17 `topic_audio`, y no hay ningún
                  `videoclip` curado. Está para cuando lo haya, y para que la
                  exclusión esté testeada en vez de depender de la memoria. */}
              {!isTrackRow ? (
                <ReleaseVideoList
                  tracks={childTracks}
                  releaseTitle={safeString(release.title)}
                />
              ) : null}

              {isTrackRow && hasProductionDetails(release.production_details) ? (
                <section>
                  <ProductionDetailsWrapper
                    details={release.production_details}
                    trackId={release.id}
                    artistName={release.artist_name}
                  />
                </section>
              ) : null}

              {isTrackRow && release.gallery_images && release.gallery_images.length > 0 ? (
                <section>
                  <ImageGalleryWrapper
                    images={release.gallery_images}
                    title="Galería de Prensa"
                    trackId={release.id}
                    artistName={release.artist_name}
                  />
                </section>
              ) : null}

              {/* ── 3 · Letra ────────────────────────────────────────────── */}
              {release.lyrics ? (
                <section aria-labelledby="release-lyrics">
                  <h2
                    id="release-lyrics"
                    className="mb-4 text-xl font-bold text-slate-900 dark:text-white"
                  >
                    Letra
                  </h2>
                  <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <p className="whitespace-pre-wrap font-mono text-sm text-slate-600 dark:text-slate-400">
                      {release.lyrics}
                    </p>
                  </div>
                </section>
              ) : null}
            </div>

            {/* ── Barra lateral ────────────────────────────────────────────
                `sticky` con `self-start`, porque la rejilla estira sus hijos por
                defecto: un elemento estirado ocupa toda la altura de la columna y no
                tiene nada que fijar. `self-start` lo deja a su altura natural.

                El motivo es el hueco. En *The Wall* —20 pistas, más de mil píxeles
                de scroll— la barra lateral acababa a los 400 y el tercio derecho se
                quedaba vacío el resto. Sticky no borra ese hueco al final de la
                página, pero los enlaces, la prensa y el anterior/siguiente quedan a
                la vista mientras se recorre la lista, que es justo cuando se
                necesitan. */}
            <aside className="space-y-6 lg:space-y-8 lg:sticky lg:top-6 lg:self-start">
              {/* ── Enlaces ─────────────────────────────────────────────────
                  `links` es la unión de todas las fuentes, no solo de
                  `external_links`. Antes se leía únicamente `external_links`, y
                  para 7 de los 9 singles del catálogo esa columna está vacía: su
                  Spotify y su Apple Music viven en `spotify_url` e
                  `itunes_track_id`, y su vídeo en `youtube_video_id`. El
                  resultado era una sección de Enlaces que **no salía**, con el
                  single lleno de enlaces en la base de datos. */}
              {links.length > 0 ? (
                <section
                  aria-labelledby="release-links"
                  className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-700/50 dark:bg-slate-800"
                >
                  <h2
                    id="release-links"
                    className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Enlaces Externos
                  </h2>
                  <div className="flex flex-col gap-2">
                    {links.map((link) => (
                      <ExternalLink key={link.key} link={link} />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* ── Ficha técnica para prensa ─────────────────────────────────
                Esto NO es de la pista: es **del artista**, y es la mitad del
                motivo por el que existe un EPK. `dossier` y `rider` exigen
                `artist_id` en servidor (`lib/export-bundle.ts` responde 400 sin
                él), así que sin este bloque no había forma de bajar nada desde
                una ficha de lanzamiento: la única otra página que montaba
                `CatalogDownloadButton` con alcance de artista era `/track/[id]`,
                que es un 301.

                Sin artista en la tabla `artists` degrada solo: `artistId` va a
                `null`, el componente **no monta** las dos filas que lo exigen (en
                vez de deshabilitarlas) y el catálogo sigue funcionando. */}
              <section
                aria-labelledby="release-press"
                className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-700/50 dark:bg-slate-800"
              >
                <h2
                  id="release-press"
                  className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100"
                >
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

              {/* ── Anterior / siguiente, SOBRE LANZAMIENTOS ─────────────────
                Los vecinos llegan de `getReleaseNeighbours`, que usa el catálogo
                del ARTISTA. No usan `getAllTracks()`: ese array mezcla las
                cabeceras con todas sus hijas, así que el "siguiente" de un
                álbum era su primer corte — y ese corte, desde P2, redirige a la
                página del propio álbum. Un enlace que vuelve al sitio del que
                saliste no es navegación. */}
              {neighbours.previous || neighbours.next ? (
                <nav
                  aria-label="Otros lanzamientos del artista"
                  className="flex items-stretch justify-between gap-3"
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
            </aside>
          </div>
        </div>
      </div>
    </PageTransition>
  );

}

/**
 * Un enlace externo de la sección de Enlaces.
 *
 * Lo que trae del diseño nuevo y NO es adorno: `min-h-[44px]` (el botón del
 * diseño anterior era `py-2` con un icono de 20 px, que se quedaba en 36) y el
 * anillo de foco. El icono va `aria-hidden`: el nombre de la plataforma ya lo
 * dice el texto, y un lector de pantalla no necesita oír "Spotify" dos veces.
 *
 * El color de marca va en `style` y no en `className`: Tailwind solo genera las
 * clases que encuentra **literales** en el fuente, así que un `bg-[#1DB954]`
 * armado por interpolación no existe en la hoja de estilos y el botón salía
 * sin fondo. El texto y el `d` del icono vienen de `lib/social-platforms.ts`.
 */
function ExternalLink({ link }: { link: ReleaseLink }) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ backgroundColor: link.color }}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-white transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
    >
      <SocialPlatformIcon
        platform={getSocialPlatform(link.platformKey)!}
        className="w-5 h-5"
      />
      {link.label}
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