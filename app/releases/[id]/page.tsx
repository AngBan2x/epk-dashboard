import Image from "next/image";
import Link from "next/link";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReleaseActions } from "@/components/ReleaseActions";
import { ReleaseTracklistSection } from "@/components/ReleaseTracklistSection";
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
   * forma se conserva tal cual.
   *
   * Lo que P2 añade es la rama de los **0 hijas**, que antes no existía:
   * `sumDurations([])` es `null`, así que la expresión caía a
   * `release.duration` en crudo, y el relleno `"00:00"` del seed salía como si
   * el disco durara cero. Los 6 singles sin hijas del catálogo son
   * precisamente los que sufferían ese caso, y son los que el usuario pidió
   * cerrar.
   *
   * `ownDurationLabel` (`lib/release-page.ts`) es la que aplica el filtro del
   * relleno, y está en UN sitio: aquí no se reimplementa nada, se le pregunta.
   *
   * Asimetría que se acepta a propósito: el filtro de `0` segundos no se aplica
   * a la rama con hijas. Solo lo dispararía un tracklist entero de `"00:00"`,
   * que no aparece en el catálogo (las duraciones de las hijas las escribe una
   * persona), mientras que sí aparece el `"00:00"` del padre. La versión
   * estricta, que cubre los dos casos, es `releaseDurationLabel` y es la que
   * usan los tests y `generateMetadata`.
   */
  const totalDuration = sumDurations(childTracks.map((t) => t.duration));
  const durationLabel = (isMultiTrack ? totalDuration?.label : null) ?? ownDurationLabel(release);

  const neighbours = await getReleaseNeighbours(release);

  const cover = getCoverImage(release);
  const type = capitalizeReleaseType(release.release_type);
  const year =
    release.release_date && /^\d{4}/.test(release.release_date)
      ? release.release_date.slice(0, 4)
      : null;
  const metricsTitle = metricsTooltip(metrics);
  const metricsValue = metrics.value === null ? NO_VALUE : formatNumber(metrics.value);

  const description = (release as unknown as { description?: string | null }).description;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <nav aria-label="Miga de pan" className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <li>
              <Link
                href="/artists"
                className="rounded transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
              >
                Catálogo
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-300 dark:text-slate-600">
              /
            </li>
            <li className="min-w-0">
              <span className="block truncate font-medium text-slate-900 dark:text-white">
                {safeString(release.title)}
              </span>
            </li>
          </ol>
        </nav>

        {/* ── Cabecera ────────────────────────────────────────────────────── */}
        <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {/*
            El degradado. "Rico" aquí no es adorno: la ficha de un disco se
            reconoce de un vistazo por su portada, y el color es la mitad de esa
            señal. Se hace con la portada ampliada y desenfocada detrás de un
            velo oscuro, en vez de sacar el promedio de los píxeles: promediar exige
            descargar la imagen, y eso en servidor es una llamada de red por
            render (con el `unoptimized` que usa el catálogo, la descarga entera).

            El velo `bg-slate-950/72` no es decorativo: es lo que garantiza el
            contraste del texto blanco sobre lo que sea que haya detrás. Sin
            él, un álbum con portada blanca pasa de 4.5:1 a 2:1.
          */}
          <div className="relative">
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
              {cover ? (
                <Image
                  src={cover}
                  alt=""
                  fill
                  unoptimized
                  sizes="100vw"
                  className="scale-110 object-cover opacity-60 blur-3xl"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/70 to-primary-950/80" />
            </div>

            <div className="relative flex flex-col gap-6 p-5 sm:p-8 md:flex-row md:items-end">
              <div className="w-40 shrink-0 sm:w-48 md:w-56">
                {cover ? (
                  <Image
                    src={cover}
                    alt={`Portada de ${safeString(release.title)}`}
                    width={224}
                    height={224}
                    unoptimized
                    className="aspect-square w-full rounded-xl object-cover shadow-2xl ring-1 ring-white/20"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={`Portada de ${safeString(release.title)}`}
                    className="flex aspect-square w-full items-center justify-center rounded-xl bg-white/10 text-5xl font-bold text-white/80 shadow-2xl ring-1 ring-white/20"
                  >
                    {safeString(release.title).trim().charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 text-white">
                {/* Jerarquía: el tipo es lo más pequeño (es un dato), el título
                    es lo más grande (es lo que se recuerda). Ese orden es el
                    que la plantilla de pista suelta no tenía. */}
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  {type}
                  {year ? ` · ${year}` : ""}
                </p>
                <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  {safeString(release.title)}
                </h1>
                <p className="mt-2 text-base text-white/80">{release.artist_name}</p>

                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/80">
                  <li className="flex items-center gap-1.5">
                    <span aria-hidden="true">🎵</span>
                    <span className="tabular-nums">
                      <span className="sr-only">Pistas: </span>
                      {trackCount} {trackCount === 1 ? "pista" : "pistas"}
                      {discCount > 1 ? ` · ${discCount} discos` : ""}
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {/*
                        El caso de 0 hijas: `durationLabel` sale de la duración
                        del PROPIO release, filtrada por `ownDurationLabel`. Antes
                        aquí se pintaba `release.duration` en crudo y el relleno
                        `"00:00"` del seed salía como si el disco durara cero.
                    */}
                    <span className="tabular-nums">
                      <span className="sr-only">Duración: </span>⏱️ {durationLabel}
                    </span>
                  </li>
                  {release.release_date ? (
                    <li className="flex items-center gap-1.5">
                      <span aria-hidden="true">📅</span>
                      <span>
                        <span className="sr-only">Fecha: </span>
                        {formatDateES(release.release_date, { month: "long" })}
                      </span>
                    </li>
                  ) : null}
                </ul>

                <div className="mt-5">
                  <ReleaseActions
                    releaseId={release.id}
                    artistName={release.artist_name}
                    status={release.status}
                  />
                </div>
              </div>
            </div>
          </div>

          {/*
            Métricas del lanzamiento. `Metrics | null` se resuelve con
            `lib/metrics-source.ts` —padre y hijas en la MISMA fuente (RC.33)— y
            `value === null` se pinta como `—`.

            No se reutiliza `UnifiedMetrics`: ese componente formatea
            `streamCount` con `formatNumber(...)`, y un release sin dato
            llegaría con `0` y saldría un "0 Streams" con tipografía de dato.
            Eso es exactamente el bug que RC.33 cerró en `EPKCard`, y el
            reintroducir aquí lo dejaría vivo por otro camino.
          */}
          <div className="border-t border-white/10 bg-slate-900/40 px-5 py-4 sm:px-8">
            <div className="text-center">
              <p
                className="text-2xl font-bold text-white sm:text-3xl"
                title={metricsTitle}
              >
                {metricsValue}
                {/* El `title` solo sale en hover: en móvil y en lector de
                    pantalla no existe, así que el mismo texto va en `sr-only`. */}
                <span className="sr-only">. {metricsTitle}</span>
              </p>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-white/60">
                {isMultiTrack ? "Reproducciones del lanzamiento" : "Streams"}
              </p>
            </div>
          </div>
        </header>

        {/* ── El único sitio de play ──────────────────────────────────────── */}
        <div className="mt-6">
          <ReleaseTracklistSection
            release={release}
            tracks={childTracks}
            durationLabel={durationLabel}
          />
        </div>

        {description ? (
          <section aria-labelledby="release-description" className="mt-8">
            <h2
              id="release-description"
              className="mb-3 text-lg font-bold text-slate-900 dark:text-white"
            >
              Descripción
            </h2>
            <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">
              {description}
            </p>
          </section>
        ) : null}

        {release.lyrics ? (
          <section aria-labelledby="release-lyrics" className="mt-8">
            <h2
              id="release-lyrics"
              className="mb-3 text-lg font-bold text-slate-900 dark:text-white"
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

        {release.external_links && Object.keys(release.external_links).length > 0 ? (
          <section aria-labelledby="release-links" className="mt-8">
            <h2
              id="release-links"
              className="mb-3 text-lg font-bold text-slate-900 dark:text-white"
            >
              Enlaces
            </h2>
            <ul className="flex flex-wrap gap-3">
              {release.external_links.spotify ? (
                <li>
                  <ExternalLink href={release.external_links.spotify} className="bg-[#1DB954] hover:bg-[#1ed760]">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                    Escuchar en Spotify
                  </ExternalLink>
                </li>
              ) : null}
              {release.external_links.apple_music ? (
                <li>
                  <ExternalLink href={release.external_links.apple_music} className="bg-[#FC3C44] hover:bg-[#e0353c]">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0019.2.25a9.472 9.472 0 00-1.317-.24c-.58-.06-1.16-.08-1.74-.06H7.857c-.58-.02-1.16 0-1.74.06-.46.04-.92.1-1.36.2A5.022 5.022 0 002.426.89C1.308 1.624.564 2.624.246 3.934a9.23 9.23 0 00-.24 2.19c-.06.58-.08 1.16-.06 1.74v10.68c-.02.58 0 1.16.06 1.74.04.46.1.92.24 1.36.318 1.31 1.062 2.31 2.18 3.043a9.472 9.472 0 001.868.64c.44.1.9.16 1.36.2.58.06 1.16.08 1.74.06h8.286c.58.02 1.16 0 1.74-.06.46-.04.92-.1 1.36-.2a5.022 5.022 0 001.868-.64c1.118-.734 1.862-1.734 2.18-3.043.14-.44.2-.9.24-1.36.06-.58.08-1.16.06-1.74V7.864c.02-.58 0-1.16-.06-1.74zM17.994 15.854l-.002-6.48-5.496 3.22v6.08l5.498-2.82z" />
                    </svg>
                    Escuchar en Apple Music
                  </ExternalLink>
                </li>
              ) : null}
              {release.external_links.youtube ? (
                <li>
                  <ExternalLink href={release.external_links.youtube} className="bg-[#FF0000] hover:bg-[#cc0000]">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                    Ver en YouTube
                  </ExternalLink>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {/* ── Anterior / siguiente, SOBRE LANZAMIENTOS ────────────────────── */}
        {/*
          Los vecinos llegan de `getReleaseNeighbours`, que usa el catálogo del
          ARTISTA. No usan `getAllTracks()`: ese array mezcla las 18 cabeceras
          con todas sus hijas, así que el "siguiente" de un álbum era su primer
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

const CHEVRON_LEFT =
  "M15 19l-7-7 7-7";
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