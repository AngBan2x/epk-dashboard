import { getAllArtists } from "@/lib/db";
import { parseListSortParams } from "@/lib/search";
import { ArtistsCatalog } from "@/components/ArtistsCatalog";

export const dynamic = "force-dynamic";

interface ArtistsPageProps {
  searchParams: {
    sort?: string;
    order?: string;
  };
}

export default async function ArtistsPage({ searchParams }: ArtistsPageProps) {
  const artists = await getAllArtists();
  const initialSort = parseListSortParams(searchParams.sort, searchParams.order);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Artistas
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Explora los artistas y sus catálogos musicales
          </p>
        </div>

        <ArtistsCatalog artists={artists} initialSort={initialSort} />
      </main>
    </div>
  );
}
