"use client";

import { EPKCard } from "@/components/EPKCard";
import { useCarousel } from "@/components/carousel/useCarousel";
import { CarouselTrack } from "@/components/carousel/CarouselTrack";
import { CarouselItem } from "@/components/carousel/CarouselItem";
import { CarouselNavigation } from "@/components/carousel/CarouselNavigation";
import { CarouselDots } from "@/components/carousel/CarouselDots";
import { releaseSlidesPerView } from "@/lib/carousel";

import type { ActiveTrack } from "@/context/AudioPlayerContext";
import type { Track } from "@/types/music";
import type { YouTubeStatPair } from "@/lib/youtube";

/**
 * Las tres props que `EPKCard` necesita y que **no** son suyas: las resuelve
 * quien ya las resolvía antes.
 *
 * No pueden ser `Track` sueltas porque las tres se calculan en
 * `app/dashboard/page.tsx` sobre los lotes que esa página ya pide —las colas con
 * `buildReleaseQueue`, las stats de YouTube por `youtube_video_id` y el playcount
 * de Last.fm por artista+título normalizado— y duplicar esa lógica aquí
 * produciría dos copias que divergen. La tarjeta acabaría diciendo "Reproducir • 4
 * pistas" con 3 en cola, que es el bug que ya se corrigió una vez.
 *
 * Por eso son **funciones** y no un objeto ya calculado: el padre se las pasa y
 * este componente solo las reenvía, igual que haría la rejilla.
 */
export interface ReleaseCardProps {
  detailHref?: string;
  childrenTracks?: Track[];
  queue?: ActiveTrack[];
}

export interface CatalogReleaseCarouselProps {
  /** Lanzamientos ya ordenados por `SortSelect` (no las cabeceras sin ordenar). */
  tracks: Track[];
  /** `cardProps(track)` de `app/dashboard/page.tsx`, sin reimplementar. */
  getCardProps: (track: Track) => ReleaseCardProps;
  /** `statsFor(track)`: las stats del lote de YouTube, ya resueltas. */
  getYoutubeStats: (track: Track) => YouTubeStatPair | null;
  /** `lastfmFor(track)`: scrobbles de esta fila, o `null` si no se conocen. */
  getLastfmPlaycount: (track: Track) => number | null;
  /** Playcounts de las hijas, indexados por `track.id` (álbumes). */
  lastfmByTrack: Record<string, number | null>;
  /** Abre el `LoginModal` global de la página. */
  onLoginPrompt: () => void;
  autoplay?: boolean;
  autoplayDelay?: number;
}

