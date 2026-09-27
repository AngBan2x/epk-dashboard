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
}

export function CarouselTrack({
  children,
  ariaLabel,
  viewportRef,
  onArrowKeys,
  onPause,
  onResume,
  className = "",
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
      <div className="flex gap-3">{children}</div>
    </div>
  );
}
