"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString } from "@/lib/null-safe";
import type { Track, Artist } from "@/types/music";

interface EPKExporterProps {
  artist?: Artist;
  tracks?: Track[];
  className?: string;
}

export function EPKExporter({ artist, tracks = [], className = "" }: EPKExporterProps) {
  const [exportStatus, setExportStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [format, setFormat] = useState<"json" | "html">("json");

  const handleExport = async () => {
    setExportStatus("loading");

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

      setExportStatus("success");
      setTimeout(() => setExportStatus("idle"), 3000);
    } catch {
      setExportStatus("error");
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  };

  const statusConfig = {
    idle: { icon: "📥", label: "Exportar Dossier EPK", color: "bg-primary-600 hover:bg-primary-500" },
    loading: { icon: "⏳", label: "Generando dossier...", color: "bg-slate-600 cursor-wait" },
    success: { icon: "✅", label: "¡Descargado!", color: "bg-emerald-600" },
    error: { icon: "⚠️", label: "Error al exportar", color: "bg-red-600" },
  };

  const current = statusConfig[exportStatus];

  return (
    <section className={`p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>📄</span> Exportar Dossier EPK
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Genera y descarga la ficha técnica completa del catálogo para prensa o promotores.
          </p>
        </div>
        <span className="text-xs bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold px-2.5 py-1 rounded-full border border-indigo-300 dark:border-indigo-800">
          {tracks.length} tracks incluidos
        </span>
      </div>

      {/* Vista previa */}
      {artist && (
        <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm space-y-1.5">
          <p><span className="text-slate-500 dark:text-slate-400">Artista:</span> <strong className="text-slate-900 dark:text-slate-100">{safeString(artist.name)}</strong></p>
          <p><span className="text-slate-500 dark:text-slate-400">Género:</span> {safeString(artist.genre)}</p>
          <p><span className="text-slate-500 dark:text-slate-400">Sede:</span> {safeString(artist.location)}</p>
          <p><span className="text-slate-500 dark:text-slate-400">Tracks en catálogo:</span> {tracks.length}</p>
        </div>
      )}

      {/* Selección de formato */}
      <div className="flex gap-3 mb-5">
        {(["json", "html"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className={`px-4 py-2 rounded-lg border text-sm font-semibold transition ${
              format === f
                ? "bg-primary-600 text-white border-primary-500 shadow-md"
                : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:border-primary-500/50"
            }`}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Botón de exportación */}
      <motion.button
        onClick={handleExport}
        disabled={exportStatus === "loading"}
        whileHover={{ scale: exportStatus === "loading" ? 1 : 1.02 }}
        whileTap={{ scale: exportStatus === "loading" ? 1 : 0.98 }}
        className={`w-full py-3 rounded-xl text-white font-bold text-base transition-all duration-200 flex items-center justify-center gap-2 ${current.color} disabled:opacity-70`}
        aria-label={current.label}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={exportStatus}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="flex items-center gap-2"
          >
            {current.icon} {current.label}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </section>
  );
}
