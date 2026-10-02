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

  for (const track of tracks) {
    if (track.status && track.status !== "approved") continue;
    dinamicas.push({
      url: `${BASE_URL}/track/${track.id}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  return [...estaticas, ...dinamicas];
}
