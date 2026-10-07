import Image from "next/image";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ProductionDetailsWrapper } from "@/components/ProductionDetailsWrapper"
import { LyricsSectionWrapper } from "@/components/LyricsSectionWrapper";

import { ImageGalleryWrapper } from "@/components/ImageGalleryWrapper";
import { CatalogDownloadButton } from "@/components/CatalogDownloadButton";
import { VideoShowcase } from "@/components/VideoShowcase";

export const dynamic = "force-dynamic";
import { BioSection } from "@/components/BioSection";
import { CoverImage } from "@/components/CoverImage";
import { ReleaseTracklistSection } from "@/components/ReleaseTracklistSection";
import LastfmMetrics from "@/components/LastfmMetrics";
import { UnifiedMetrics } from "@/components/UnifiedMetrics";
import { PageTransition, SlideIn } from "@/components/MotionWrappers";
import { getTrackById, getAllTracks, getArtistByName, getTracksByReleaseId } from "@/lib/db";
import { resolveTrackRoute } from "@/lib/releases";
import { buildReleaseLinks, type ReleaseLink } from "@/lib/release-links";
import { getSocialPlatform } from "@/lib/social-platforms";
import { SocialPlatformIcon } from "@/components/ArtistSocialLinks";
import { hasProductionDetails } from "@/lib/production-fields";
import { safeString, formatNumber, capitalizeReleaseType, getCoverImage, sumDurations } from "@/lib/null-safe";
import type { Track } from "@/types/music";

interface TrackDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * El texto de cada enlace del sidebar, y su tono.
 *
 * ## Por qué esto NO está en `lib/release-links.ts`
 *
 * Porque es **copy de esta vista**. La ficha de release pinta un botón con el
 * nombre de la plataforma; la barra lateral dice "Escuchar en Spotify" o "Ver en
 * YouTube". Lo que las dos comparten es el `href`, el `color` y el `d` del
 * icono, y eso sí vive en el módulo común. Poner aquí los verbos sería mezclar
 * dos lecturas de lo mismo y volver a crear las dos copias que este refactor
 * acaba de borrar.
 */
const CTA: Record<string, (label: string) => string> = {
  spotify: (l) => `Escuchar en ${l}`,
  "apple-music": (l) => `Escuchar en ${l}`,
  tidal: (l) => `Escuchar en ${l}`,
  deezer: (l) => `Escuchar en ${l}`,
  bandcamp: (l) => `Escuchar en ${l}`,
  /** YouTube es donde se **ve**, no donde se escucha: la diferencia es el verbo. */
  youtube: () => "Ver en YouTube",
};

/**
 * Tono del texto. Sin `dark:` propio por plataforma: el color de marca ya está
 * en `SOCIAL_PLATFORMS`, y estas clases son **literales** a propósito, porque
 * Tailwind solo genera lo que encuentra escrito en el fuente.
 */
const TONO: Record<string, string> = {
  spotify: "text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30",
  "apple-music": "text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/30",
  tidal: "text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30",
  deezer: "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30",
  bandcamp: "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50",
  youtube: "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30",
};

type SidebarLink = ReleaseLink & { cta: string; textTone: string };

function sidebarLinksOf(track: Track): SidebarLink[] {
  return buildReleaseLinks(track).map((link) => ({
    ...link,
    cta: (CTA[link.key] ?? ((l: string) => l))(link.label),
    textTone: TONO[link.key] ?? "text-slate-600 dark:text-slate-300",
  }));
}

export async function generateMetadata({ params }: TrackDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const track = await getTrackById(id);
  if (!track) {
    return { title: "Track no encontrado" };
  }

  // Un album no tiene duracion ni streams propios, asi que la descripcion
  // terminaba en "Álbum - 00:00 - 0 streams" en buscadores y previews de
  // enlaces. Cuenta las pistas y omite los campos que no aplican.
  const children = await getTracksByReleaseId(id);
  if (children.length > 0) {
    const type = capitalizeReleaseType(track.release_type);
    return {
      title: `${track.title} | PressPlay`,
      description: `${type} de ${track.artist_name} · ${children.length} ${
        children.length === 1 ? "pista" : "pistas"
      } · ${track.release_date}`,
    };
  }

  const streams = track.streams ?? track.metrics?.streams ?? 0;
  return {
    title: `${track.title} | PressPlay`,
    description: `${capitalizeReleaseType(track.release_type)} - ${track.duration} - ${formatNumber(streams)} ${streams === 1 ? "stream" : "streams"}`,
  };
}

