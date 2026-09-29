'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Show, ShowStatus, GuestArtist, PaymentMethod } from '@/types/music';
import { safeArray, safeString } from '@/lib/null-safe';
import { sortList } from '@/lib/search';
import {
  paymentMethodLabel,
  showStatusClass,
  showStatusLabel,
  SHOW_STATUS_OPTIONS,
} from '@/lib/show-status';
import { SortSelect, useListSort } from '@/components/SortSelect';
import { SlideIn } from '@/components/MotionWrappers';
import { Card } from '@/components/ui/Card';
import { Badge, CountBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ShowCover } from '@/components/shows/ShowCover';

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

/**
 * Entrada animada con el mismo `SlideIn` del dashboard, pero respetando
 * `prefers-reduced-motion`: con reduce se renderiza un `<div>` plano y no hay
 * animación que pueda marear (WCAG 2.3.3).
 *
 * El salto a "plano" se difiere al posmontaje: en el servidor y en la primera
 * renderización del cliente `useReducedMotion()` todavía no sabe si el usuario
 * prefiere reduce, así que ambos lados piden `SlideIn` y no hay mismatch de
 * hidratación.
 */
function Reveal({ children, index = 0, className = '' }: { children: ReactNode; index?: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && reduceMotion) return <div className={className}>{children}</div>;
  return (
    <SlideIn index={index} className={className}>
      {children}
    </SlideIn>
  );
}

interface StatItem {
  label: string;
  value: number;
  dot: string;
}

