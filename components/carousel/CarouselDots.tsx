"use client";

export interface CarouselDotsProps {
  scrollSnaps: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  label?: string;
}

export function CarouselDots({
  scrollSnaps,
  selectedIndex,
  onSelect,
  label = "artista",
}: CarouselDotsProps) {
  if (scrollSnaps.length <= 1) return null;

  return (
    <div className="mt-3 flex items-center justify-center gap-2">
      {scrollSnaps.map((_, index) => {
        const isActive = index === selectedIndex;
        return (
          <button
            key={index}
            type="button"
            aria-label={`Ir al ${label} ${index + 1}`}
            aria-current={isActive}
            onClick={() => onSelect(index)}
            className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              isActive
                ? "w-6 bg-primary-600"
                : "w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500"
            }`}
          />
        );
      })}
    </div>
  );
}
