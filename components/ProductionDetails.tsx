"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString, hasValue } from "@/lib/null-safe";
import type { ProductionDetails as ProductionDetailsType } from "@/types/music";
import { cn } from "@/lib/utils";

interface ProductionDetailsProps {
  details: ProductionDetailsType;
  className?: string;
  isOwner?: boolean;
  trackId?: string;
  onDetailsUpdated?: (details: ProductionDetailsType) => void;
}

export function ProductionDetails({
  details,
  className,
  isOwner = false,
  trackId,
  onDetailsUpdated,
}: ProductionDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editData, setEditData] = useState({
    genre: details.genre ?? "",
    sub_genre: details.sub_genre ?? "",
    bpm: details.bpm?.toString() ?? "",
    key: details.key ?? "",
    mood: details.mood ?? "",
    recording_date: details.recording_date ?? "",
    production_credits: details.production_credits ?? "",
  });

  const readOnlyFields = [
    { label: "DAW", key: "daw" as const },
    { label: "Guitarras", key: "guitars" as const },
    { label: "Efectos", key: "effects_chain" as const },
    { label: "Afinación", key: "tuning" as const },
  ];

  const editableFields = [
    { label: "Género", key: "genre" as const, type: "text" },
    { label: "Sub-género", key: "sub_genre" as const, type: "text" },
    { label: "BPM", key: "bpm" as const, type: "number" },
    { label: "Tonalidad", key: "key" as const, type: "text" },
    { label: "Mood", key: "mood" as const, type: "text" },
    { label: "Fecha de grabación", key: "recording_date" as const, type: "date" },
  ];

  const getSummary = () => {
    const parts: string[] = [];
    if (details.genre) parts.push(details.genre);
    if (details.bpm) parts.push(`${details.bpm} BPM`);
    if (details.key) parts.push(details.key);
    if (details.sub_genre) parts.push(details.sub_genre);
    if (details.mood) parts.push(details.mood);
    return parts.length > 0 ? parts.join(" · ") : "Sin datos de producción";
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<ProductionDetailsType> = {
        genre: editData.genre || null,
        sub_genre: editData.sub_genre || null,
        bpm: editData.bpm ? parseInt(editData.bpm, 10) : null,
        key: editData.key || null,
        mood: editData.mood || null,
        recording_date: editData.recording_date || null,
        production_credits: editData.production_credits || null,
      };

      const res = await fetch(`/api/tracks/${trackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ production_details: payload }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }

      setIsEditing(false);
      onDetailsUpdated?.({
        ...details,
        ...payload,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData({
      genre: details.genre ?? "",
      sub_genre: details.sub_genre ?? "",
      bpm: details.bpm?.toString() ?? "",
      key: details.key ?? "",
      mood: details.mood ?? "",
      recording_date: details.recording_date ?? "",
      production_credits: details.production_credits ?? "",
    });
    setIsEditing(false);
    setError(null);
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
            Ficha de Producción
          </h3>
          {isOwner && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              title="Editar producción"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          title={isExpanded ? "Colapsar" : "Expandir"}
        >
          <svg
            className={cn("w-5 h-5 transition-transform", isExpanded && "rotate-180")}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* Collapsed summary */}
      {!isExpanded && !isEditing && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {getSummary()}
        </p>
      )}

      {/* Edit Mode */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-4">
              {/* Editable fields */}
              <dl className="grid grid-cols-2 gap-3">
                {editableFields.map(({ label, key, type }) => (
                  <div key={key}>
                    <dt className="text-xs text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</dt>
                    <dd>
                      <input
                        type={type}
                        value={editData[key]}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder={label}
                      />
                    </dd>
                  </div>
                ))}
              </dl>

              {/* Production credits textarea */}
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Créditos de producción
                </label>
                <textarea
                  value={editData.production_credits}
                  onChange={(e) =>
                    setEditData((prev) => ({ ...prev, production_credits: e.target.value }))
                  }
                  rows={3}
                  placeholder="Productor, ingeniero de mezcla, masterización..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
              </div>

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
            <dl className="grid grid-cols-2 gap-2">
              {readOnlyFields.map(({ label, key }) => (
                <div key={key}>
                  <dt className="text-xs text-slate-500 dark:text-slate-400 uppercase">{label}</dt>
                  <dd className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {hasValue(details, key) ? safeString(details[key]) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </dd>
                </div>
              ))}
              {editableFields.map(({ label, key }) => (
                <div key={key}>
                  <dt className="text-xs text-slate-500 dark:text-slate-400 uppercase">{label}</dt>
                  <dd className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {key === "bpm" 
                      ? (details[key] != null ? `${details[key]} BPM` : <span className="text-slate-300 dark:text-slate-600">—</span>)
                      : (details[key] ? safeString(details[key]) : <span className="text-slate-300 dark:text-slate-600">—</span>)
                    }
                  </dd>
                </div>
              ))}
            </dl>
            {details.production_credits && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <dt className="text-xs text-slate-500 dark:text-slate-400 uppercase mb-1">Créditos</dt>
                <dd className="text-sm text-slate-600 dark:text-slate-300">
                  {details.production_credits}
                </dd>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