export default async function TrackDetailPage({ params }: TrackDetailPageProps) {
  const { id } = await params;

  /**
   * P2 · Ola 10 — esta ruta deja de ser la ficha de una pista sin más.
   *
   * `tracks.release_id` es la columna que hace de una fila hija de un
   * lanzamiento (el enunciado la llama `parent_id`, pero en el esquema se llama
   * `release_id`: `lib/db.ts:218`, y `Track.release_id` es lo que expone
   * `parseTrack`). Una fila con `release_id` puesta ya **no es una página**:
   * su contenido se presenta en `/releases/[padre]`, que es la única página de
   * ese contenido. Así que aquí se redirige, y no se replica.
   *
   * `resolveTrackRoute` decide los cuatro casos (ver `lib/releases.ts` para
   * por qué se comprueba antes de redirigir y qué pasa con una hija sin padre).
   * Los dos primeros son `never`: `notFound()` y `redirect()` lanzan. Por eso
   * `route.track` queda estrechado sin `as Track` ni `!` — y sin ese
   * estrechamiento habría que escribir un cast, que es exactamente lo que
   * rompe el caso de "no existe", el único que importa.
   */
  const route = await resolveTrackRoute(id);
  if (route.kind === "missing") notFound();
  if (route.kind === "release") redirect(route.href);
  const track = route.track;
  /** Hija cuyo `release_id` apunta a una fila que ya no existe. */
  const isOrphan = route.kind === "orphan";

  const [artist, allTracks, children] = await Promise.all([
    getArtistByName(track.artist_name),
    getAllTracks(),
    getTracksByReleaseId(id),
  ]);

  /**
   * Anterior / siguiente: SOLO sobre filas que son un lanzamiento.
   *
   * `getAllTracks()` devuelve las cabeceras y todas las hijas en un mismo
   * array, así que el índice avanzaba por dentro de un álbum. Desde P2 una hija
   * redirige a la página de su padre, de modo que "siguiente" podía llevar a la
   * página de la que se acaba de salir. Filtrar aquí quita las hijas del
   * contador sin cambiar nada más del render.
   */
  const navigable = allTracks.filter((t) => !t.release_id);
  const currentIndex = navigable.findIndex(t => t.id === id);
  const prevTrack = currentIndex > 0 ? navigable[currentIndex - 1] : null;
  const nextTrack = currentIndex >= 0 && currentIndex < navigable.length - 1 ? navigable[currentIndex + 1] : null;

  const streamCount = track.streams ?? track.metrics?.streams ?? 0;

  // Una fila que tiene hijas es un LANZAMIENTO (album, EP), no una pista. La
  // pagina estaba maquetada para la pista suelta, asi que un album se
  //Rendering con seis tarjetas vacias: "Letra no disponible" con un boton
  // "Expandir" que no expande nada, "Videoclip Oficial" con "Sin video" sobre
  // una imagen gigante, "Sin datos de produccion", "No hay enlaces externos",
  // y unas metricas de Last.fm que son de otra cancion. Y sin la lista de
  // pistas, que es justo lo que viene a buscar un periodista.
  const isRelease = children.length > 0;

  // El padre no tiene duracion propia: el seed le pone "00:00" y la portada
  // mostraba "Álbum 00:00" como si fuera un tramo. La duracion real se calcula
  // al sumar la de sus pistas.
  //
  // P15: con `sumDurations` de `lib/null-safe.ts`, no con un parser propio. El
  // que había aquí hacía `const [m, s] = value.split(":")`, que con tres
  // segmentos ("1:02:03") sumaba 62 s en vez de 3723 — y el `isNaN` de guarda
  // no saltaba, así que el error era silencioso. `sumDurations` además
  // devuelve `null` (no `0`) cuando no hay nada sumable, para no pintar "0:00"
  // como si un disco recién creado durara cero.
  const totalDuration = sumDurations(children.map((t) => t.duration));
  const totalDurationLabel = totalDuration?.label ?? null;

  /**
   * Los enlaces del sidebar. Se resuelven con el MISMO módulo que la ficha de
   * release, así que Tidal aparece en las dos vistas desde el momento en que hay
   * un enlace curado, y no cuando alguien se acuerde de añadirlo en la segunda.
   */
  const sidebarLinks = sidebarLinksOf(track);

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32">
        {/*
            Hija huérfana: `release_id` apunta a una fila que ya no existe.

            `release_id` no es foreign key (`lib/db.ts:218`, `release_id TEXT`
            pelado), así que esto es alcanzable: un script, un `DELETE`
            directo o un padre borrado en una cascada que no corrió dejan la
            hija apuntando al vacío. Redirigir a `/releases/<padre-inexistente>`
            daría un 404 en una URL que no le dice nada a quien la ve; dar un
            404 aquí tiraría una pista que **sí** existe y que además se puede
            reproducir. Así que se muestra, con el aviso en la primera línea.

            El aviso importa tanto como la decisión: sin él, el visitante
            llegaría aquí desde un enlace viejo y concluiría que el catálogo
            está roto, cuando lo que pasó es que se borró el disco.
        */}
        {isOrphan && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
            <p
              role="status"
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              Esta pista formaba parte de un lanzamiento que ya no está en el
              catálogo. Puedes reproducirla aquí, pero ya no hay ficha del disco
              al que perteneció.
            </p>
          </div>
        )}

        {/* Header / Breadcrumb */}
        <SlideIn index={0}>
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4" aria-label="Breadcrumb">
            <div className="flex items-center gap-3">
              <a
                href="/dashboard"
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Dashboard
              </a>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {safeString(track.title)}
              </span>
            </div>
          </nav>
        </SlideIn>

        {/* Hero Section — Cover + Title + Player */}
        <SlideIn index={1}>
          <section className="max-w-6xl mx-auto px-4 sm:px-6 mb-8">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/50 overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                {/* Cover Art */}
                <div className="sm:w-56 md:w-64 lg:w-72 flex-shrink-0">
                  <div className="aspect-square sm:aspect-auto sm:h-full">
                    <CoverImage
                      src={getCoverImage(track)}
                      alt={safeString(track.title)}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* Track Info */}
                <div className="flex-1 p-5 sm:p-6 lg:p-8 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-800">
                        {capitalizeReleaseType(track.release_type)}
                      </span>
                      {/* El padre no tiene duracion propia. Mostrar su "00:00"
                          de relleno leia como un tramo de cero segundos; se
                          muestra la suma de sus pistas, o nada si no hay datos. */}
                      {!isRelease && track.duration && track.duration !== "00:00" && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {track.duration}
                        </span>
                      )}
                      {isRelease && totalDurationLabel && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {children.length} pistas &middot; {totalDurationLabel}
                        </span>
                      )}
                    </div>

                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2 leading-tight">
                      {safeString(track.title)}
                    </h1>

                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">
                      {track.artist_name}
                    </p>
                    <p className="text-slate-400 dark:text-slate-500 text-xs">
                      {track.release_date}
                      {/* Los streams son de una pista. En un lanzamiento padre
                          son siempre 0 porque la fila no los tiene, asi que
                          decir "0 streams" solo confunde. */}
                      {!isRelease && (
                        <>
                          {" "}
                          &middot; {formatNumber(streamCount)}{" "}
                          {streamCount === 1 ? "stream" : "streams"}
                        </>
                      )}
                    </p>
                    {isRelease ? (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {children.length}{" "}
                        {children.length === 1 ? "pista en este lanzamiento" : "pistas en este lanzamiento"}
                      </p>
                    ) : (
                      <p className="mt-2">
                        <a
                          href={`/releases/${track.id}`}
                          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          Ver ficha del lanzamiento &rarr;
                        </a>
                      </p>
                    )}
                  </div>

                  {/* Un album no tiene audio: la fila padre existe solo para
                      agrupar, y su `audio_preview_url` esta vacia. El
                      reproductor caia en "No hay audio disponible" con un
                      boton de play que no hace nada. Las pistas de verdad se
                      reproducen desde su propia ficha y desde la lista. */}
                  {!isRelease && (
                    <div className="mt-5">
                      <AudioPlayer
                        src={track.audio_preview_url && track.audio_preview_url !== '—' ? track.audio_preview_url : undefined}
                        title={track.title}
                        id={track.id}
                        artist={track.artist_name}
                        coverImage={getCoverImage(track) || undefined}
                        track={{
                          audio_preview_url: track.audio_preview_url && track.audio_preview_url !== '—' ? track.audio_preview_url : null,
                          spotify_url: track.spotify_url,
                          apple_music_url: track.external_links?.apple_music ?? null,
                          youtube_video_id: track.youtube_video_id,
                          external_links: track.external_links ?? undefined,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Metrics Bar. Fase E: sin `likeCount={0}` inventado — si no hay
                  dato de YouTube, la celda muestra "—" y lo explica.

                  En un album estas metricas son SIEMPRE cero (streams, saves,
                  playlists) porque viven en la fila de la pista, no en la del
                  lanzamiento. Mostrar "0 Streams / Sin video de YouTube" en
                  Kid A es ruido que ademas sugiere que el album no se ha
                  escuchado nunca. Para el padre se sustituye por el dato que
                  si significa algo. */}
              {isRelease ? (
                <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Pistas</dt>
                      <dd className="text-lg font-bold text-slate-900 dark:text-white">
                        {children.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Discos</dt>
                      <dd className="text-lg font-bold text-slate-900 dark:text-white">
                        {new Set(children.map((t) => t.disc_number ?? 1)).size}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Duración total</dt>
                      <dd className="text-lg font-bold text-slate-900 dark:text-white">
                        {totalDurationLabel ?? "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <UnifiedMetrics
                  streamCount={streamCount}
                  saves={track.metrics?.saves ?? 0}
                  playlists={track.metrics?.playlist_additions ?? 0}
                  youtubeVideoId={track.youtube_video_id}
                />
              )}
            </div>
          </section>
        </SlideIn>

        {/* Two-Column Content Area */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Main Column (left, 2/3 width) */}
            <div className="lg:col-span-2 space-y-6 lg:space-y-8">
              {/*
                Un LANZAMIENTO (padre con hijas) se renderiza distinto de una
                pista suelta. Antes se le enseñaba la misma plantilla que a
                una pista, y como un album no tiene letra, ni videoclip, ni
                detalles de produccion, ni una cancion en Last.fm, la pagina
                era un monton de tarjetas vacias. Solo se muestran las que
                aportan algo, y en su lugar va la lista de pistas, que es lo
                que un periodista viene a buscar a un album.
              */}
              {isRelease ? (
                <SlideIn index={2}>
                  <ReleaseTracklistSection release={track} tracks={children} />
                </SlideIn>
              ) : (
                <>
                  {/* Lyrics Section */}
                  <SlideIn index={2}>
                    <LyricsSectionWrapper
                      lyrics={track.lyrics}
                      isInstrumental={track.is_instrumental}
                      trackId={track.id}
                      artistName={track.artist_name}
                    />
                  </SlideIn>

                  {/* Video Showcase */}
                  <SlideIn index={3}>
                    <VideoShowcase
                      youtubeVideoId={track.youtube_video_id}
                      videoEmbedUrl={track.video_embed_url}
                      title="Videoclip Oficial"
                    />
                  </SlideIn>
                </>
              )}

              {/* Bio Section */}
              <SlideIn index={4}>
                {artist && (
                  <BioSection
                    artistName={artist.name}
                    genre={artist.genre ?? undefined}
                    location={artist.location ?? undefined}
                    biography={artist.biography ?? undefined}
                    monthlyListeners={artist.monthly_listeners}
                  />
                )}
              </SlideIn>

              {/* Image Gallery */}
              <SlideIn index={5}>
                <ImageGalleryWrapper
                  images={track.gallery_images ?? undefined}
                  title="Galería de Prensa"
                  trackId={track.id}
                  artistName={track.artist_name}
                />
              </SlideIn>
            </div>

            {/* Sidebar Column (right, 1/3 width) */}
            <div className="space-y-6 lg:space-y-8">
              {/*
                Enlaces, detalles de produccion y metricas de Last.fm son datos
                DE UNA PISTA. En un lanzamiento padre no existen, y mostrarlos
                vacios ocupa media barra lateral con "No hay enlaces externos
                disponibles" y "Sin datos de produccion". Solo se ocultan si de
                verdad no hay nada; si el padre llegara a tener un enlace, se
                seguiria viendo.
              */}
              {(track.spotify_url ||
                track.youtube_video_id ||
                track.itunes_track_id ||
                track.external_links?.deezer ||
                track.external_links?.tidal ||
                track.external_links?.bandcamp) && (
                <SlideIn index={4}>
                  <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                    <h3 className="font-semibold text-lg mb-4 text-slate-900 dark:text-slate-100">
                      Enlaces Externos
                    </h3>
                    {/*
                      Los iconos salen de `SOCIAL_PLATFORMS`, no de un `<svg>`
                      escrito aqui. Este bloque tenia su propia copia y se habia
                      separado de la de `/releases/[id]`: pintaba una **nota
                      musical** donde debia ir el logo de Apple Music, y un `d` de
                      Deezer que no era el de `social-platforms.ts`. Tres
                      ficheros, tres versiones del mismo logo.
                    */}
                    <div className="flex flex-col gap-2">
                      {sidebarLinks.map((link) => (
                        <a
                          key={link.key}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${link.textTone}`}
                        >
                          <SocialPlatformIcon
                            platform={getSocialPlatform(link.platformKey)!}
                            className="w-5 h-5 flex-shrink-0"
                          />
                          {link.cta}
                        </a>
                      ))}
                    </div>
                  </section>
                </SlideIn>
              )}

              {/* Production Details: solo si hay algo que mostrar. */}
              {hasProductionDetails(track.production_details) && (
                <SlideIn index={5}>
                  <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                    <ProductionDetailsWrapper
                      details={track.production_details}
                      trackId={track.id}
                      artistName={track.artist_name}
                    />
                  </section>
                </SlideIn>
              )}

              {/* Last.fm mide CANCIONES. En un album daria las metricas de otro
                  tema, asi que no se consulta. */}
              {!isRelease && (
                <SlideIn index={6}>
                  <LastfmMetrics artist={track.artist_name} trackTitle={track.title} />
                </SlideIn>
              )}

              <SlideIn index={7}>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Ficha técnica para prensa
                  </h2>
                  {/*
                    P15 — el alcance de la descarga.

                    Este bloque montaba `<CatalogDownloadButton />` SIN props, y
                    sin `artist_id` el export devuelve el catálogo **global**:
                    los 83 tracks de todos los artistas del PressPlay. El copy
                    decía "el catálogo completo del EPK", que para un
                    periodista es una afirmación falsa sobre lo que se
                    descarga.

                    Ahora el scope es el del artista de esta pista, y el copy lo
                    dice. `artist` se resuelve con `getArtistByName` en el
                    `Promise.all` de arriba; si un artista no está en la tabla
                    `artists` (un release huérfano), `artist` es `null` y el
                    componente degrada solo: el dossier y el rider salen
                    deshabilitados con su explicación y el catálogo sigue
                    funcionando, sin error ni 400.
                  */}
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {artist ? (
                      <>
                        Descarga el catálogo de{" "}
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {safeString(artist.name)}
                        </span>
                        : dossier de prensa, rider técnico y fichas de cada
                        lanzamiento aprobado, con métricas y enlaces.
                      </>
                    ) : (
                      <>
                        Descarga el catálogo público de PressPlay con métricas,
                        enlaces y detalles de producción de cada lanzamiento
                        aprobado. El dossier y el rider son por artista y
                        todavía no hay ficha de artista para{" "}
                        {safeString(track.artist_name)}.
                      </>
                    )}
                  </p>
                  <CatalogDownloadButton
                    artistId={artist?.id ?? null}
                    artistName={artist ? safeString(artist.name) : safeString(track.artist_name, "PressPlay")}
                  />
                </div>
              </SlideIn>
            </div>
          </div>
        </div>

        {/* Track Navigation */}
        <SlideIn index={7}>
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 mt-8" aria-label="Navegacion de tracks">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
              {prevTrack ? (
                <a
                  href={`/track/${prevTrack.id}`}
                  className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors group min-w-0"
                >
                  <svg className="w-4 h-4 flex-shrink-0 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="truncate">{safeString(prevTrack.title)}</span>
                </a>
              ) : (
                <span />
              )}

              <span className="hidden" />

              {nextTrack ? (
                <a
                  href={`/track/${nextTrack.id}`}
                  className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors group text-right min-w-0"
                >
                  <span className="truncate">{safeString(nextTrack.title)}</span>
                  <svg className="w-4 h-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              ) : (
                <span />
              )}
            </div>
          </nav>
        </SlideIn>
      </div>
    </PageTransition>
  );
}
