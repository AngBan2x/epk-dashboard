import type { MetadataRoute } from "next";
import { getAllArtists, getAllTracks } from "@/lib/db";

const BASE_URL = "https://epk-dashboard.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const [artists, tracks] = await Promise.all([
    getAllArtists().catch(() => []),
    getAllTracks().catch(() => []),
  ]);

  const estaticas: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/artists`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/shows`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/dashboard`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    // P4 · buzón público. Prioridad baja y `yearly`: la página no cambia nunca,
    // pero es la vía de entrada para quien no tiene cuenta, y una página de
    // contacto que no está en el sitemap es una página que los buscadores no
    // encuentran.
    { url: `${BASE_URL}/suggestions`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const dinamicas: MetadataRoute.Sitemap = [];

  for (const artist of artists) {
    dinamicas.push({
      url: `${BASE_URL}/artists/${artist.id}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  /**
   * P2 · Ola 10 — el sitemap pasa de `/track/<id>` a `/releases/<id>`.
   *
   * Antes esto era un `for` sobre `getAllTracks()` que solo filtraba por
   * `status`, así que indexaba **las 65 pistas hijas** de los 12 álbumes con la
   * misma plantilla que sus padres. Tres cosas malas de golpe:
   *
   * 1. Una hija ya no tiene página propia: `/track/<hija>` **redirige** a
   *    `/releases/<padre>`. Una URL que redirige no debe estar en el sitemap:
   *    el buscador la indexa, la sigue, encuentra la redirección y gasta un
   *    presupuesto de rastreo del sitio entero en una página que no existe.
   * 2. Las hijas heredan `cover_image` del padre, de modo que 65 filas con la
   *    misma imagen y el mismo título-ish: duplicado puro, que es lo que hace
   *    que un dominio grande caiga en "duplicate content".
   * 3. El contenido real —el álbum— no estaba en el sitemap. La página que un
   *    periodista busca nunca fue una URL indexable.
   *
   * El filtro es `release_id`: en el esquema un lanzamiento y un single suelto
   * son la misma fila (`lib/db.ts:2926`), así que "lo que tiene página" es
   * exactamente "lo que no es hija".
   */
  for (const track of tracks) {
    if (track.status && track.status !== "approved") continue;
    // Las hijas tienen pagina propia en /releases/[padre]: no se listan aqui.
    if (track.release_id) continue;
    dinamicas.push({
      url: `${BASE_URL}/releases/${track.id}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  return [...estaticas, ...dinamicas];
}
