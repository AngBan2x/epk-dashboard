"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  autoplayDefaults,
  defaultEmblaOptions,
  emblaBreakpoints,
  type SlidesPerView,
} from "@/lib/carousel";

type EmblaApi = NonNullable<ReturnType<typeof useEmblaCarousel>[1]>;
type EmblaHandler = (api: EmblaApi) => void;

export interface UseCarouselOptions {
  autoplay?: boolean;
  autoplayDelay?: number;
  loop?: boolean;
  /**
   * RC.33 Ola 7 — cuántos slides por página, por breakpoint. Es lo que fija
   * `slidesToScroll`, y por tanto lo que decide que cada página del carrusel
   * esté **llena**: `slidesToScroll` tiene que ser igual al número de slides
   * visibles, o `scrollNext()` deja huecos a la vista y se lee como un glitch.
   *
   * No hay un número suelto aquí a propósito. Con un `slidesToScroll` fijo de 4
   * y 2 slides visibles (breakpoint `sm`), Embla agruparía los snaps de cuatro
   * en cuatro y `scrollNext` saltaría **una página entera**: los slides 2 y 3 no
   * se verían nunca. El número correcto no existe sin saber el ancho, así que
   * aquí no se decide: se le pasa el escalonado a Embla y es él quien lo resuelve.
   *
   * Por defecto, 1 slide en cualquier ancho — ver `artistSlidesPerView`, que es
   * un escalonado de un solo escalón y produce `breakpoints: {}`, o sea las
   * opciones exactas que tenía el carrusel de artistas antes de este cambio.
   */
  slidesPerView?: SlidesPerView;
}

export function useCarousel({
  autoplay = false,
  autoplayDelay = autoplayDefaults.delay,
  loop = true,
  slidesPerView,
}: UseCarouselOptions = {}) {
  /**
   * `breakpoints` es la opción **nativa** de Embla 8.6, y hace dos cosas que
   * un `matchMedia` propio no haría igual de bien:
   *
   * 1. Embla evalúa las media queries al inicializar (`optionsAtMedia`) y se
   *    suscribe a ellas para re-inicializarse al cruzar un corte. No hay
   *    listener en este repo que mantener ni que limpiar.
   * 2. `useEmblaCarousel` compara `options` en profundidad y re-inicializa
   *    cuando cambian, así que el mapa se recalcula sin efectos extra.
   *
   * El orden de las claves importa y lo da `releaseSlidesPerView`: Embla fusiona
   * las media queries que casan **en el orden de inserción**, de modo que a
   * 1440px casan `(min-width: 640px)` y `(min-width: 1280px)` y gana la
   * segunda. Al revés, 4 slides por página se quedan con 2.
   *
   * `slidesPerView` es `undefined` por defecto a propósito, para que el objeto
   * de opciones del carrusel de artistas siga siendo `{breakpoints: {}}` y no
   * `undefined`: son opciones equivalentes, pero la segunda hace que Embla
   * re-inicialice una vez de más al montar.
   */
  const options = {
    ...defaultEmblaOptions,
    loop,
    breakpoints: slidesPerView ? emblaBreakpoints(slidesPerView) : {},
  };

  const [emblaRef, emblaApi] = useEmblaCarousel(options, []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const pausedRef = useRef(false);

  const syncState = useCallback((api: EmblaApi) => {
    setSelectedIndex(api.selectedScrollSnap());
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    syncState(emblaApi);
    const onSelect: EmblaHandler = (api) => syncState(api);
    const onReInit: EmblaHandler = (api) => {
      setScrollSnaps(api.scrollSnapList());
      syncState(api);
    };
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onReInit);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onReInit);
    };
  }, [emblaApi, syncState]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  useEffect(() => {
    if (!autoplay || !emblaApi) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = window.setInterval(() => {
      if (!pausedRef.current) emblaApi.scrollNext();
    }, autoplayDelay);
    return () => window.clearInterval(id);
  }, [autoplay, autoplayDelay, emblaApi]);

  return {
    emblaRef,
    emblaApi,
    selectedIndex,
    scrollSnaps,
    canPrev,
    canNext,
    scrollPrev,
    scrollNext,
    scrollTo,
    pause,
    resume,
  };
}
