'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import type { Suggestion, SuggestionStatus } from '@/types/music';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * P4 · Buzón de sugerencias — consola de admin.
 *
 * ══ CÓMO SE PROTEGE, y por qué el `useEffect` de aquí NO es la protección ══
 *
 * Hay tres capas, y solo una decide:
 *
 *   1. `middleware.ts:93-101` — todo `/admin/:path*` exige sesión Y rol `admin`,
 *      y si no, redirige. Es la primera puerta y ya está hecha: esta ruta cuelga
 *      de `/admin/*`, así que no ha hecho falta tocar el middleware.
 *   2. **El servidor, en la API.** `GET /api/suggestions` responde 401 sin
 *      sesión y 403 con una sesión que no sea admin. ESTA es la autorización:
 *      sobrevive a un `curl`, a un JS desactivado y a un middleware mal
 *      configurado. Por eso el `role !== "admin"` del cliente de esta página no
 *      se apoya en nada: la pantalla puede pintar lo que quiera, los datos no
 *      salen sin rol.
 *   3. Este `useEffect` — el mismo patrón que `app/admin/page.tsx:191-195` y
 *      `app/admin/approvals/page.tsx:138-141`. Es UX: evita el fogonazo de una
 *      pantalla vacía a la que alguien sin permiso va a parar. Si no existiera,
 *      no habría ninguna fuga de datos; solo un mueble inútil.
 */

type FilterKey = SuggestionStatus | 'all';
type BadgeVariant = 'slate' | 'emerald' | 'indigo' | 'amber' | 'rose' | 'violet';

const PAGE_LIMIT = 20;

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800';

const LABEL_CLASS = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

const FIELD_CLASS = `w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 ${FOCUS_RING}`;

const STATUS_LABELS: Record<FilterKey, string> = {
  all: 'Total',
  new: 'Nuevas',
  read: 'Leídas',
  resolved: 'Resueltas',
  spam: 'Spam',
};

/** El estado vive en la primitiva `Badge`, no en el marcado (como en /admin/approvals). */
const STATUS_TONE: Record<FilterKey, BadgeVariant> = {
  all: 'slate',
  new: 'amber',
  read: 'indigo',
  resolved: 'emerald',
  spam: 'rose',
};

const STAT_KEYS: readonly FilterKey[] = ['new', 'read', 'resolved', 'spam', 'all'];

