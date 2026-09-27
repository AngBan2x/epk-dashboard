'use client';

import Image from "next/image";
import { useState, useEffect } from 'react';
import type { Show, ShowStatus } from '@/types/music';
import { safeString } from '@/lib/null-safe';
import { sortList } from '@/lib/search';
import { showStatusClass, showStatusLabel, SHOW_STATUS_OPTIONS } from '@/lib/show-status';
import { SortSelect, useListSort } from '@/components/SortSelect';

const SHOW_ACCESSORS = {
  text: (show: Show) => safeString(show.venue_name),
  date: (show: Show) => show.date,
};

const DEFAULT_SORT = { sort: "date", order: "asc" } as const;

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

const LABEL_CLASS = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

const FIELD_CLASS = `w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 ${FOCUS_RING}`;

const PAYMENT_DISCLAIMER =
  'Los pagos se realizan directamente al artista u organizador del evento. PressPlay no procesa ni custodia dinero y no se responsabiliza por pagos perdidos o estafas.';

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
  const [sortState, setSortState] = useListSort(DEFAULT_SORT);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const venue = params.get('venue') ?? params.get('q');
    if (venue) setSearch(venue);
  }, []);

  useEffect(() => {
    fetch('/api/shows').then(async (res) => {
      const data = await res.json();
      setShows(data.shows || []);
      setLoading(false);
    });
  }, []);

  const filteredShows = shows.filter((show) => {
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesVenue = safeString(show.venue_name).toLowerCase().includes(searchLower);
      const matchesCity = show.city && show.city.toLowerCase().includes(searchLower);
      const matchesCountry = show.country && show.country.toLowerCase().includes(searchLower);
      if (!matchesVenue && !matchesCity && !matchesCountry) {
        return false;
      }
    }

    if (statusFilter && show.status !== statusFilter) {
      return false;
    }

    if (futureOnly && show.date) {
      const showDate = new Date(show.date);
      const today = new Date();
      if (showDate <= today) {
        return false;
      }
    }

    return true;
  });

  const visibleShows = sortList(filteredShows, sortState, SHOW_ACCESSORS);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      {/* Page header */}
      <header className="mb-6 text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Shows &amp; Events</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          {filteredShows.length} {filteredShows.length === 1 ? 'show programado' : 'shows programados'}
        </p>
      </header>

      {/* Filters section */}
      <div className="mb-6 rounded-xl border border-border px-4 py-3 bg-card/50 backdrop-blur-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Search input */}
          <div>
            <label htmlFor="shows-search" className={LABEL_CLASS}>
              Buscar por venue o ciudad
            </label>
            <input
              id="shows-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={FIELD_CLASS}
              placeholder="Venue o ciudad"
            />
          </div>

          {/* Status filter */}
          <div>
            <label htmlFor="shows-status" className={LABEL_CLASS}>
              Estado
            </label>
            <select
              id="shows-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ShowStatus)}
              className={`${FIELD_CLASS} dark:[color-scheme:dark]`}
            >
              <option value="" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                Todos
              </option>
              {SHOW_STATUS_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                >
                  {showStatusLabel(option.value)}
                </option>
              ))}
            </select>
          </div>

          {/* Future only toggle */}
          <div className="flex items-end pb-1">
            <label
              htmlFor="shows-future-only"
              className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <input
                id="shows-future-only"
                type="checkbox"
                checked={futureOnly}
                onChange={(e) => setFutureOnly(e.target.checked)}
                className={`h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-primary-600 ${FOCUS_RING}`}
              />
              Solo futuros
            </label>
          </div>

          <SortSelect value={sortState} onChange={setSortState} />
        </div>
      </div>

      {/* Shows grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => <SkeletonCard key={index} />)
        ) : visibleShows.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-border bg-card py-10 text-center">
            <p className="mb-2 text-3xl">🎤</p>
            <p className="text-lg text-slate-600 dark:text-slate-400">No hay shows programados</p>
          </div>
        ) : (
          visibleShows.map((show) => <ShowCard show={show} key={show.id} />)
        )}
      </div>

      <p className="mt-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
        {PAYMENT_DISCLAIMER}
      </p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 animate-pulse">
      <div className="h-24 w-full rounded-lg mb-3 bg-slate-200 dark:bg-slate-700" />
      <div className="flex items-center gap-2 mb-1">
        <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

function ShowCard({ show }: { show: Show }) {
  const [descOpen, setDescOpen] = useState(false);

  const venue = safeString(show.venue_name) || 'Venue por confirmar';
  const description = safeString(show.description);
  const location = [safeString(show.city), safeString(show.country)].filter(Boolean).join(', ');
  const ticketHref = safeString(show.ticket_url) || safeString(show.ticket_link);
  const hasLongDescription = description.length > 100;

  return (
    <article className="rounded-2xl border border-border bg-card p-4 hover:bg-card-hover transition-colors flex flex-col">
      {show.flyer_url && (
        <Image
          src={show.flyer_url}
          alt={`Flyer de ${venue}`}
          width={768}
          height={192}
          unoptimized
          className="h-48 w-full rounded-xl object-cover mb-4"
        />
      )}

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${showStatusClass(show.status)}`}>
          {showStatusLabel(show.status)}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          📅 {formatDateSpanish(show.date)}
          {show.time ? ` • ${show.time}` : ''}
        </span>
      </div>

      <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate" title={venue}>
        {venue}
      </h3>

      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 mb-3">
        {location ? `📍 ${location}` : '📍 Ubicación por confirmar'}
      </p>

      {description && (
        <div className="mb-3">
          <p
            className={`text-sm leading-relaxed text-slate-600 dark:text-slate-400 ${hasLongDescription && !descOpen ? 'line-clamp-2' : ''}`}
          >
            {description}
          </p>
          {hasLongDescription && (
            <button
              type="button"
              onClick={() => setDescOpen((open) => !open)}
              aria-expanded={descOpen}
              className={`mt-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline ${FOCUS_RING}`}
            >
              {descOpen ? 'Mostrar menos' : 'Mostrar más'}
            </button>
          )}
        </div>
      )}

      {show.price_range && (
        <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-2">
          💰 {safeString(show.price_range)}
        </p>
      )}

      {ticketHref && (
        <div className="mt-auto pt-2">
          <a
            href={ticketHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 ${FOCUS_RING}`}
          >
            🎟️ Ver tickets
          </a>
        </div>
      )}
    </article>
  );
}
