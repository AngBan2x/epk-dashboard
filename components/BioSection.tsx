"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString } from "@/lib/null-safe";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";

interface BioSectionProps {
  artistName?: string;
  genre?: string;
  location?: string;
  monthlyListeners?: number;
  biography?: string | null;
  pressText?: string | null;
  pressHighlights?: string[] | null;
  className?: string;
}

export function BioSection({
  artistName = "Artista EPK",
  genre = "Multi-género",
  location = "Latinoamérica",
  monthlyListeners = 0,
  biography = null,
  pressText = null,
  pressHighlights = null,
  className = "",
}: BioSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const hasContent = Boolean(biography || pressText);
  const bioShort = biography || pressText || "";
  const bioFull = pressText || biography || "";
  const highlights = pressHighlights?.length ? pressHighlights : [];

  const handlePrint = () => {
    setShowPrintPreview(true);
    setTimeout(() => {
      window.print();
      setShowPrintPreview(false);
    }, 100);
  };

  return (
    <section className={`p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 ${className}`}>
      <SectionHeader
        emoji="📝"
        title="Biografía & Prensa"
        subtitle="Historia del artista y material de prensa oficial"
        action={
          hasContent ? (
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-600"
            >
              🖨️ Imprimir
            </button>
          ) : undefined
        }
      />

      {!hasContent ? (
        <EmptyState
          emoji="📝"
          message="Añade tu biografía y press kit desde tu perfil"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Artista</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{safeString(artistName)}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Género</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{safeString(genre)}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Ubicación</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{safeString(location)}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Oyentes Mensuales</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {monthlyListeners > 0 ? new Intl.NumberFormat("es-VE").format(monthlyListeners) : "N/A"}
              </p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              {bioShort}
            </p>
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {bioFull && bioFull !== bioShort && (
                  <div className="mb-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {bioFull}
                    </p>
                  </div>
                )}

                {highlights.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Destacados</h4>
                    <ul className="space-y-1.5">
                      {highlights.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              {isExpanded ? "← Contraer" : "Leer más →"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
