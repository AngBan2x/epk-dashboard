"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString } from "@/lib/null-safe";
import type { Track, Artist } from "@/types/music";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CountBadge } from "@/components/ui/Badge";

interface EPKExporterProps {
  artist?: Artist;
  tracks?: Track[];
  className?: string;
}

export function EPKExporter({ artist, tracks = [], className = "" }: EPKExporterProps) {
  const [statusByFormat, setStatusByFormat] = useState<Record<"json" | "html", "idle" | "loading" | "success" | "error">>({
    json: "idle",
    html: "idle",
  });

  const handleExport = async (format: "json" | "html") => {
    setStatusByFormat((prev) => ({ ...prev, [format]: "loading" }));

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });

      if (!res.ok) throw new Error("Export fallida");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = `EPK_Dossier_${new Date().toISOString().slice(0, 10)}.${format}`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusByFormat((prev) => ({ ...prev, [format]: "success" }));
      setTimeout(() => setStatusByFormat((prev) => ({ ...prev, [format]: "idle" })), 3000);
    } catch {
      setStatusByFormat((prev) => ({ ...prev, [format]: "error" }));
      setTimeout(() => setStatusByFormat((prev) => ({ ...prev, [format]: "idle" })), 3000);
    }
  };

  const statusConfig = {
    idle: { icon: "📥", label: "Descargar", color: "bg-primary-600 hover:bg-primary-700" },
    loading: { icon: "⏳", label: "Generando...", color: "bg-slate-600 cursor-wait" },
    success: { icon: "✅", label: "¡Descargado!", color: "bg-emerald-600" },
    error: { icon: "⚠️", label: "Error", color: "bg-red-600" },
  };

  const hasTracks = tracks.length > 0;

  return (
    <section className={`p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 ${className}`}>
      <SectionHeader
        emoji="📄"
        title="Exportar Dossier EPK"
        subtitle="Genera y descarga la ficha técnica completa del catálogo para prensa o promotores."
        badges={<CountBadge>{tracks.length} tracks incluidos</CountBadge>}
      />

      {/* Vista previa */}
      {artist && (
        <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm space-y-1.5">
          <p><span className="text-slate-500 dark:text-slate-400">Artista:</span> <strong className="text-slate-900 dark:text-slate-100">{safeString(artist.name)}</strong></p>
          <p><span className="text-slate-500 dark:text-slate-400">Género:</span> {safeString(artist.genre)}</p>
          <p><span className="text-slate-500 dark:text-slate-400">Sede:</span> {safeString(artist.location)}</p>
          <p><span className="text-slate-500 dark:text-slate-400">Tracks en catálogo:</span> {tracks.length}</p>
        </div>
      )}

      {/* Botones de descarga directa por formato */}
      <div className="flex flex-col sm:flex-row gap-3">
        {(["json", "html"] as const).map((f) => {
          const current = statusConfig[statusByFormat[f]];
          return (
            <motion.button
              key={f}
              onClick={() => handleExport(f)}
              disabled={statusByFormat[f] === "loading" || !hasTracks}
              whileTap={{ scale: statusByFormat[f] === "loading" || !hasTracks ? 1 : 0.98 }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition flex items-center gap-2 ${current.color} disabled:opacity-50`}
              aria-label={hasTracks ? `Descargar dossier en ${f.toUpperCase()}` : "Sin tracks para exportar"}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={statusByFormat[f]}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center gap-2"
                >
                  {f === "json" ? "📄" : "🌐"} {f.toUpperCase()} · {current.icon} {current.label}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
