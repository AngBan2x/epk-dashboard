"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString } from "@/lib/null-safe";
import type { Show } from "@/types/music";

interface ShowDate {
  id: string;
  date: string;
  venue_name: string;
  city: string;
  country: string;
  status: "proximamente" | "activo" | "pospuesto" | "hoy" | "pasado" | "cancelado" | "suspendido" | "confirmado" | "en_venta" | "agotado";
  ticket_url?: string;
  price_range?: string;
}

interface BookingModuleProps {
  artistName?: string;
  artistId?: string;
  className?: string;
}

export function BookingModule({
  artistName = "Artista EPK",
  artistId,
  className = "",
}: BookingModuleProps) {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistId) {
      setLoading(false);
      return;
    }
    fetch(`/api/shows?artist_id=${artistId}`)
      .then((r) => { if (!r.ok) throw new Error("Error al cargar shows"); return r.json(); })
      .then((data) => setShows(data.shows || []))
      .catch((err) => setError(err.message || "Error al cargar shows"))
      .finally(() => setLoading(false));
  }, [artistId]);

  const statusColors: Record<string, string> = {
    proximamente: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
    activo: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
    pospuesto: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
    hoy: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
    pasado: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600",
    cancelado: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800",
    suspendido: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600",
    confirmado: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700",
    en_venta: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
    agotado: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800",
  };

  return (
    <section className={`p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>🎫</span> Shows & Booking
        </h2>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Cargando shows...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400">
            <p>{error}</p>
          </div>
        ) : shows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <p>No hay shows registrados para este artista.</p>
          </div>
        ) : (
          <motion.div
            key="shows"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {shows.map((show) => (
              <div
                key={show.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:border-primary-500/30 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-lg">🎵</span>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {safeString(show.venue_name)}
                    </p>
                  </div>
<p className="text-sm text-slate-500 dark:text-slate-400 ml-8">
                    {safeString(show.city)}, {safeString(show.country)} · {show.date ? new Date(show.date).toLocaleDateString("es-VE") : "Fecha por confirmar"}
                  </p>
                  {show.price_range && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 ml-8 mt-1">
                      Desde {show.price_range}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3 sm:mt-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColors[show.status] || statusColors.proximamente}`}>
                    {show.status}
                  </span>
                  {show.ticket_url && show.status !== "agotado" && (
                    <a
                      href={show.ticket_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white transition"
                    >
                      🎟️ Comprar
                    </a>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}