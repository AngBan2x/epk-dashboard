"use client";

import { BioSection } from "@/components/BioSection";
import { ShowsBooking } from "@/components/ShowsBooking";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useCarousel } from "@/components/carousel/useCarousel";
import { CarouselTrack } from "@/components/carousel/CarouselTrack";
import { CarouselItem } from "@/components/carousel/CarouselItem";
import { CarouselNavigation } from "@/components/carousel/CarouselNavigation";
import { CarouselDots } from "@/components/carousel/CarouselDots";

import type { ArtistProfile, Show } from "@/types/music";

export interface CatalogArtistsCarouselProps {
  artists: ArtistProfile[];
  showsByArtist: Record<string, Show[]>;
  autoplay?: boolean;
  autoplayDelay?: number;
}

export function CatalogArtistsCarousel({
  artists,
  showsByArtist,
  autoplay = false,
  autoplayDelay = 5000,
}: CatalogArtistsCarouselProps) {
  const {
    emblaRef,
    selectedIndex,
    scrollSnaps,
    canPrev,
    canNext,
    scrollPrev,
    scrollNext,
    scrollTo,
    pause,
    resume,
  } = useCarousel({ autoplay, autoplayDelay, loop: false });

  if (artists.length === 0) return null;

  // Una página = una slide (`basis-full`), así que el total de páginas es el
  // número real de snaps de Embla y NO `artists.length` (que solo coincide
  // cuando hay una slide por artista). Fallback a artists.length mientras
  // Embla aún no ha medido el track en el primer render.
  const totalPages = scrollSnaps.length || artists.length;

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
      <SectionHeader
        emoji="🎤"
        title="Artistas"
        subtitle="Bios y shows del catálogo"
      />

      <CarouselTrack
        ariaLabel="Catálogo de artistas"
        viewportRef={emblaRef}
        onArrowKeys={(direction) => (direction === "prev" ? scrollPrev() : scrollNext())}
        onPause={pause}
        onResume={resume}
      >
        {artists.map((artist, index) => (
          <CarouselItem
            key={artist.id}
            label="Artista"
            index={index}
            total={artists.length}
          >
            <div className="grid h-full grid-cols-1 gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/40 lg:grid-cols-2">
              <BioSection
                artistName={artist.name}
                genre={artist.genre || "Multi-género"}
                location={artist.location || "Latinoamérica"}
                monthlyListeners={artist.monthly_listeners || 0}
                biography={artist.biography}
                pressText={artist.press_text}
                pressHighlights={artist.press_highlights}
              />
              <ShowsBooking
                artistId={artist.id}
                shows={showsByArtist[artist.id] || []}
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselTrack>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          Página {selectedIndex + 1} de {totalPages}
        </p>
        <CarouselNavigation
          canPrev={canPrev}
          canNext={canNext}
          onPrev={scrollPrev}
          onNext={scrollNext}
        />
      </div>

      <CarouselDots
        scrollSnaps={scrollSnaps}
        selectedIndex={selectedIndex}
        onSelect={scrollTo}
      />
    </section>
  );
}
