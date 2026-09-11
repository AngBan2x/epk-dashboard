"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString } from "@/lib/null-safe";
import { cn } from "@/lib/utils";

interface LyricsSectionProps {
  lyrics: string | null;
  isInstrumental?: boolean;
  trackId: string;
  isOwner: boolean;
  className?: string;
  onLyricsUpdated?: (lyrics: string | null, isInstrumental: boolean) => void;
}

export function LyricsSection({
  lyrics,
  isInstrumental = false,
  trackId,
  isOwner,
  className,
  onLyricsUpdated,
}: LyricsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editLyrics, setEditLyrics] = useState(lyrics || "");
  const [editInstrumental, setEditInstrumental] = useState(isInstrumental);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLyrics = lyrics != null && lyrics.length > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics: editLyrics || null,
          is_instrumental: editInstrumental,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }
      setIsEditing(false);
      onLyricsUpdated?.(editLyrics || null, editInstrumental);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditLyrics(lyrics || "");
    setEditInstrumental(isInstrumental);
    setIsEditing(false);
    setError(null);
  };

  return (
    <section
      className={cn(
        "bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>🎵</span> Letra
          </h2>
          {isInstrumental && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              Instrumental
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOwner && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
              Editar
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-600"
          >
            {isExpanded ? "Contraer" : "Expandir"}
            <svg
              className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Edit Mode */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 mb-4">
              {/* Instrumental toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editInstrumental}
                  onChange={(e) => setEditInstrumental(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Este track es instrumental (sin letra)
                </span>
              </label>

              {/* Lyrics textarea */}
              {!editInstrumental && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Letra del track
                  </label>
                  <textarea
                    value={editLyrics}
                    onChange={(e) => setEditLyrics(e.target.value)}
                    rows={12}
                    placeholder="Pega o escribe la letra del track aquí..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y font-mono"
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white transition"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Display Mode */}
      <AnimatePresence>
        {isExpanded && !isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-96 overflow-y-auto rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 p-4">
              {isInstrumental ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic text-center py-4">
                  Track instrumental — sin letra
                </p>
              ) : hasLyrics ? (
                <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 font-sans leading-relaxed">
                  {lyrics}
                </pre>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4">
                  Letra no disponible
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed preview */}
      {!isExpanded && !isEditing && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isInstrumental
            ? "Track instrumental"
            : hasLyrics
            ? `Preview: ${safeString(lyrics).slice(0, 120)}${(lyrics?.length ?? 0) > 120 ? "..." : ""}`
            : "Letra no disponible"}
        </p>
      )}
    </section>
  );
}
