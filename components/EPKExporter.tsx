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
    idle: { icon: "📥", label: "Exportar Dossier EPK", color: "bg-primary-600 hover:bg-primary-700" },
    loading: { icon: "⏳", label: "Generando dossier...", color: "bg-slate-600 cursor-wait" },
    success: { icon: "✅", label: "¡Descargado!", color: "bg-emerald-600" },
    error: { icon: "⚠️", label: "Error al exportar", color: "bg-red-600" },
  };

  const current = statusConfig[exportStatus];
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

      {/* Selección de formato */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-5">
        {(["json", "html"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              format === f
                ? "text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 bg-primary-50 dark:bg-primary-950/20"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {f === "json" ? "📄 JSON" : "🌐 HTML"}
          </button>
        ))}
      </div>

      {/* Botón de exportación */}
      <motion.button
        onClick={handleExport}
        disabled={exportStatus === "loading" || !hasTracks}
        whileTap={{ scale: exportStatus === "loading" || !hasTracks ? 1 : 0.98 }}
        className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition flex items-center gap-2 ${current.color} disabled:opacity-50`}
        aria-label={hasTracks ? current.label : "Sin tracks para exportar"}
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
