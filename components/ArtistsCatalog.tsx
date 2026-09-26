"use client";

import Link from "next/link";
import type { ArtistProfile } from "@/types/music";
import { formatNumber } from "@/lib/null-safe";
import { sortList, type ListSortState } from "@/lib/search";
import { SortSelect, useListSort } from "@/components/SortSelect";

const ARTIST_ACCESSORS = {
  text: (artist: ArtistProfile) => artist.name,
  date: (artist: ArtistProfile) => artist.created_at,
};

const DEFAULT_SORT: ListSortState = { sort: "name", order: "asc" };

interface ArtistsCatalogProps {
  artists: ArtistProfile[];
  initialSort?: ListSortState;
}

export function ArtistsCatalog({ artists, initialSort = DEFAULT_SORT }: ArtistsCatalogProps) {
  const [sortState, setSortState] = useListSort(initialSort);
  const sorted = sortList(artists, sortState, ARTIST_ACCESSORS);

  if (artists.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">No hay artistas registrados aún.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex justify-end">
        <SortSelect value={sortState} onChange={setSortState} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sorted.map((artist) => (
          <Link
            key={artist.id}
            href={`/artists/${artist.id}`}
            className="block p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">{artist.name}</h2>
            {artist.genre && <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{artist.genre}</p>}
            {artist.location && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">📍 {artist.location}</p>
            )}
            {artist.biography && (
              <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">{artist.biography}</p>
            )}
            {artist.monthly_listeners > 0 && (
              <p className="mt-4 text-xs text-slate-400">
                {formatNumber(artist.monthly_listeners)} oyentes mensuales
              </p>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
