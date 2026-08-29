import { Metadata } from "next";
import { Header } from "@/components/Header";
import { EPKCard } from "@/components/EPKCard";
import { getAllTracks } from "@/lib/db";

export const metadata: Metadata = {
  title: "Dashboard | EPK Dashboard Musical",
  description: "Dashboard de métricas y catálogo de tracks",
};

export default function DashboardPage() {
  const tracks = getAllTracks();

  return (
    <div className="min-h-screen bg-dark-50 dark:bg-dark-950">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <section className="mb-8">
          <h1 className="text-3xl font-bold text-dark-900 dark:text-dark-100 mb-2">
            EPK Dashboard
          </h1>
          <p className="text-dark-600 dark:text-dark-400">
            Catálogo completo de {tracks.length} tracks
          </p>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {tracks.map((track) => (
            <EPKCard key={track.id} track={track} />
          ))}
        </div>

        {tracks.length === 0 && (
          <div className="text-center py-12 text-dark-400">
            <p>No se encontraron tracks.</p>
          </div>
        )}
      </main>
    </div>
  );
}