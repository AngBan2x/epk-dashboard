"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { autoplayDefaults, defaultEmblaOptions } from "@/lib/carousel";

type EmblaApi = NonNullable<ReturnType<typeof useEmblaCarousel>[1]>;
type EmblaHandler = (api: EmblaApi) => void;

export interface UseCarouselOptions {
  autoplay?: boolean;
  autoplayDelay?: number;
  loop?: boolean;
  slidesToScroll?: number;
}

export function useCarousel({
  autoplay = false,
  autoplayDelay = autoplayDefaults.delay,
  loop = true,
  slidesToScroll = defaultEmblaOptions.slidesToScroll,
}: UseCarouselOptions = {}) {
  const options = {
    ...defaultEmblaOptions,
    loop,
    slidesToScroll,
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