export default function ShowsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [artistNames, setArtistNames] = useState<Record<string, string>>({});
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
    fetch('/api/shows')
      .then(async (res) => {
        const data = await res.json();
        setShows(data.shows || []);
      })
      .catch(() => setShows([]))
      .finally(() => setLoading(false));
  }, []);

  // Nombre del artista para las portadas generadas (los shows solo traen
  // artist_id). Falla en silencio: si no llega, la portada usa el venue.
  useEffect(() => {
    fetch('/api/artists')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { artists?: Array<{ id?: string; name?: string }> } | null) => {
        const map: Record<string, string> = {};
        for (const artist of data?.artists ?? []) {
          if (artist.id && artist.name) map[artist.id] = artist.name;
        }
        setArtistNames(map);
      })
      .catch(() => undefined);
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

  const hasActiveFilters = search !== '' || statusFilter !== '' || futureOnly;
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setFutureOnly(false);
  };

  // Chips de resumen del encabezado: variedad de color con los mismos tonos
  // usados en las stat cards del dashboard (amber/emerald/blue).
  const stats: StatItem[] = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = shows.filter((show) => show.date && new Date(`${show.date}T00:00:00`) >= today).length;
    const cities = new Set(shows.map((show) => safeString(show.city, '')).filter(Boolean)).size;
    const withTickets = shows.filter(
      (show) => safeString(show.ticket_url, '') || safeString(show.ticket_link, '')
    ).length;
    return [
      { label: 'Shows', value: shows.length, dot: 'bg-white' },
      { label: 'Próximos', value: upcoming, dot: 'bg-amber-400' },
      { label: 'Ciudades', value: cities, dot: 'bg-emerald-400' },
      { label: 'Con tickets', value: withTickets, dot: 'bg-sky-400' },
    ];
  }, [shows]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Encabezado con gradiente de marca (mismo de components/ArtistHero.tsx) */}
      <header className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-500">
        <div aria-hidden className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10" />
        {/* Veladura: el texto blanco debe superar 4.5:1 sobre el tramo rosa */}
        <div aria-hidden className="absolute inset-0 bg-black/30" />

        <div className="relative mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
          <Reveal index={0}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                  🎤 Calendario público
                </span>
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white md:text-5xl">
                  Shows &amp; Events
                </h1>
                <p className="mt-3 text-base leading-relaxed text-white md:text-lg">
                  {loading
                    ? 'Cargando shows…'
                    : `${visibleShows.length} ${visibleShows.length === 1 ? 'show programado' : 'shows programados'}`}
                  . Descubre fechas, venues y entradas de los artistas de PressPlay.
                </p>
              </div>

              {!loading && (
                <dl className="flex flex-wrap gap-3">
                  {stats.map((stat) => (
                    // axe: <dt> debe ser hijo directo del <dl> o del <div> que
                    // cuelga de él, así que el punto de color va dentro del <dt>.
                    <div
                      key={stat.label}
                      className="min-w-[7rem] rounded-xl border border-white/30 bg-white/15 px-4 py-3 backdrop-blur-sm"
                    >
                      <dt className="flex items-center gap-2 text-xs font-medium text-white">
                        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${stat.dot}`} />
                        {stat.label}
                      </dt>
                      <dd className="mt-1 text-2xl font-bold text-white">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </Reveal>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        {/* Filters section */}
        <Card className="mb-6 p-4 md:p-5">
          <SectionHeader
            emoji="🎛️"
            title="Filtros"
            subtitle="Busca por venue, ciudad o país y filtra por estado"
            badges={<CountBadge>{visibleShows.length}</CountBadge>}
          />
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
        </Card>

        {/* Shows grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : visibleShows.length === 0 ? (
          <Card>
            <EmptyState
              emoji="🎤"
              message={
                hasActiveFilters
                  ? 'No hay shows que coincidan con esos filtros'
                  : 'No hay shows programados por el momento'
              }
              cta={
                hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 ${FOCUS_RING}`}
                  >
                    Limpiar filtros
                  </button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleShows.map((show, index) => (
              <Reveal key={show.id} index={index} className="h-full">
                <ShowCard show={show} artistName={artistNames[show.artist_id]} />
              </Reveal>
            ))}
          </div>
        )}

        <p className="mt-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
          {PAYMENT_DISCLAIMER}
        </p>
      </main>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="h-44 w-full bg-gradient-to-br from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 sm:h-48" />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-5 w-32 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

function ShowCard({ show, artistName }: { show: Show; artistName?: string }) {
  const [descOpen, setDescOpen] = useState(false);

  const venue = safeString(show.venue_name) || 'Venue por confirmar';
  // `safeString` usa "—" como fallback por defecto, y ese em dash es *truthy*:
  // con `||` nunca se llegaria al fallback y `ticket_url` null se
  // renderizaba como <a href="—">, que el navegador resuelve como ruta
  // relativa y daba 404. Por eso aqui el fallback explicito es "".
  const description = safeString(show.description, "");
  const location = [safeString(show.city, ""), safeString(show.country, "")].filter(Boolean).join(', ');
  const ticketHref = safeString(show.ticket_url, "") || safeString(show.ticket_link, "");
  const hasLongDescription = description.length > 100;
  const guests = safeArray<GuestArtist>(show.guest_artists);
  const paymentLabels = safeArray<PaymentMethod>(show.payment_methods).map((method) =>
    paymentMethodLabel(method.type)
  );
  const guestNames = guests.map((guest) => safeString(guest.name, '')).filter(Boolean).join(', ');

  return (
    <Card className="h-full overflow-hidden transition hover:border-primary-500/40 hover:shadow-md dark:hover:border-primary-500/40">
      <article className="flex h-full flex-col">
        <ShowCover show={show} artistName={artistName} />

        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${showStatusClass(show.status)}`}
            >
              {showStatusLabel(show.status)}
            </span>
            <Badge variant="indigo">
              📅 {formatDateSpanish(show.date)}
              {show.time ? ` · ${show.time}` : ''}
            </Badge>
          </div>

          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100" title={venue}>
            {venue}
          </h3>

          <p className="text-sm text-slate-600 dark:text-slate-400">
            📍 {location || 'Ubicación por confirmar'}
          </p>

          {description && (
            <div>
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

          {guestNames && (
            <p className="text-xs font-medium leading-relaxed text-violet-700 dark:text-violet-300">
              🎤 Telonero{guests.length > 1 ? 's' : ''}: {guestNames}
            </p>
          )}

          {show.price_range && (
            <div>
              <Badge variant="amber">💰 {safeString(show.price_range)}</Badge>
            </div>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-1">
            {ticketHref ? (
              <a
                href={ticketHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-primary-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-primary-700 hover:to-violet-700 ${FOCUS_RING}`}
              >
                🎟️ Ver tickets
              </a>
            ) : paymentLabels.length > 0 ? (
              // Sin ticket no hay botón (evita el href relativo → 404): se
              // informa cómo se paga en el venue, con el color de "OK/activo".
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium leading-relaxed text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                💳 Pago en el venue: {paymentLabels.join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
      </article>
    </Card>
  );
}