interface Stats {
  new: number;
  read: number;
  resolved: number;
  spam: number;
  total: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminSuggestionsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const fetchSuggestions = useCallback(
    async (pageNumber = 1) => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (filter !== 'all') params.set('status', filter);
        params.set('page', String(pageNumber));
        params.set('limit', String(PAGE_LIMIT));

        const res = await fetch(`/api/suggestions?${params.toString()}`);
        if (res.status === 401 || res.status === 403) {
          // La API es la que manda. Si aquí hay un 403, la sesión no vale y no
          // tiene sentido seguir pidiendo datos: se vuelve al dashboard.
          setError('Tu sesión no tiene acceso al buzón.');
          router.push('/dashboard');
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions);
          setStats(data.stats);
          setPagination(data.pagination);
          setPage(pageNumber);
          setNotes((previous) => {
            const next = { ...previous };
            for (const suggestion of data.suggestions as Suggestion[]) {
              if (next[suggestion.id] === undefined) {
                next[suggestion.id] = suggestion.admin_notes ?? '';
              }
            }
            return next;
          });
        }
      } catch (fetchError) {
        console.error('Failed to fetch suggestions:', fetchError);
        setError('No hemos podido cargar el buzón.');
      } finally {
        setLoading(false);
      }
    },
    [filter, router]
  );

  useEffect(() => {
    fetchSuggestions(1);
  }, [fetchSuggestions]);

  const changeStatus = useCallback(
    async (id: string, status: SuggestionStatus) => {
      setActionLoading(id);
      setError(null);
      try {
        const res = await fetch(`/api/suggestions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (res.ok) {
          await fetchSuggestions(page);
        } else {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? 'No se pudo cambiar el estado.');
        }
      } catch (patchError) {
        console.error('Failed to change status:', patchError);
        setError('No se pudo cambiar el estado.');
      } finally {
        setActionLoading(null);
      }
    },
    [fetchSuggestions, page]
  );

  const saveNotes = useCallback(
    async (id: string) => {
      setActionLoading(id);
      setError(null);
      try {
        const res = await fetch(`/api/suggestions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_notes: notes[id] ?? '' }),
        });
        if (res.ok) {
          await fetchSuggestions(page);
        } else {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? 'No se pudieron guardar las notas.');
        }
      } catch (notesError) {
        console.error('Failed to save notes:', notesError);
        setError('No se pudieron guardar las notas.');
      } finally {
        setActionLoading(null);
      }
    },
    [fetchSuggestions, notes, page]
  );

  const remove = useCallback(
    async (id: string) => {
      setActionLoading(id);
      setError(null);
      try {
        const res = await fetch(`/api/suggestions/${id}`, { method: 'DELETE' });
        if (res.ok) {
          await fetchSuggestions(page);
        } else {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? 'No se pudo borrar la sugerencia.');
        }
      } catch (deleteError) {
        console.error('Failed to delete suggestion:', deleteError);
        setError('No se pudo borrar la sugerencia.');
      } finally {
        setActionLoading(null);
      }
    },
    [fetchSuggestions, page]
  );

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <nav
        aria-label="Ruta del panel de administración"
        className="border-b border-slate-200 bg-white dark:border-slate-800"
      >
        <div className="mx-auto max-w-6xl px-4">
          <Link
            href="/admin"
            className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white ${FOCUS_RING}`}
          >
            <span aria-hidden>←</span> Panel de Administración
          </Link>
        </div>
      </nav>

      <header className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-500">
        <div aria-hidden className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10" />
        <div aria-hidden className="absolute inset-0 bg-black/30" />
        <div className="relative mx-auto max-w-6xl px-4 py-8 md:py-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Buzón de sugerencias
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white md:text-base">
            <span>Mensajes anónimos enviados desde /suggestions</span>
            {stats && stats.new > 0 && (
              <Badge variant="amber" className="bg-white/15 text-white border-white/40">
                {stats.new} {stats.new === 1 ? 'nueva' : 'nuevas'}
              </Badge>
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-rose-300 bg-rose-100 p-4 text-sm font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
          >
            {error}
          </div>
        )}

        {/* Contadores que son a la vez cifras y filtros: `aria-pressed` los marca. */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
            {STAT_KEYS.map((key) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(key)}
                  className={`p-4 text-left transition-colors ${FOCUS_RING} ${
                    active
                      ? 'rounded-2xl border border-primary-500 bg-primary-50 dark:bg-primary-950/40 dark:border-primary-500'
                      : 'rounded-2xl border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <span className="block text-2xl font-bold text-slate-900 dark:text-white">
                    {key === 'all' ? stats.total : stats[key]}
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">
                    {STATUS_LABELS[key]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="space-y-4" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-800"
              >
                <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              </div>
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800">
            <EmptyState
              emoji="📭"
              message={
                filter === 'all'
                  ? 'El buzón está vacío.'
                  : `No hay sugerencias en "${STATUS_LABELS[filter].toLowerCase()}".`
              }
            />
          </div>
        ) : (
          <ul className="space-y-4">
            {suggestions.map((suggestion) => {
              const busy = actionLoading === suggestion.id;
              return (
                <li
                  key={suggestion.id}
                  className={`rounded-2xl border bg-white p-5 dark:bg-slate-800 ${
                    suggestion.status === 'new'
                      ? 'border-amber-300 dark:border-amber-700'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      {/* El correo es PII: solo se enseña aquí, que es admin-only. */}
                      <a
                        href={`mailto:${suggestion.email}`}
                        className={`break-all text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300 ${FOCUS_RING}`}
                      >
                        {suggestion.email}
                      </a>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(suggestion.created_at)}
                        {suggestion.user_id ? ' · con sesión iniciada' : ' · anónimo'}
                      </p>
                    </div>
                    <Badge variant={STATUS_TONE[suggestion.status]}>{suggestion.status}</Badge>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">
                    {suggestion.message}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {suggestion.status !== 'read' && suggestion.status !== 'resolved' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => changeStatus(suggestion.id, 'read')}
                      >
                        Marcar como leída
                      </Button>
                    )}
                    {suggestion.status !== 'resolved' && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => changeStatus(suggestion.id, 'resolved')}
                      >
                        Resolver
                      </Button>
                    )}
                    {suggestion.status !== 'spam' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => changeStatus(suggestion.id, 'spam')}
                      >
                        Marcar como spam
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => remove(suggestion.id)}
                    >
                      Borrar
                    </Button>
                  </div>

                  <details className="mt-4">
                    <summary
                      className={`cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white ${FOCUS_RING}`}
                    >
                      Notas internas
                      {suggestion.admin_notes ? ' (guardadas)' : ''}
                    </summary>
                    <div className="mt-2">
                      <label htmlFor={`notes-${suggestion.id}`} className="sr-only">
                        Notas internas de la sugerencia
                      </label>
                      <textarea
                        id={`notes-${suggestion.id}`}
                        rows={3}
                        value={notes[suggestion.id] ?? ''}
                        onChange={(event) =>
                          setNotes((previous) => ({ ...previous, [suggestion.id]: event.target.value }))
                        }
                        placeholder="Solo para el equipo. No se le envía a quien escribió."
                        className={FIELD_CLASS}
                      />
                      <Button
                        size="sm"
                        className="mt-2"
                        disabled={busy}
                        onClick={() => saveNotes(suggestion.id)}
                      >
                        Guardar notas
                      </Button>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        {pagination && pagination.totalPages > 1 && (
          <nav
            aria-label="Paginación del buzón"
            className="mt-6 flex items-center justify-between"
          >
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1 || loading}
              onClick={() => fetchSuggestions(page - 1)}
            >
              <span aria-hidden>←</span> Anterior
            </Button>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Página {pagination.page} de {pagination.totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => fetchSuggestions(page + 1)}
            >
              Siguiente <span aria-hidden>→</span>
            </Button>
          </nav>
        )}
      </main>
    </div>
  );
}