"use client";

import type { ReactNode } from "react";

export interface CarouselItemProps {
  children: ReactNode;
  label: string;
  index: number;
  total: number;
  className?: string;
}

export function CarouselItem({
  children,
  label,
  index,
  total,
  className = "",
}: CarouselItemProps) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${label} ${index + 1} de ${total}`}
      className={`min-w-0 shrink-0 grow-0 basis-full ${className}`}
    >
      {children}
    </div>
  );
}
