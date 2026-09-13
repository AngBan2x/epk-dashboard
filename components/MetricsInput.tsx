"use client";

import { useState } from "react";

interface MetricsInputProps {
  trackId: string;
  currentSaves?: number;
  currentPlaylists?: number;
  onUpdate?: () => void;
}

export function MetricsInput({
  trackId,
  currentSaves = 0,
  currentPlaylists = 0,
  onUpdate,
}: MetricsInputProps) {
  const [saves, setSaves] = useState(currentSaves);
  const [playlists, setPlaylists] = useState(currentPlaylists);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/webhooks/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track_id: trackId,
          date: new Date().toISOString().split("T")[0],
          streams: 0,
          saves,
          playlist_additions: playlists,
          top_countries: [],
          source: "manual",
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate?.();
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
        Métricas Manuales
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Saves (Spotify)
          </label>
          <input
            type="number"
            value={saves}
            onChange={(e) => setSaves(parseInt(e.target.value) || 0)}
            className="w-full mt-1 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Playlists (Spotify)
          </label>
          <input
            type="number"
            value={playlists}
            onChange={(e) => setPlaylists(parseInt(e.target.value) || 0)}
            className="w-full mt-1 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-3 px-4 py-2 text-xs font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {saving ? "Guardando..." : saved ? "\u2713 Guardado" : "Guardar M\u00e9tricas"}
      </button>
    </div>
  );
}
