"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString } from "@/lib/null-safe";
import type { Show } from "@/types/music";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { showStatusClass, showStatusLabel } from "@/lib/show-status";

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

  return (
    <section className={`p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 ${className}`}>
      <SectionHeader
        emoji="🎫"
        title="Shows & Booking"
        subtitle="Fechas y entradas del artista"
      />

      <AnimatePresence mode="wait">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Cargando shows...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400">
            <p>{error}</p>
          </div>
        ) : shows.length === 0 ? (
          <EmptyState emoji="🎤" message="No hay shows registrados para este artista." />
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
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${showStatusClass(show.status)}`}>
                    {showStatusLabel(show.status)}
                  </span>
                  {show.ticket_url && show.status !== "agotado" && (
                    <a
                      href={show.ticket_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white transition"
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