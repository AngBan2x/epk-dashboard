'use client';

import { useState, useEffect } from 'react';
import type { Show, ShowStatus } from '@/types/music';
import { safeString } from '@/lib/null-safe';

const defaultStatus = { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-300 dark:border-slate-600', label: 'Desconocido' };

const statusConfig: Record<ShowStatus, { color: string; bg: string; border: string; label: string }> = {
  proximamente: { color: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-300 dark:border-yellow-700', label: 'Próximamente' },
  activo: { color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-300 dark:border-green-700', label: 'Activo' },
  confirmado: { color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-300 dark:border-purple-700', label: 'Confirmado' },
  en_venta: { color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/30', border: 'border-indigo-300 dark:border-indigo-700', label: 'En Venta' },
  agotado: { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-300 dark:border-red-700', label: 'Agotado' },
  cancelado: { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-300 dark:border-red-700', label: 'Cancelado' },
  pospuesto: { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-300 dark:border-orange-700', label: 'Pospuesto' },
  reprogramado: { color: 'text-cyan-700 dark:text-cyan-300', bg: 'bg-cyan-100 dark:bg-cyan-900/30', border: 'border-cyan-300 dark:border-cyan-700', label: 'Reprogramado' },
  disponible: { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-300 dark:border-emerald-700', label: 'Disponible' },
  pasado: { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-300 dark:border-slate-600', label: 'Pasado' },
  hoy: { color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-300 dark:border-blue-700', label: 'Hoy' },
  suspendido: { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-300 dark:border-slate-600', label: 'Suspendido' },
  finalizado: { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-300 dark:border-slate-600', label: 'Finalizado' },
};

function formatDateSpanish(dateStr: string | null): string {
  if (!dateStr) return 'Fecha por confirmar';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function ShowsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShowStatus | ''>('');
  const [futureOnly, setFutureOnly] = useState(false);

  useEffect(() => {
    fetch('/api/shows').then(async (res) => {
      const data = await res.json();
      setShows(data.shows || []);
      setLoading(false);
    });
  }, []);

  const filteredShows = shows.filter((show) => {
    // Search filter by venue/city
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesVenue = show.venue_name.toLowerCase().includes(searchLower);
      const matchesCity = show.city && show.city.toLowerCase().includes(searchLower);
      const matchesCountry = show.country && show.country.toLowerCase().includes(searchLower);
      if (!matchesVenue && !matchesCity && !matchesCountry) {
        return false;
      }
    }

    // Status filter
    if (statusFilter && show.status !== statusFilter) {
      return false;
    }

    // Future only filter
    if (futureOnly && show.date) {
      const showDate = new Date(show.date);
      const today = new Date();
      if (showDate <= today) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      {/* Page header */}
      <header className="mb-6 text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Shows & Events</h1>
        <p className="text-lg text-muted-foreground">
          {filteredShows.length} {filteredShows.length === 1 ? 'show programado' : 'shows programados'}
        </p>
      </header>

      {/* Filters section */}
      <div className="mb-6 rounded-xl border border-border px-4 py-3 bg-card/50 backdrop-blur-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Search input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Buscar por venue o ciudad
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-input"
              placeholder="Venue o ciudad"
            />
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ShowStatus)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-input"
            >
              <option value="">Todos</option>
              {(["proximamente", "activo", "confirmado", "en_venta", "agotado", "cancelado", "pospuesto", "reprogramado", "disponible", "pasado", "hoy", "suspendido", "finalizado"] as ShowStatus[]).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          {/* Future only toggle */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={futureOnly}
                onChange={(e) => setFutureOnly(e.target.checked)}
                className="rounded bg-primary px-2 py-1"
              />
              {futureOnly && 'Solo futuros'}
            </label>
          </div>
        </div>
      </div>

      {/* Shows grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 animate-pulse">
            <div className="h-24 w-full rounded-lg mb-3" />
            <div className="flex items-center gap-2">
              <div className="h-4 w-1/3 rounded" />
              <div className="h-4 w-2/3 rounded" />
              <div className="h-4 w-1/2 rounded" />
            </div>
          </div>
        ) : filteredShows.length === 0 ? (
          <div className="col-span-full text-center py-8">
            <p className="text-3xl mb-2">🎤</p>
            <p className="text-lg text-muted-foreground">No hay shows programados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredShows.map((show) => (
              <ShowCard show={show} statusConfig={statusConfig} key={show.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 animate-pulse"
    >
      <div className="h-24 w-full rounded-lg mb-3" />
      <div className="flex items-center gap-2 mb-1">
        <div className="h-4 w-1/3 rounded" />
        <div className="h-4 w-2/3 rounded" />
        <div className="h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}

function ShowCard({ show, statusConfig }: { show: Show; statusConfig: Record<ShowStatus, { color: string; bg: string; border: string; label: string }> }) {
  const formattedDate = formatDateSpanish(show.date);
  const status = statusConfig[show.status] ?? defaultStatus;

  return (
    <div
      key={show.id}
      className="rounded-2xl border border-border bg-card p-4 hover:bg-card-hover transition-colors"
    >
      {/* Flyer image header */}
      {show.flyer_url && (
        <img
          src={show.flyer_url}
          alt={safeString(show.venue_name)}
          className="h-48 w-full rounded-t-lg object-cover mb-3"
        />
      )}

      {/* Card content */}
      <div className="pt-4">
        <h3 className="font-semibold text-foreground truncate">{safeString(show.venue_name)}</h3>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
          {show.city && <span>{safeString(show.city)}</span>}
          {show.country && <span>{safeString(show.country)}</span>}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {safeString(show.description)?.substring(0, 100)}
        </p>

        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span>{safeString(show.date)}</span>
          {show.time && (
            <span className="text-primary/80">
              •{safeString(show.time)}
            </span>
          )}
        </div>

        {show.price_range && (
          <p className="text-primary font-medium mb-2">{safeString(show.price_range)}</p>
        )}

        {show.ticket_url && (
          <a
            href={show.ticket_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm font-medium"
          >
            🎟️ Ver tickets
          </a>
        )}
      </div>

      {/* Status badge */}
      <div className="mt-2 flex items-center gap-1 text-xs font-medium">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full ${status.bg} ${status.color} ${status.border}`}>
          {status.label}
        </span>
      </div>
    </div>
  );
}