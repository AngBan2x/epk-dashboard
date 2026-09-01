"use client";

import { useState, useEffect } from "react";
import type { Show, ShowStatus } from "@/types/music";
import { safeString } from "@/lib/null-safe";

interface ShowsBookingProps {
  artistId?: string;
  shows?: Show[];
  editable?: boolean;
  onEdit?: (show: Show) => void;
  onDelete?: (showId: string) => void;
  onAdd?: () => void;
}

const statusConfig: Record<ShowStatus, { color: string; bg: string; border: string; label: string }> = {
  disponible: { color: "text-green-700 dark:text-green-300", bg: "bg-green-100 dark:bg-green-900/30", border: "border-green-300 dark:border-green-700", label: "Disponible" },
  agotado: { color: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-900/30", border: "border-red-300 dark:border-red-700", label: "Agotado" },
  proximamente: { color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-yellow-900/30", border: "border-yellow-300 dark:border-yellow-700", label: "Próximamente" },
  vip: { color: "text-purple-700 dark:text-purple-300", bg: "bg-purple-100 dark:bg-purple-900/30", border: "border-purple-300 dark:border-purple-700", label: "VIP" },
  cancelado: { color: "text-slate-700 dark:text-slate-300", bg: "bg-slate-100 dark:bg-slate-800", border: "border-slate-300 dark:border-slate-600", label: "Cancelado" },
  pausado: { color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-100 dark:bg-orange-900/30", border: "border-orange-300 dark:border-orange-700", label: "Pausado" },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Fecha por confirmar";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export function ShowsBooking({ artistId, shows: propShows, editable = false, onEdit, onDelete, onAdd }: ShowsBookingProps) {
  const [shows, setShows] = useState<Show[]>(propShows || []);
  const [loading, setLoading] = useState(!propShows);

  useEffect(() => {
    if (propShows) {
      setShows(propShows);
      return;
    }
    if (!artistId) return;

    const fetchShows = async () => {
      try {
        const res = await fetch(`/api/shows?artist_id=${artistId}`);
        if (res.ok) {
          const data = await res.json();
          setShows(data.shows || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchShows();
  }, [artistId, propShows]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">
            Shows & Booking
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {shows.length} {shows.length === 1 ? "show programado" : "shows programados"}
          </p>
        </div>
        {editable && onAdd && (
          <button
            onClick={onAdd}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
          >
            + Nuevo Show
          </button>
        )}
      </div>

      {shows.length === 0 ? (
        <div className="p-8 text-center text-slate-400 dark:text-slate-500">
          <p className="text-3xl mb-2">🎤</p>
          <p>No hay shows programados</p>
          {editable && onAdd && (
            <button
              onClick={onAdd}
              className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Agregar el primer show
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {shows.map((show) => {
            const config = statusConfig[show.status] || statusConfig.disponible;
            return (
              <div
                key={show.id}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                        {safeString(show.venue_name)}
                      </h4>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}>
                        {config.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                      {(show.city || show.country) && (
                        <span className="flex items-center gap-1">
                          📍 {[show.city, show.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {show.date && (
                        <span className="flex items-center gap-1">
                          📅 {formatDate(show.date)}
                          {show.time && ` • ${show.time}`}
                        </span>
                      )}
                      {show.price_range && (
                        <span className="flex items-center gap-1">
                          💰 {show.price_range}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {show.ticket_url && (
                      <a
                        href={show.ticket_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                      >
                        🎟️ Tickets
                      </a>
                    )}
                    {editable && (
                      <>
                        {onEdit && (
                          <button
                            onClick={() => onEdit(show)}
                            className="px-2 py-1.5 rounded text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition"
                          >
                            ✏️
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(show.id)}
                            className="px-2 py-1.5 rounded text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                          >
                            🗑️
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {show.date && new Date(show.date) < new Date() && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      ⚠️ Este show ya pasó. Será eliminado automáticamente en 48 horas.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
