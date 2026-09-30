"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString } from "@/lib/null-safe";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Celda de métrica. `min-w-0` permite que la celda se encoja dentro del grid.
 * El valor usa `line-clamp-2` y no `truncate`: `truncate` es una sola linea con
 * puntos suspensivos, asi que a 192px (las 4 columnas de la pagina de artista)
 * "Rock Alternativo / Acoustic" se cortaba a "Rock Alternativo /…". Con dos
 * lineas cabe, y `title` conserva el texto integro para quien lo necesite.
 */
function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      {/*
        `line-clamp-3`, no 2. Las celdas miden ~180px (4 columnas en la
        pagina de artista) y a 2 lineas caben ~28 caracteres. "Alternative Rock
        / Experimental / Art Pop" son 42 y "Abingdon, Oxfordshire, Reino
        Unido" 35: la segunda linea salia con dos letras ("Ar...") y elipsis,
        que se lee como dato roto. Con 3 lineas caben. `title` ya estaba, asi
        que el dato completo nunca se perdia, pero verse bien no es opcional.
      */}
      <p
        className="line-clamp-3 text-sm font-semibold text-slate-900 dark:text-slate-100"
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

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
          {/*
            Métricas del artista.
            El número de columnas se decide con una *container query*
            (`@container`), no con un breakpoint de viewport: dentro de la
            columna de Bio del carrusel (~520px) el componente sigue midiendo
            ~520px aunque el viewport tenga 1440px, así que nunca se parte en
            4 columnas apretadas. Pasa a 4 columnas solo cuando SU contenedor
            alcanza 640px (la página de artista, con 814px de grid).
            Si el navegador no soporta container queries, se queda en 2×2.
          */}
          <div className="mb-6 [container-type:inline-size]">
            {/*
              Tres escalones medidos sobre la app, no inventados:
              - <22rem (~352px): 1 columna. Es el caso del carrusel en movil
                (slide de 308px): con 2 columnas las celdas quedaban de 100px
                y "Valencia, Venezuela" se cortaba.
              - 22rem-40rem: 2 columnas. Carrusel en desktop (columna de bio de
                ~520px) -> celdas de 250px, sin truncar. Bloque de bio del
                dashboard (~560px) aqui.
              - >=40rem: 4 columnas. Pagina de artista (grid de 814px) -> 192px
                por celda, igual que antes del cambio.
              Sin soporte de container queries queda en 1 columna, que es la
              lectura segura.
            */}
            <div className="grid grid-cols-1 gap-4 [@container(min-width:22rem)]:grid-cols-2 [@container(min-width:40rem)]:grid-cols-4">
              <MetricCell label="Artista" value={safeString(artistName)} />
              <MetricCell label="Género" value={safeString(genre)} />
              <MetricCell label="Ubicación" value={safeString(location)} />
              <MetricCell
                label="Oyentes Mensuales"
                value={
                  monthlyListeners > 0
                    ? new Intl.NumberFormat("es-VE").format(monthlyListeners)
                    : "N/A"
                }
              />
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
