"use client";

import { motion } from "framer-motion";

export interface CarouselNavigationProps {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

const buttonClass =
  "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600";

export function CarouselNavigation({
  canPrev,
  canNext,
  onPrev,
  onNext,
}: CarouselNavigationProps) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <motion.button
        type="button"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        disabled={!canPrev}
        aria-label="Artista anterior"
        onClick={onPrev}
        className={buttonClass}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </motion.button>
      <motion.button
        type="button"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        disabled={!canNext}
        aria-label="Artista siguiente"
        onClick={onNext}
        className={buttonClass}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </motion.button>
    </div>
  );
}
