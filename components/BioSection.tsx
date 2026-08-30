"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString } from "@/lib/null-safe";

interface BioSectionProps {
  artistName?: string;
  genre?: string;
  location?: string;
  monthlyListeners?: number;
  className?: string;
}

const defaultBio = {
  short: "Artista multidisciplinario con trayectoria en producción musical, composición y performance en vivo. Catálogo que abarca desde rock clásico hasta producción electrónica contemporánea.",
  full: `Con más de una década de experiencia en la industria musical, este artista ha construido un catálogo que refleja versatilidad y autenticidad. Desde sus primeras grabaciones en estudios caseros hasta producciones de alta fidelidad, cada track cuenta una historia única.

Su sonido fusiona elementos de rock, electrónica y producción moderna, con influencias que van desde clásicos de los 70 hasta tendencias contemporáneas. El uso de tecnología de vanguardia como Web Audio API y producción multicanal demuestra su compromiso con la innovación.

Disponible para shows, festivales, sesiones de estudio y colaboraciones internacionales.`,
  highlights: [
    "Producción multicanal con stems profesionales",
    "Catálogo en plataformas Spotify, Apple Music, YouTube",
    "Experiencia en escenarios internacionales",
    "Colaboraciones con productores de múltiples géneros",
  ],
};

export function BioSection({
  artistName = "Artista EPK",
  genre = "Multi-género",
  location = "Latinoamérica",
  monthlyListeners = 0,
  className = "",
}: BioSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const handlePrint = () => {
    setShowPrintPreview(true);
    setTimeout(() => {
      window.print();
      setShowPrintPreview(false);
    }, 100);
  };

  return (
    <section className={`p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>📝</span> Biografía & Prensa
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Historia del artista y material de prensa oficial
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-600"
        >
          🖨️ Imprimir Hoja de Prensa
        </button>
      </div>

      {/* Artist Quick Info */}
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

      {/* Bio Short */}
      <div className="mb-4">
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          {defaultBio.short}
        </p>
      </div>

      {/* Bio Full (expandable) */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {defaultBio.full}
              </p>
            </div>

            {/* Highlights */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Destacados</h4>
              <ul className="space-y-1.5">
                {defaultBio.highlights.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
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
        <button
          onClick={handlePrint}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white transition"
        >
          🖨️ Imprimir Hoja de Prensa
        </button>
      </div>
    </section>
  );
}
