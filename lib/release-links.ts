import { getSocialPlatform, type SocialPlatformKey } from "./social-platforms";
import type { Track } from "@/types/music";

/**
 * Los enlaces de streaming de un lanzamiento, con su icono y su color de marca.
 *
 * ## Por qué vive aquí y no dentro de la página
 *
 * Porque estaba dentro de `app/releases/[id]/page.tsx` y de
 * `app/track/[id]/page.tsx`, **cada una con su propia copia**. Y las copias se
 * separaron: la barra lateral del detalle traía un icono de Apple Music que no
 * era el logo de Apple sino una nota musical genérica, y Deezer aparecía con
 * un `d` distinto del que tiene `lib/social-platforms.ts`. Tres logos, tres
 * ficheros.
 *
 * Aquí ya no hay ni un `d` ni un color: sale todo de `SOCIAL_PLATFORMS`. Si
 * mañana cambia el logo de Tidal, cambia en un sitio.
 */

export interface ReleaseLink {
  /** Estable y único por plataforma: es la `key` de React y la que usan los tests. */
  key: string;
  href: string;
  /** El nombre de la plataforma, tal cual lo declara `SOCIAL_PLATFORMS`. */
  label: string;
  /** El color de marca, para el fondo del botón de la ficha de release. */
  color: string;
  /** Para pintar el icono con `SocialPlatformIcon`. */
  platformKey: SocialPlatformKey;
}

/**
 * El orden en pantalla.
 *
 * No es el de `SOCIAL_PLATFORMS`: ahí Tidal va después de Deezer porque el array
 * es alfabético por historia, y aquí el criterio es "las que la gente busca
 * primero".
 */
const ORDEN: readonly SocialPlatformKey[] = [
  "spotify",
  "apple-music",
  "tidal",
  "deezer",
  "bandcamp",
  "youtube",
];

/**
 * `"—"` es lo que `lib/db.ts` deja en una columna vacía al pasar por
 * `safeString`, y es truthy: un `if (!valor)` lo daría por bueno y pintaría un
 * botón que lleva a una página que no existe. Por eso el filtro es por largo y
 * por lista de centinelas, y no por "no es null".
 */
function usable(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "—" || trimmed === "-") return null;
  return trimmed;
}

interface Candidata {
  platformKey: SocialPlatformKey;
  href: string;
}

/**
 * Los enlaces de un lanzamiento, **de todas las fuentes**.
 *
 * Hay dos sitios donde vive un enlace a una plataforma y se llenan por caminos
 * distintos: la que escribe una persona (`external_links`) y la que rellena un
 * proceso (`spotify_url`, `itunes_track_id`, `youtube_video_id`). Con solo la
 * primera, 7 de los 9 singles del catálogo se quedaban sin sección de Enlaces
 * con la base llena de URLs.
 *
 * Las reglas son tres y las tres importan:
 *
 * 1. **Primero `external_links`, después la columna de la fila.** Es la que
 *    escribe una persona; la otra la rellena un proceso. Si las dos existen,
 *    gana la curada.
 * 2. **Un enlace por plataforma.** Si `external_links.youtube` y
 *    `youtube_video_id` apuntan al mismo vídeo, sale **un** botón. Por eso no
 *    hace falta un `Set`: se resuelve una sola `href` por plataforma.
 * 3. **Un orden estable.** `ORDEN` decide el de pantalla, no el de arrival, o
 *    el botón de Tidal saldría detrás del de YouTube un día y delante otro.
 */
export function buildReleaseLinks(release: Track): ReleaseLink[] {
  const external = release.external_links ?? {};

  const spotify = usable(external.spotify) ?? usable(release.spotify_url);
  const apple =
    usable(external.apple_music) ??
    (usable(release.itunes_track_id)
      ? `https://music.apple.com/us/album/${usable(release.itunes_track_id)}`
      : null);
  const tidal = usable(external.tidal);
  const deezer = usable(external.deezer);
  const bandcamp = usable(external.bandcamp);
  const youtube =
    usable(external.youtube) ??
    (usable(release.youtube_video_id)
      ? `https://www.youtube.com/watch?v=${usable(release.youtube_video_id)}`
      : null);

  const candidatas: Candidata[] = [
    { platformKey: "spotify", href: spotify ?? "" },
    { platformKey: "apple-music", href: apple ?? "" },
    { platformKey: "tidal", href: tidal ?? "" },
    { platformKey: "deezer", href: deezer ?? "" },
    { platformKey: "bandcamp", href: bandcamp ?? "" },
    { platformKey: "youtube", href: youtube ?? "" },
  ];

  return candidatas
    .filter((c) => c.href !== "")
    .sort((a, b) => ORDEN.indexOf(a.platformKey) - ORDEN.indexOf(b.platformKey))
    .map(({ platformKey, href }): ReleaseLink | null => {
      const platform = getSocialPlatform(platformKey);
      if (!platform) {
        /**
         * No debería pasar: `ORDEN` y `candidatas` comparten las claves. Si
         * alguien añade una clave a `ORDEN` y olvida el `href`, esto lo deja
         * fuera en vez de pintar un botón sin icono ni color.
         */
        return null;
      }
      return {
        key: platformKey,
        href,
        label: platform.label,
        color: platform.color,
        platformKey,
      };
    })
    .filter((l): l is ReleaseLink => l !== null);
}