/**
 * Carrusel horizontal del catálogo de releases, en la vista de invitado de
 * `/dashboard`. Es lo que RC.33 Ola 7 revierte: antes era una rejilla
 * `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
 *
 * ── `loop: false` ──────────────────────────────────────────────────────────
 *
 * Es la decisión que el enunciado dejaba abierta, y la respuesta es no. Con
 * `loop: true` y 4 slides visibles, Embla clona el primer y el último grupo de
 * slides para poder dar la vuelta, y el ancho clonado multiplica el track por
 * encima de lo que el viewport puede mostrar: aparecen huecos al final, los
 * snaps dejan de caer en páginas completas, que es lo que vuelve inútil el
 * `containScroll: "trimSnaps"`. El carrusel de artistas ya resolvió esta misma
 * pregunta con `loop: false` (`CatalogArtistsCarousel.tsx:38`), y la razón de
 * fondo es la de aquí: sin loop hay un número **finito y exacto** de páginas,
 * `canPrev`/`canNext` se pueden deshabilitar de verdad (con loop no se deshabilitan
 * nunca, y un botón que nunca se apaga no informa de nada), y las flechas del
 * teclado recorren el catálogo entero en lugar de teletransportarse de la
 * última página a la primera.
 *
 * `containScroll: "trimSnaps"` **sí** se queda: con `slidesToScroll` = visibles
 * los snaps caen en los bordes exactos de cada página, y el trim solo actúa
 * sobre la última, cuando quedan menos slides que una página entera.
 *
 * ── El ancho de cada slide ─────────────────────────────────────────────────
 *
 * `CarouselItem` sigue trayendo su `basis-full`; este carrusel lo sobrescribe
 * por `className` con las clases responsivas de abajo. Se apoya en que las
 * utilidades responsivas de Tailwind se emiten **después** de las base, así que
 * `sm:basis-1/2` gana a `basis-full` dentro de su media query sin `!important`.
 * No se añadió una prop `basis` al primitivo: sería una segunda forma de decir
 * lo mismo que `className`, que ya lo hacía, y el enunciado pedía evitar
 * exactamente eso.
 *
 * Las clases están escritas a mano y no se construyen desde
 * `releaseSlidesPerView` porque **Tailwind no escanea clases construidas**: un
 * `` `lg:basis-1/${n}` `` no genera CSS y el fallo es silencioso (la tarjeta se
 * queda con el ancho del escalón anterior). El precio de escribirlas a mano es
 * que el CSS y el escalonado de `lib/carousel.ts` pueden discrepar, y por eso
 * `tests/unit/release-carousel.test.ts` comprueba que en cada corte del
 * escalonado la clase del slide coincide con `slidesPerViewAt()`.
 *
 * Con el track en `gap-0` y estos items, los cuatro a `basis-1/4` suman
 * exactamente el 100% del track: los 12px de aire entre tarjetas son `px-1.5`
 * por dentro de cada slide, no gaps por fuera.
 */
export function CatalogReleaseCarousel({
  tracks,
  getCardProps,
  getYoutubeStats,
  getLastfmPlaycount,
  lastfmByTrack,
  onLoginPrompt,
  autoplay = false,
  autoplayDelay,
}: CatalogReleaseCarouselProps) {
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
  } = useCarousel({
    autoplay,
    autoplayDelay,
    loop: false,
    slidesPerView: releaseSlidesPerView,
  });

  // Mismo contrato que el carrusel de artistas: el total de páginas es el de los
  // snaps reales de Embla, no `tracks.length` (aquí no coinciden: una página son
  // hasta 4 slides). El fallback es 1 mientras Embla no ha medido el track.
  const totalPages = scrollSnaps.length || 1;

  // Estado vacío antes de montar el track: `CarouselTrack` mide el DOM en un
  // efecto y con cero slides Embla no tiene nada que paginar.
  if (tracks.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400" role="status">
        <p>No se encontraron tracks.</p>
      </div>
    );
  }

  return (
    <section>
      <CarouselTrack
        ariaLabel="Catálogo de lanzamientos"
        viewportRef={emblaRef}
        onArrowKeys={(direction) => (direction === "prev" ? scrollPrev() : scrollNext())}
        onPause={pause}
        onResume={resume}
        gapClassName="gap-0"
      >
        {tracks.map((track, i) => (
          <CarouselItem
            key={track.id}
            label="Lanzamiento"
            index={i}
            total={tracks.length}
            className="basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4 px-1.5"
          >
            {/*
              `priority` solo en la primera tarjeta, igual que en las tres
              rejillas: es la que puede ser el elemento LCP. Las otras tres que
              se ven a la vez en `xl` van por `loading="lazy"`, que es lo que ya
              hacen hoy en la rejilla de 4 columnas.
            */}
            <EPKCard
              track={track}
              priority={i === 0}
              onLoginPrompt={onLoginPrompt}
              youtubeStats={getYoutubeStats(track)}
              lastfmPlaycount={getLastfmPlaycount(track)}
              lastfmByTrack={lastfmByTrack}
              {...getCardProps(track)}
            />
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
          prevLabel="Lanzamiento anterior"
          nextLabel="Lanzamiento siguiente"
        />
      </div>

      <CarouselDots
        scrollSnaps={scrollSnaps}
        selectedIndex={selectedIndex}
        onSelect={scrollTo}
        label="lanzamiento"
      />
    </section>
  );
}
