"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ArtistProfile } from "@/types/music";
import { safeString } from "@/lib/null-safe";
import { imageOptimizationProps } from "@/lib/image-config";
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

/**
 * Una tarjeta = **nombre + foto**. Es lo que pidió el usuario, y el motivo por el
 * que se quitaron género, ubicación, biografía y oyentes no es que sobraran
 * datos: es que el catálogo se lee como un catálogo, y cuatro renglones de texto
 * bajo cada nombre competían con la foto por la atención y con el nombre por el
 * peso visual. El detalle de cada uno de esos campos sigue en la ficha.
 *
 * ## La relación fija
 *
 * `aspect-square` + `fill` + `object-cover` es deliberado, y no por simetría: una
 * rejilla de tarjetas cuyo alto depende de si la imagen cargó **salta** al
 * llegar la foto, y salta en diagonal porque cada celda salta por su cuenta. Con
 * el ratio fijado, la caja existe desde el primer frame y la foto la rellena.
 *
 * ## El fallo
 *
 * `profile_image` es texto libre que puede venir de la API de iTunes, de un
 * upload o de una URL pegada a mano: se rompe. Un `onError` que devuelve al
 * fallback de iniciales es lo que evita el peor resultado posible, que es un
 * `<img>` roto con el icono del navegador dentro de una rejilla. Y **nunca** se
 * monta `<Image src="">`: `safeString` distingue "no hay" de "hay", y un src
 * vacío es una petición fallida garantizada.
 */
function ArtistCard({ artist }: { artist: ArtistProfile }) {
  const [photoBroken, setPhotoBroken] = useState(false);

  const name = safeString(artist.name, "Artista");
  const initial = name.charAt(0).toUpperCase();
  // `safeString` solo mira `length > 0`, así que `"   "` pasa su filtro. El
  // `.trim()` es el mismo que usa `getCoverImage` (`lib/null-safe.ts:178`): sin
  // él, un `profile_image` de solo espacios monta `<Image src="   ">`, que es
  // una petición fallida garantizada y un `onError` que salta al pintar.
  const photo = safeString(artist.profile_image, "").trim();

  return (
    <Link
      href={`/artists/${artist.id}`}
      className="group block overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-slate-800 dark:bg-slate-900 dark:focus-visible:ring-offset-slate-950"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-500">
        {photo && !photoBroken ? (
          <Image
            src={photo}
            alt={`Foto de ${name}`}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            onError={() => setPhotoBroken(true)}
            {...imageOptimizationProps(photo)}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-6xl font-bold text-white/80"
          >
            {initial}
          </span>
        )}
      </div>
      <h2 className="truncate px-4 py-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
        {name}
      </h2>
    </Link>
  );
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((artist) => (
          <ArtistCard key={artist.id} artist={artist} />
        ))}
      </div>
    </>
  );
}
