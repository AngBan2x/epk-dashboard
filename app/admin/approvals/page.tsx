'use client';

import React, { useState, useEffect, useRef, useCallback, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { capitalizeReleaseType, getCoverImage, sumDurations } from '@/lib/null-safe';
import { Badge, CountBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';

interface Submission {
  id: string;
  user_id: string;
  track_data: string;
  status: 'pending' | 'approved' | 'rejected' | 'revision';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  submission_type?: string;
  admin_id?: string | null;
  reviewed_at?: string | null;
  revision?: number;
  status_label?: string;
  artist_has_owner?: boolean;
}

interface Stats {
  pending: number;
  approved: number;
  rejected: number;
  revision: number;
  total: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected' | 'revision';
type StatKey = 'pending' | 'approved' | 'rejected' | 'revision' | 'total';
type BadgeVariant = 'slate' | 'emerald' | 'indigo' | 'amber' | 'rose' | 'violet';

const PAGE_LIMIT = 20;
/** El backend valida el motivo con el mismo mínimo: aquí solo se anticipa al usuario. */
const MIN_REASON_LENGTH = 10;

/**
 * Un único indicador de foco en toda la página, y el del sistema.
 *
 * `app/globals.css:59-62` desactiva el outline global **solo** para los
 * elementos cuyo class contiene `focus-visible:ring`. Con `focus:ring-*` ese
 * selector no aplica, así que cada uno de esos 16 controles pintaba su anillo de
 * color (verde/rojo/azul) **y además** el `:focus-visible` global, que es rosa
 * `--ring`: dos indicadores, con un contorno rosa alrededor de un botón verde.
 * `focus-visible:` resuelve las dos cosas a la vez.
 */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800';

const LABEL_CLASS = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

const FIELD_CLASS = `w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 ${FOCUS_RING}`;

/** Superficie de la consola: la misma de `app/admin/page.tsx` y `BroadcastPanel`. */
const SURFACE_CLASS = 'rounded-2xl border border-slate-200 dark:border-slate-800';

const STATUS_LABELS: Record<StatKey, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  revision: 'Revisión',
  total: 'Total',
};

/**
 * El color del estado vive en la primitiva `Badge`, no en el marcado: así los
 * pills heredan el borde y el tamaño de todo el sistema en vez de defining su
 * propia variante sin borde (que era lo que pasaba antes).
 */
const STATUS_TONE: Record<FilterKey, BadgeVariant> = {
  all: 'slate',
  pending: 'amber',
  approved: 'emerald',
  rejected: 'rose',
  revision: 'indigo',
};

const STAT_KEYS: readonly StatKey[] = ['pending', 'approved', 'rejected', 'revision', 'total'];

export default function ApprovalsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Submission | null>(null);
  const [revisionReason, setRevisionReason] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<Submission | null>(null);
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);
  /**
   * RC.32 Tarea 5 — el envío cuya promoción falló y se puede reintentar.
   *
   * Antes el `try/catch` de la promoción se comía el error y la respuesta 200
   * solo decía `promoted: false`, que también es lo que sale cuando el usuario
   * YA era artista. El admin veía un éxito y el usuario no se promovía. Ahora el
   * backend manda `promotion: { error, retryable }` y aquí se muestra, con el
   * envío al que pertenece y un botón para reintentarlo.
   */
  const [promotionFailure, setPromotionFailure] = useState<{
    id: string;
    message: string;
    retryable: boolean;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [artistlessCount, setArtistlessCount] = useState(0);
  const modalTitleRef = useRef<HTMLHeadingElement>(null);
  const rejectModalTitleRef = useRef<HTMLHeadingElement>(null);
  const revisionModalTitleRef = useRef<HTMLHeadingElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const fetchApprovals = useCallback(async (pageNumber = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (search) params.set('search', search);
      params.set('page', String(pageNumber));
      params.set('limit', String(PAGE_LIMIT));
      const res = await fetch(`/api/admin/approvals?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions);
        setStats(data.stats);
        setPagination(data.pagination);
        setArtistlessCount(typeof data.artistless_count === 'number' ? data.artistless_count : 0);
        setPage(pageNumber);
      }
    } catch (error) {
      console.error('Failed to fetch approvals:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchApprovals(1);
  }, [fetchApprovals]);

  // Escape cierra el modal que esté abierto, de la más específica a la más general.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showRejectModal) {
          closeRejectModal();
        } else if (showRevisionModal) {
          closeRevisionModal();
        } else if (selected) {
          setSelected(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showRejectModal, showRevisionModal, selected]);

  // Foco: se recuerda el control que abrió el modal, se mueve el foco al título y
  // al cerrar se devuelve. Sin esto el foco se pierde detrás del overlay.
  useEffect(() => {
    if (selected) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      setTimeout(() => modalTitleRef.current?.focus(), 100);
    } else if (lastFocusedElement.current) {
      lastFocusedElement.current.focus();
      lastFocusedElement.current = null;
    }
  }, [selected]);

  useEffect(() => {
    if (showRejectModal) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      setTimeout(() => rejectModalTitleRef.current?.focus(), 100);
    }
  }, [showRejectModal]);

  useEffect(() => {
    if (showRevisionModal) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      setTimeout(() => revisionModalTitleRef.current?.focus(), 100);
    }
  }, [showRevisionModal]);

  type ActionKind = 'approve' | 'reject' | 'revision' | 'retry_promotion';

  const handleAction = async (id: string, action: ActionKind, reason?: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/admin/approvals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) {
        const result = await res.json();
        // Un reintento no abre ni cierra modales: solo informa.
        const isRetry = action === 'retry_promotion';
        if (!isRetry) {
          fetchApprovals();
          setSelected(null);
          setShowRejectModal(false);
          setShowRevisionModal(false);
          setRejectReason('');
          setRevisionReason('');
        }

        // `promotion` es el dato nuevo: si se intentó y no promovió, el motivo
        // viaja en la respuesta y se enseña. Antes esto no se distinguía de un
        // "ya era artista".
        const promotion = result.promotion as
          | { promoted?: boolean; attempted?: boolean; error?: string | null; retryable?: boolean }
          | undefined;

        if (action === 'approve' && promotion?.attempted && !promotion.promoted) {
          setPromotionFailure({
            id,
            message:
              promotion.error ||
              'El envío se aprobó, pero el autor no se promovió a artista.',
            retryable: promotion.retryable !== false,
          });
          setPromotionMessage(null);
        } else if (result.promoted) {
          setPromotionFailure(null);
          setPromotionMessage('¡El usuario ha sido promovido a Artista!');
          setTimeout(() => setPromotionMessage(null), 5000);
        } else if (isRetry) {
          setPromotionFailure(null);
          setPromotionMessage('La promoción se completó correctamente.');
          setTimeout(() => setPromotionMessage(null), 5000);
        } else {
          setPromotionFailure(null);
        }
      } else {
        const error = await res.json().catch(() => null);
        console.error('Action failed:', error);
        // El reintento sobre un envío que ya no está aprobado es un 409: se
        // informa sin tocar nada.
        if (action === 'retry_promotion') {
          setPromotionFailure({
            id,
            message: error?.error ?? 'No se pudo reintentar la promoción.',
            retryable: false,
          });
        }
      }
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const openRejectModal = (sub: Submission) => {
    setRejectTarget(sub);
    setShowRejectModal(true);
    setRejectReason('');
  };

  const closeRejectModal = () => {
    setShowRejectModal(false);
    setRejectTarget(null);
    setRejectReason('');
  };

  const openRevisionModal = (sub: Submission) => {
    setRevisionTarget(sub);
    setShowRevisionModal(true);
    setRevisionReason('');
  };

  const closeRevisionModal = () => {
    setShowRevisionModal(false);
    setRevisionTarget(null);
    setRevisionReason('');
  };

  const handleRejectConfirm = () => {
    if (rejectTarget && rejectReason.trim().length >= MIN_REASON_LENGTH) {
      handleAction(rejectTarget.id, 'reject', rejectReason);
      closeRejectModal();
    }
  };

  const handleRevisionConfirm = () => {
    if (revisionTarget && revisionReason.trim().length >= MIN_REASON_LENGTH) {
      handleAction(revisionTarget.id, 'revision', revisionReason);
      closeRevisionModal();
    }
  };

  const parseTrackData = (trackData: string) => {
    try {
      return JSON.parse(trackData);
    } catch {
      return {};
    }
  };

  /**
   * RC.32 Tarea 4 — la duración que ve el admin al revisar un envío.
   *
   * `track_data.duration` es lo que el remitente escribió para el envío, y en un
   * álbum eso es `""` o el total viejo: el admin acababa comparando un `00:00`
   * contra lo que el resto de la app ya enseña como la suma de las pistas. Se
   * calcula con `sumDurations` (contrato de `lib/null-safe.ts`), el mismo helper
   * que usan `EPKCard` y `/releases/[id]`.
   *
   * Si el envío no trae `tracks`, o sus duraciones no son parseables, se cae al
   * valor declarado en vez de inventar un `0:00`.
   */
  const submissionDuration = (data: { duration?: unknown; tracks?: unknown }): string => {
    const children = Array.isArray(data.tracks) ? data.tracks : [];
    if (children.length > 0) {
      const durations = children
        .filter((t): t is { duration?: unknown } => typeof t === 'object' && t !== null)
        .map((t) => (typeof t.duration === 'string' ? t.duration : null));
      const total = sumDurations(durations);
      if (total) return total.label;
    }
    return typeof data.duration === 'string' && data.duration.length > 0 ? data.duration : '—';
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('es-VE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Ruta de vuelta: mismo lenguaje visual que la barra de pestañas de /admin,
          que antes no tenía equivalente y dejaba la página sin salida. */}
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

      {/* Encabezado con el degradado de marca de /shows y ArtistHero: el texto
          blanco necesita la veladura `bg-black/30` para pasar 4.5:1 sobre el rosa. */}
      <header className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-500">
        <div aria-hidden className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10" />
        <div aria-hidden className="absolute inset-0 bg-black/30" />
        <div className="relative mx-auto max-w-6xl px-4 py-8 md:py-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Aprobaciones
          </h1>
          <p className="mt-2 text-sm text-white md:text-base">
            Revisa y aprueba envíos de artistas
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {promotionMessage && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-emerald-300 bg-emerald-100 p-4 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 animate-slide-in"
          >
            ? {promotionMessage}
          </div>
        )}

        {/*
          RC.32 Tarea 5 — el fallo de promoción, a la vista. `role="alert"` para
          que un lector de pantalla lo anuncie sin tener que buscarlo: el
          `console.error` del backend no le llega a nadie.
        */}
        {promotionFailure && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-amber-300 bg-amber-100 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 animate-slide-in"
          >
            <p className="font-medium">
              El envío se aprobó, pero el autor no se promovió a artista.
            </p>
            <p className="mt-1 text-xs opacity-90">{promotionFailure.message}</p>
            <p className="mt-1 text-xs opacity-90">
              La aprobación es válida y el contenido ya está publicado. Solo falta
              el cambio de rol.
            </p>
            {promotionFailure.retryable && (
              <button
                type="button"
                onClick={() => handleAction(promotionFailure.id, 'retry_promotion')}
                disabled={actionLoading === promotionFailure.id}
                className={`mt-3 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-50 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800 ${FOCUS_RING}`}
              >
                {actionLoading === promotionFailure.id
                  ? 'Reintentando...'
                  : 'Reintentar promoción'}
              </button>
            )}
          </div>
        )}


        {/* Stats — son a la vez cifras y filtros, así que van en `aria-pressed`. */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
            {STAT_KEYS.map((key) => {
              const active = key === 'total' ? filter === 'all' : filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(key === 'total' ? 'all' : key)}
                  className={`p-4 text-left transition-colors ${FOCUS_RING} ${
                    // Cada rama declara el color de borde completo: dos utilitarios
                    // de `border-color` en la misma etiqueta los desempata el orden
                    // del stylesheet, no el orden de las clases.
                    active
                      ? 'rounded-2xl border border-primary-500 bg-primary-50 dark:bg-primary-950/40 dark:border-primary-500'
                      : 'rounded-2xl border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <span className="block text-2xl font-bold text-slate-900 dark:text-white">
                    {stats[key]}
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">
                    {STATUS_LABELS[key]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {artistlessCount > 0 && (
          <div
            role="status"
            className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <strong className="font-semibold">
              {artistlessCount} {artistlessCount === 1 ? 'envío pertenece' : 'envíos pertenecen'} a artistas
              sin cuenta vinculada
            </strong>
            <p className="mt-1 text-xs">
              Al aprobar o rechazar, esos artistas no recibirán notificación porque su
              <code className="mx-1">artists.user_id</code> está vacío. Puedes vincularlos con
              <code className="mx-1">npx tsx scripts/backfill-artist-owners.ts</code> o desde la ficha
              del artista.
            </p>
          </div>
        )}

        {/* Búsqueda */}
        <Card className={`${SURFACE_CLASS} mb-6 p-4 md:p-5`}>
          <div>
            <label htmlFor="approvals-search" className={LABEL_CLASS}>
              Buscar envíos
            </label>
            <input
              id="approvals-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título o artista..."
              aria-label="Buscar envíos"
              className={`${FIELD_CLASS} md:max-w-md`}
            />
          </div>
        </Card>

        {/* Cola de envíos */}
        <Card className={`${SURFACE_CLASS} overflow-hidden`}>
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <SectionHeader
              title="Envíos"
              subtitle="Aprobar, rechazar o pedir cambios antes de que salgan al catálogo"
              badges={<CountBadge>{submissions.length}</CountBadge>}
            />
          </div>

          {loading ? (
            <>
              <p className="sr-only" role="status">
                Cargando envíos
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-700" aria-hidden>
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-4 p-4">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/5" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <Skeleton className="h-10 w-28" />
                  </div>
                ))}
              </div>
            </>
          ) : submissions.length === 0 ? (
            <EmptyState
              emoji="📭"
              message={`No hay envíos ${
                filter !== 'all' ? `con estado "${STATUS_LABELS[filter]}"` : ''
              }${search ? ` para "${search}"` : ''}`}
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {submissions.map((sub) => {
                const data = parseTrackData(sub.track_data);
                const revision = sub.revision || 0;
                const busy = actionLoading === sub.id;
                return (
                  <div
                    key={sub.id}
                    className="p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold text-slate-900 dark:text-white">
                            {data.title || 'Sin título'}
                          </h3>
                          <Badge variant={STATUS_TONE[sub.status] ?? 'slate'}>
                            {sub.status_label || STATUS_LABELS[sub.status] || sub.status}
                          </Badge>
                          {revision > 0 && <Badge variant="violet">Revisión #{revision}</Badge>}
                          {sub.artist_has_owner === false && (
                            <span title="Este artista no tiene cuenta vinculada: no recibirá la notificación de la decisión.">
                              <Badge variant="amber">Sin cuenta vinculada</Badge>
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {data.artist_name || 'Artista desconocido'} · {formatDate(sub.created_at)}
                        </p>
                        {sub.admin_notes && (
                          <p className="mt-1 text-sm italic text-slate-500 dark:text-slate-400">
                            Nota: {sub.admin_notes}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelected(sub)}
                        >
                          Ver
                        </Button>
                        {sub.status === 'pending' && (
                          <DecisionActions
                            disabled={busy}
                            onApprove={() => handleAction(sub.id, 'approve')}
                            onReject={() => openRejectModal(sub)}
                            onRevision={() => openRevisionModal(sub)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Página {page} de {pagination.totalPages} · {pagination.total} total
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchApprovals(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loading}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchApprovals(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || loading}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>

      {/* Detalle */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2
                id="modal-title"
                ref={modalTitleRef}
                tabIndex={-1}
                className="text-xl font-bold text-slate-900 dark:text-white"
              >
                {parseTrackData(selected.track_data).title || 'Sin título'}
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Cerrar"
                className={`rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300 ${FOCUS_RING}`}
              >
                <span aria-hidden>✕</span>
              </button>
            </div>

            {(() => {
              const data = parseTrackData(selected.track_data);
              const revision = selected.revision || 0;
              const cover = getCoverImage(data);
              return (
                <>
                  <dl className="space-y-3 text-sm">
                    <DetailRow term="Artista">{data.artist_name}</DetailRow>
                    <DetailRow term="Tipo">{capitalizeReleaseType(data.release_type)}</DetailRow>
                    <DetailRow term="Fecha">{data.release_date}</DetailRow>
                    <DetailRow term="Duración">{submissionDuration(data)}</DetailRow>
                    {revision > 0 && <DetailRow term="Revisión">#{revision}</DetailRow>}
                    {cover && (
                      <DetailRow term="Portada">
                        <Image
                          src={cover}
                          alt={`Portada de ${data.title || 'sin título'}`}
                          width={600}
                          height={160}
                          unoptimized
                          className="mt-2 h-40 w-full rounded-lg object-cover"
                        />
                      </DetailRow>
                    )}
                    {data.lyrics && (
                      <DetailRow term="Letra">
                        <span className="mt-1 block max-h-32 overflow-y-auto whitespace-pre-line text-slate-700 dark:text-slate-300">
                          {data.lyrics}
                        </span>
                      </DetailRow>
                    )}
                  </dl>
                  {selected.status === 'pending' && (
                    <DecisionActions
                      grow
                      disabled={actionLoading === selected.id}
                      onApprove={() => handleAction(selected.id, 'approve')}
                      onReject={() => {
                        openRejectModal(selected);
                        setSelected(null);
                      }}
                      onRevision={() => {
                        openRevisionModal(selected);
                        setSelected(null);
                      }}
                    />
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Rechazo y revisión comparten estructura: un motivo con mínimo y un
          contador. Un solo componente para los dos, con ids propios de cada uno. */}
      {showRejectModal && rejectTarget && (
        <ReasonModal
          titleId="reject-modal-title"
          titleRef={rejectModalTitleRef}
          title="Rechazar envío"
          fieldId="reject-reason"
          counterId="reject-char-count"
          label={`Razón del rechazo (mín. ${MIN_REASON_LENGTH} caracteres)`}
          placeholder="Explica por qué se rechaza este envío..."
          confirmLabel="Confirmar rechazo"
          tone="danger"
          value={rejectReason}
          onChange={setRejectReason}
          onClose={closeRejectModal}
          onConfirm={handleRejectConfirm}
          disabled={actionLoading === rejectTarget.id}
        />
      )}

      {showRevisionModal && revisionTarget && (
        <ReasonModal
          titleId="revision-modal-title"
          titleRef={revisionModalTitleRef}
          title="Solicitar revisión"
          fieldId="revision-reason"
          counterId="revision-char-count"
          label={`Comentarios para el artista (mín. ${MIN_REASON_LENGTH} caracteres)`}
          placeholder="Indica qué necesita cambiar el artista..."
          confirmLabel="Solicitar revisión"
          tone="info"
          value={revisionReason}
          onChange={setRevisionReason}
          onClose={closeRevisionModal}
          onConfirm={handleRevisionConfirm}
          disabled={actionLoading === revisionTarget.id}
        />
      )}
    </div>
  );
}

function DetailRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1">
      <dt className="text-slate-500 dark:text-slate-400">{term}</dt>
      <dd className="min-w-0 text-slate-900 dark:text-white">{children}</dd>
    </div>
  );
}

/**
 * Las tres decisiones, en la fila de la lista y en el modal de detalle.
 *
 * En la lista van como botones de texto teñidos, igual que las acciones de
 * `/admin` (`app/admin/page.tsx:942-972`): cuatro acciones sólidas en una fila
 * gritan más que la fila entera. En el modal sí van sólidas, porque ahí son la
 * única acción posible. Los tres comparten el mismo anillo `focus-visible:`.
 */
function DecisionActions({
  disabled,
  onApprove,
  onReject,
  onRevision,
  grow = false,
}: {
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRevision: () => void;
  grow?: boolean;
}) {
  const base = grow
    ? 'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50'
    : 'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50';
  const tone = grow
    ? {
        approve: 'bg-emerald-600 hover:bg-emerald-700',
        reject: 'bg-rose-600 hover:bg-rose-700',
        revision: 'bg-blue-600 hover:bg-blue-700',
      }
    : {
        approve:
          'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950',
        reject: 'text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950',
        revision: 'text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950',
      };

  return (
    <div className={grow ? 'mt-6 flex gap-2' : 'flex items-center gap-2'}>
      <button
        type="button"
        onClick={onApprove}
        disabled={disabled}
        className={`${base} ${tone.approve} ${FOCUS_RING}`}
      >
        Aprobar
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className={`${base} ${tone.reject} ${FOCUS_RING}`}
      >
        Rechazar
      </button>
      <button
        type="button"
        onClick={onRevision}
        disabled={disabled}
        className={`${base} ${tone.revision} ${FOCUS_RING}`}
      >
        Revisión
      </button>
    </div>
  );
}

function ReasonModal({
  titleId,
  titleRef,
  title,
  fieldId,
  counterId,
  label,
  placeholder,
  confirmLabel,
  tone,
  value,
  onChange,
  onClose,
  onConfirm,
  disabled,
}: {
  titleId: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  title: string;
  fieldId: string;
  counterId: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  tone: 'danger' | 'info';
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const tooShort = value.trim().length < MIN_REASON_LENGTH;
  const confirmTone =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700'
      : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="mb-4 text-xl font-bold text-slate-900 dark:text-white"
        >
          {title}
        </h2>
        <div className="mb-4">
          <label htmlFor={fieldId} className={LABEL_CLASS}>
            {label}
          </label>
          <textarea
            id={fieldId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-describedby={counterId}
            className={`${FIELD_CLASS} min-h-[100px] leading-relaxed`}
          />
          <div
            id={counterId}
            aria-live="polite"
            className="mt-1 flex justify-end text-xs text-slate-500 dark:text-slate-400"
          >
            <span
              className={
                tooShort
                  ? 'font-semibold text-rose-600 dark:text-rose-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }
            >
              {value.trim().length}/{MIN_REASON_LENGTH} caracteres mínimos
            </span>
          </div>
        </div>
        <div className="flex gap-2" role="alert" aria-live="polite">
          <button
            type="button"
            onClick={onConfirm}
            disabled={tooShort || disabled}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${confirmTone} ${FOCUS_RING}`}
          >
            {confirmLabel}
          </button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
