/**
 * Carousel — PressPlay v4.0.0
 * Única fuente de verdad de la configuración numérica de Embla Carousel.
 *
 * El carrusel del catálogo muestra **1 artista por página** en todos los
 * breakpoints: cada slide es `basis-full` (`components/carousel/CarouselItem.tsx`)
 * y por lo tanto `slidesToScroll` es siempre 1. Aquí vivía antes un
 * `slidesConfig` responsive 1/2/4 junto a `getSlidesForWidth()`; era código
 * muerto (nadie lo importaba) y, cableado, habría hecho avanzar el carrusel
 * 2 o 4 slides cuando solo se ve 1, así que se eliminó para no dejar dos
 * fuentes de verdad en conflicto.
 *
 * Framework-agnostic: used by the useCarousel hook and any consumer.
 *
 * Branding: indigo/violet/pink/emerald palette — keep dark-mode aware styles
 * outside this file; this file only contains numeric config.
 */

/** Autoplay: retardo por defecto en ms. El hook pausa en hover/foco del track. */
export const autoplayDefaults = {
  delay: 4000,
} as const;

/** Default Embla options merged with user overrides */
export const defaultEmblaOptions = {
  loop: true,
  containScroll: "trimSnaps" as const,
  align: "start" as const,
  /** 1 slide visible y 1 slide por avance → una página = un artista. */
  slidesToScroll: 1,
} as const;
