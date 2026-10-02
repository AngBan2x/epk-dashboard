/**
 * Carousel — PressPlay v4.0.0
 * Única fuente de verdad de la configuración numérica de Embla Carousel.
 *
 * ── RC.33 Ola 7: este fichero vuelve a hablar de varios slides por página ──
 *
 * Antes decía, textualmente, que el carrusel del catálogo muestra **1 slide por
 * página en todos los breakpoints** y que un `slidesConfig` responsive 1/2/4
 * "se eliminó a propósito [...] habría hecho avanzar el carrusel 2 o 4 slides
 * cuando solo se ve 1". RC.33 Ola 7 **revierte esa decisión por petición
 * explícita del usuario**, que pidió un carrusel horizontal de releases con
 * **4 por página** ("Catálogo global: no está el diseño de carrusel horizontal
 * de 4 releases por página como había dicho anteriormente").
 *
 * **Por qué el argumento original ya no aplica.** Era una inferencia, no un
 * requisito, y era correcta *entonces*: no había más que un consumidor y
 * mostraba 1 slide, así que un valor 2 o 4 habría deslocado el viewport más allá
 * de lo que se veía. Hoy hay **dos** consumidores con densidades distintas —el de
 * artistas (1 slide) y el de releases (hasta 4)— y la regla que queda no es "1",
 * sino la invariante real:
 *
 * > `slidesToScroll` = cuántos slides se ven.
 *
 * Un número fijo no la cumple. Con `slidesToScroll: 4` y **2 visibles** (el
 * breakpoint `sm`), Embla agruparía los snaps de cuatro en cuatro y `scrollNext`
 * saltaría **una página entera por encima**: los slides 2 y 3 no se verían
 * nunca. Ese es el bug caro, y por eso aquí no hay un "4" cableado sino un
 * escalonado por breakpoints que Embla resuelve él mismo (ver `emblaBreakpoints`
 * y el comentario de `useCarousel`). El 1 del carrusel de artistas sigue siendo
 * su valor por defecto, y no porque esté escrito dos veces, sino porque su
 * escalonado solo tiene un escalón.
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

/**
 * Base de la configuración de Embla. `slidesToScroll` es el valor **sin
 * breakpoints**, o sea lo que vale por debajo del corte más bajo: 1.
 */
export const defaultEmblaOptions = {
  loop: true,
  containScroll: "trimSnaps" as const,
  align: "start" as const,
  /** 1 slide visible y 1 slide por avance → una página = un slide. */
  slidesToScroll: 1,
} as const;

/**
 * Un escalón del escalonado de "cuántos slides por página".
 *
 * `minWidth` es un `min-width` en **px**, no en rem, y tiene que coincidir con
 * el corte de Tailwind equivalente: `0` es el `base` sin prefijo, `640` es
 * `sm`, `1024` es `lg` y `1280` es `xl`. Son los breakpoints por defecto de
 * Tailwind 3.4 (`tailwind.config.ts` no declara `screens`, así que no hay
 * dónde desviarse). Escribirlo en px y no en rem es deliberado: la media query
 * que se genera es una cadena que va directa a `matchMedia`, y rem exigiría
 * conocer el tamaño de fuente de la raíz, que además puede cambiar.
 */
export interface SlidesPerViewStep {
  minWidth: number;
  slides: number;
}

/**
 * Escalonado de slides por página, **en orden ascendente de `minWidth`**. El
 * orden importa y no es cosmético: `emblaBreakpoints` lo recorre en ese orden
 * para construir el objeto de breakpoints, y Embla fusiona los que casan en el
 * orden de inserción de sus claves, de modo que el último que casa (el más
 * ancho) es el que gana.
 */
export type SlidesPerView = readonly SlidesPerViewStep[];

/**
 * Slides por página a un ancho de viewport dado.
 *
 * La regla, escrita para no depender del navegador: gana el **último** escalón
 * cuyo `minWidth` no supere el ancho, y si ninguno casa (viewport más estrecho
 * que el corte más bajo) gana `base`, que es el primer escalón.
 *
 * El paso 0 es `minWidth: 0` y por eso siempre casa.
 */
export function slidesPerViewAt(steps: SlidesPerView, viewportWidth: number): number {
  let slides = steps[0]?.slides ?? defaultEmblaOptions.slidesToScroll;
  for (const step of steps) if (step.minWidth <= viewportWidth) slides = step.slides;
  return slides;
}

