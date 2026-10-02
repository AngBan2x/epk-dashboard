"use client";

import type { KeyboardEvent, ReactNode } from "react";

export interface CarouselTrackProps {
  children: ReactNode;
  ariaLabel: string;
  viewportRef: (node: HTMLDivElement | null) => void;
  onArrowKeys?: (direction: "prev" | "next") => void;
  onPause?: () => void;
  onResume?: () => void;
  className?: string;
  /**
   * RC.33 Ola 7 — separación entre slides. `gap-3` por defecto, que es lo que
   * usa el carrusel de artistas y lo que venía antes, así que ese consumidor no
   * pasa nada y no cambia.
   *
   * Existe por el carrusel de releases, que necesita **`gap-0`**. El motivo es
   * aritmético, no estético: con 4 slides a `basis-1/4` y `gap-3`, los gaps
   * suman 36px que ya no caben — los cuatro items suman el 100% del track y los
   * gaps sobran —, así que la cuarta tarjeta se salía del viewport y quedaba
   * cortada. Poner el aire **dentro** del slide (`px-1.5` en el `CarouselItem`)
   * lo resuelve sin aritmética: 6px a cada lado, 12px entre tarjetas, y el
   * ancho del slide sigue siendo exactamente 1/N del track, que es lo que Embla
   * necesita para que los snaps caigan en páginas completas.
   *
   * Con `gap-0`, `px-1.5` y `basis-*` los cuatro items suman el 100% exacto:
   * 4 × 25% = 100%. Con `gap-3` sumaban 100% + 36px.
   */
  gapClassName?: string;
}

export function CarouselTrack({
  children,
  ariaLabel,
  viewportRef,
  onArrowKeys,
  onPause,
  onResume,
  className = "",
  gapClassName = "gap-3",
}: CarouselTrackProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onArrowKeys) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onArrowKeys("prev");
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onArrowKeys("next");
    }
  };

  return (
    <div
      ref={viewportRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocusCapture={onPause}
      onBlurCapture={onResume}
      className={`overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${className}`}
    >
      <div className={`flex ${gapClassName}`}>{children}</div>
    </div>
  );
}
