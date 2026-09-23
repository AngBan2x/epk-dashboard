"use client";

import { useState, useEffect } from "react";
import type { Show, ShowStatus } from "@/types/music";
import { safeString } from "@/lib/null-safe";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CountBadge, Badge } from "@/components/ui/Badge";
import { showStatusClass, showStatusLabel, paymentMethodLabel } from "@/lib/show-status";

interface ShowsBookingProps {
  artistId?: string;
  shows?: Show[];
  editable?: boolean;
  onEdit?: (show: Show) => void;
  onDelete?: (showId: string) => void;
  onAdd?: () => void;
}

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasExtra = (show: Show) =>
    !!(show.description || show.notes || show.flyer_url || show.ticket_link ||
      (show.guest_artists && show.guest_artists.length > 0) ||
      (show.payment_methods && show.payment_methods.length > 0) ||
      (show.status === "pospuesto" && show.postponement_reason));

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
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <SectionHeader
          emoji="🎤"
          title="Shows & Booking"
          subtitle="Gestiona tus conciertos y booking"
          badges={<CountBadge>{shows.length} shows</CountBadge>}
          action={
            editable && onAdd ? (
              <button
                onClick={onAdd}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white transition"
              >
                + Nuevo Show
              </button>
            ) : undefined
          }
        />
      </div>

      {shows.length === 0 ? (
        <div className="p-8 text-center text-slate-400 dark:text-slate-500">
          <p className="text-3xl mb-2">🎤</p>
          <p>No hay shows programados</p>
          {editable && onAdd && (
            <button
              onClick={onAdd}
              className="mt-3 text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              Agregar el primer show
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {shows.map((show) => {
            const isPast = !!show.date && new Date(show.date) < new Date();
            return (
              <div
                key={show.id}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                        {safeString(show.venue_name)}
                      </h4>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${showStatusClass(show.status)}`}>
                        {showStatusLabel(show.status)}
                      </span>
                      {isPast && (
                        <Badge variant="amber">Pasado · se elimina en 48h</Badge>
                      )}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      <p className="flex items-center gap-1">
                        📍 {(show.city || show.country) ? [show.city, show.country].filter(Boolean).join(", ") : "Ubicación por confirmar"}
                      </p>
                      <p className="flex items-center gap-1">
                        📅 {show.date ? formatDate(show.date) : "Fecha por confirmar"}
                        {show.date && show.time && ` • ${show.time}`}
                      </p>
                      {show.price_range && (
                        <p className="flex items-center gap-1">
                          💰 {show.price_range}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasExtra(show) && (
                      <button
                        onClick={() => toggleExpanded(show.id)}
                        title={expanded.has(show.id) ? "Ocultar detalles" : "Ver detalles"}
                        aria-label={expanded.has(show.id) ? "Ocultar detalles" : "Ver detalles"}
                        aria-expanded={expanded.has(show.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        <svg className={`w-4 h-4 transition-transform ${expanded.has(show.id) ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                    )}
                    {show.ticket_url && (
                      <a
                        href={show.ticket_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white transition"
                      >
                        🎟️ Tickets
                      </a>
                    )}
                    {editable && (
                      <>
                        {onEdit && (
                          <button
                            onClick={() => onEdit(show)}
                            title="Editar show"
                            aria-label="Editar show"
                            className="p-2 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(show.id)}
                            title="Eliminar show"
                            aria-label="Eliminar show"
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {expanded.has(show.id) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-sm">
                    {show.description && (
                      <p className="text-slate-600 dark:text-slate-300">{show.description}</p>
                    )}
                    {show.guest_artists && show.guest_artists.length > 0 && (
                      <p className="text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-200">🎤 Invitados: </span>
                        {show.guest_artists.map((g) => g.role ? `${g.name} (${g.role})` : g.name).join(" · ")}
                      </p>
                    )}
                    {show.payment_methods && show.payment_methods.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200 text-sm">💳 Pago:</span>
                        {show.payment_methods.map((pm, i) => (
                          <Badge key={i}>{paymentMethodLabel(pm.type)}{pm.details ? ` — ${pm.details}` : ""}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {show.flyer_url && (
                        <a href={show.flyer_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                          🖼️ Ver flyer
                        </a>
                      )}
                      {show.ticket_link && show.ticket_link !== show.ticket_url && (
                        <a href={show.ticket_link} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                          🎟️ Link alternativo de tickets
                        </a>
                      )}
                    </div>
                    {show.status === "pospuesto" && show.postponement_reason && (
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        ⏸️ Motivo de posposición: {show.postponement_reason}
                      </p>
                    )}
                    {editable && show.notes && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                        🔒 Solo tú: {show.notes}
                      </p>
                    )}
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