/**
 * Los mismos escalones traducidos al mapa `breakpoints` **nativo** de Embla
 * 8.6, que es lo que hace el trabajo responsive de verdad:
 *
 * - Embla evalúa las media queries él mismo al inicializar, con
 *   `optionsAtMedia()`, que fusiona **todas** las que casan en el orden de sus
 *   claves;
 * - se suscribe a los cambios de esas mismas media queries y se re-inicializa
 *   solo al cruzar un corte;
 * - y `useEmblaCarousel` además re-inicializa cuando el objeto `options` que
 *   recibe cambia por comparación profunda.
 *
 * Por eso esto **no** es un `useState` + `matchMedia` propio: eso daría el
 * mismo número en el servidor y el primer render del cliente, y daría un
 * número distinto en cada breakpoint con un listener que mantener. Con
 * `breakpoints` el número lo calcula Embla cuando ya ha medido el DOM.
 *
 * El escalón `{minWidth: 0}` **no** se emite: sin él, `slidesToScroll` valdría
 * 1 en todos los breakpoints, que es justo lo contrario de lo que se quiere.
 * Ese valor es `defaultEmblaOptions.slidesToScroll`, que se aplica antes de
 * fusionar.
 *
 * @param steps Escalonado ascendente. Ver `SlidesPerView`.
 * @returns Claves `(min-width: NNNpx)` ordenadas de menor a mayor.
 */
export function emblaBreakpoints(
  steps: SlidesPerView,
): Record<string, { slidesToScroll: number }> {
  const breakpoints: Record<string, { slidesToScroll: number }> = {};
  for (const step of steps) {
    if (step.minWidth > 0) {
      breakpoints[`(min-width: ${step.minWidth}px)`] = { slidesToScroll: step.slides };
    }
  }
  return breakpoints;
}

/**
 * El carrusel de artistas del catálogo: **1 slide por página en cualquier
 * ancho**. No es que no se pueda cambiar, es que `CatalogArtistsCarousel` no
 * declara ninguno, así que `emblaBreakpoints` devuelve `{}` y Embla se queda
 * con `defaultEmblaOptions.slidesToScroll = 1`. El valor por defecto de
 * `lib/carousel.ts` sigue siendo su valor, y no por estar escrito dos veces.
 *
 * El motivo de que siga siendo 1 es de contenido, no de matemática: cada slide
 * lleva una `BioSection` y una columna de `ShowsBooking` en dos columnas
 * internas. A 1/4 de ancho, la bio quedaría en ~120px y las celdas de métricas
 * volverían a truncarse — que es exactamente lo que C3 corrigió (ver
 * `docs/AI_LOG.md`, "Rediseño del carrusel de artistas del catálogo").
 */
export const artistSlidesPerView: SlidesPerView = [
  { minWidth: 0, slides: 1 },
] as const;

/**
 * El carrusel de releases: **1 / 2 / 3 / 4** slides por página. Es lo que pidió
 * el usuario ("4 releases por página"), y el escalonado por debajo es el mismo
 * que usan las tres rejillas que este carrusel sustituye, para que la tarjeta
 * se lea igual de ancha a un viewport dado.
 * * 390px → 1 → 358px de track → 346px de tarjeta
 * * 640px → 2 → 608px de track → 296px de tarjeta
 * * 1024px → 3 → 992px de track → 321px de tarjeta
 * * 1280px → 4 → 1248px de track → 303px de tarjeta
 *
 * Los cortes son los de Tailwind por defecto (`sm`, `lg`, `xl`) porque son los
 * que ya usan `app/dashboard/page.tsx` (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
 * xl:grid-cols-4`), `ArtistTracksSection.tsx:144` y `ArtistsCatalog.tsx:108`. No
 * hay dónde esconderse de ellos y coincidir con el resto de la app es lo que
 * hace que "abrir /dashboard a 1024px" y "abrir la ficha de un artista a 1024px"
 * enseñen tarjetas del mismo ancho.
 *
 * El corte `lg` existe por lo mismo: el usuario pidió 4, no "4 y 3 y 2". Poner
 * un escalón de 3 es inventar una densidad que nadie pidió, y a 992px de track
 * 3 columnas dan 321px — más estrechas que las 303px de 4 columnas a 1280px.
 * Más escalones es más sitios donde el CSS (`basis-*`) y el mapa de breakpoints
 * pueden discrepar, y la única defensa contra eso es un test.
 *
 * Las medidas de la lista de arriba son de `main` = `max-w-7xl` (1280px) menos
 * `px-4` (32px), con el track `gap-0` y 6px de aire a cada lado de cada tarjeta
 * (12px entre tarjetas). Son medidas del track, no de la tarjeta: cada tarjeta
 * pierde 12px por el aire que la rodea.
 *
 * Precondición de legibilidad: 4 tarjetas de 303px a 1280px. Los umbrales que
 * otros guiones exigen (`cardWidth >= 250` en `scripts/rc29-artist-shots.ts:373`,
 * `card >= 260` en `scripts/verify-wave3.cjs:41`) se cumplen con holgura: el más
 * estrecho es 303px.
 */
export const releaseSlidesPerView: SlidesPerView = [
  { minWidth: 0, slides: 1 },
  { minWidth: 640, slides: 2 },
  { minWidth: 1024, slides: 3 },
  { minWidth: 1280, slides: 4 },
] as const;
