/**
 * Carousel — PressPlay v4.0.0
 * Shared constants & typed defaults for Embla Carousel configuration.
 * Framework-agnostic: used by the useCarousel hook and any consumer.
 *
 * Branding: indigo/violet/pink/emerald palette — keep dark-mode aware styles
 * outside this file; this file only contains numeric/breakpoint config.
 */

/** Number of slides visible per breakpoint */
export const slidesConfig = {
  mobile: {
    minWidth: 0,
    maxWidth: 639,
    slidesVisible: 1,
    slidesToScroll: 1,
  },
  tablet: {
    minWidth: 640,
    maxWidth: 1023,
    slidesVisible: 2,
    slidesToScroll: 2,
  },
  desktop: {
    minWidth: 1024,
    maxWidth: Infinity,
    slidesVisible: 4,
    slidesToScroll: 4,
  },
} as const;

/** Autoplay default options */
export const autoplayDefaults = {
  delay: 4000,
  stopOnInteraction: true,
  stopOnMouseEnter: true,
  resetOnExit: true,
} as const;

/** Default Embla options merged with user overrides */
export const defaultEmblaOptions = {
  loop: true,
  containScroll: "trimSnaps" as const,
  align: "start" as const,
  slidesToScroll: 1,
} as const;

/** Resolve how many slides to show based on viewport width */
export function getSlidesForWidth(width: number): {
  slidesVisible: number;
  slidesToScroll: number;
} {
  for (const key of ["desktop", "tablet", "mobile"] as const) {
    const cfg = slidesConfig[key];
    if (width >= cfg.minWidth && width <= cfg.maxWidth) {
      return { slidesVisible: cfg.slidesVisible, slidesToScroll: cfg.slidesToScroll };
    }
  }
  // Fallback to mobile
  return {
    slidesVisible: slidesConfig.mobile.slidesVisible,
    slidesToScroll: slidesConfig.mobile.slidesToScroll,
  };
}

/** Type-safe Embla carousel API reference (minimal subset we use) */
export type EmblaApi = {
  canScrollPrev: () => boolean;
  canScrollNext: () => boolean;
  scrollPrev: () => void;
  scrollNext: () => void;
  scrollTo: (index: number) => void;
  selectedScrollSnap: () => number;
  scrollSnapList: () => number[];
  reInit: () => void;
};