import { getAllArtists } from "@/lib/db";
import Link from "next/link";
import { Header } from "@/components/Header";

export default async function ArtistsPage() {
  const artists = await getAllArtists();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Artistas
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Explora los artistas y sus catálogos musicales
          </p>
        </div>

        {artists.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">No hay artistas registrados aún.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {artists.map((artist) => (
              <Link
                key={artist.id}
                href={`/artists/${artist.id}`}
                className="block p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-lg transition-shadow"
              >
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  {artist.name}
                </h2>
                {artist.genre && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                    {artist.genre}
                  </p>
                )}
                {artist.location && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    📍 {artist.location}
                  </p>
                )}
                {artist.biography && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">
                    {artist.biography}
                  </p>
                )}
                {artist.monthly_listeners > 0 && (
                  <p className="mt-4 text-xs text-slate-400">
                    {artist.monthly_listeners.toLocaleString()} oyentes mensuales
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}