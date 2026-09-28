'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { capitalizeReleaseType, getCoverImage } from '@/lib/null-safe';

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

export default function ApprovalsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'revision'>('pending');
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
  const [page, setPage] = useState(1);
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
      params.set('limit', '20');
      const res = await fetch(`/api/admin/approvals?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions);
        setStats(data.stats);
        setPagination(data.pagination);
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

  // Handle Escape key for modals
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

  // Focus management for detail modal
  useEffect(() => {
    if (selected) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      setTimeout(() => modalTitleRef.current?.focus(), 100);
    } else if (lastFocusedElement.current) {
      lastFocusedElement.current.focus();
      lastFocusedElement.current = null;
    }
  }, [selected]);

  // Focus management for reject modal
  useEffect(() => {
    if (showRejectModal) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      setTimeout(() => rejectModalTitleRef.current?.focus(), 100);
    }
  }, [showRejectModal]);

  // Focus management for revision modal
  useEffect(() => {
    if (showRevisionModal) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      setTimeout(() => revisionModalTitleRef.current?.focus(), 100);
    }
  }, [showRevisionModal]);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'revision', reason?: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/admin/approvals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) {
        const result = await res.json();
        fetchApprovals();
        setSelected(null);
        setShowRejectModal(false);
        setShowRevisionModal(false);
        setRejectReason('');
        setRevisionReason('');
        if (result.promoted) {
          setPromotionMessage('¡El usuario ha sido promovido a Artista!');
          setTimeout(() => setPromotionMessage(null), 5000);
        }
      } else {
        const error = await res.json();
        console.error('Action failed:', error);
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
    if (rejectTarget && rejectReason.trim().length >= 10) {
      handleAction(rejectTarget.id, 'reject', rejectReason);
      closeRejectModal();
    }
  };

  const handleRevisionConfirm = () => {
    if (revisionTarget && revisionReason.trim().length >= 10) {
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

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    revision: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    revision: 'Revisión',
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Aprobaciones</h1>
          <p className="text-slate-500 dark:text-slate-400">Revisa y aprueba envíos de artistas</p>
        </div>

        {/* Promotion toast */}
        {promotionMessage && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 animate-slide-in"
          >
            ✅ {promotionMessage}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {(['pending', 'approved', 'rejected', 'revision', 'total'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key === 'total' ? 'all' : key)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  filter === key || (key === 'total' && filter === 'all')
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats[key]}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {key === 'total' ? 'Total' : statusLabels[key]}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o artista..."
            className="w-full md:w-80 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            aria-label="Buscar envíos"
          />
        </div>

        {/* Submissions list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando...</div>
          ) : submissions.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No hay envíos {filter !== 'all' ? `con estado "${statusLabels[filter]}"` : ''}
              {search ? ` para "${search}"` : ''}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {submissions.map((sub) => {
                const data = parseTrackData(sub.track_data);
                const revision = sub.revision || 0;
                return (
                  <div key={sub.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                            {data.title || 'Sin título'}
                          </h3>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[sub.status] || ''}`}>
                            {sub.status_label || statusLabels[sub.status] || sub.status}
                          </span>
                          {revision > 0 && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                              Revisión #{revision}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {data.artist_name || 'Artista desconocido'} · {formatDate(sub.created_at)}
                        </p>
                        {sub.admin_notes && (
                          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 italic">
                            Nota: {sub.admin_notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setSelected(sub)}
                          className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        >
                          Ver
                        </button>
                        {sub.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleAction(sub.id, 'approve')}
                              disabled={actionLoading === sub.id}
                              className="px-3 py-1.5 text-sm text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => openRejectModal(sub)}
                              disabled={actionLoading === sub.id}
                              className="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                            >
                              Rechazar
                            </button>
                            <button
                              onClick={() => openRevisionModal(sub)}
                              disabled={actionLoading === sub.id}
                              className="px-3 py-1.5 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                            >
                              Revisión
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Página {page} de {pagination.totalPages} · {pagination.total} total
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchApprovals(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loading}
                  className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  Anterior
                </button>
                <button
                  onClick={() => fetchApprovals(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selected && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelected(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div
              className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 id="modal-title" ref={modalTitleRef} tabIndex={-1} className="text-xl font-bold text-slate-900 dark:text-white">
                  {parseTrackData(selected.track_data).title || 'Sin título'}
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus:ring-2 focus:ring-emerald-500"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
              {(() => {
                const data = parseTrackData(selected.track_data);
                const revision = selected.revision || 0;
                return (
                  <>
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Artista:</span>{' '}
                        <span className="text-slate-900 dark:text-white">{data.artist_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Tipo:</span>{' '}
                        <span className="text-slate-900 dark:text-white">{capitalizeReleaseType(data.release_type)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Fecha:</span>{' '}
                        <span className="text-slate-900 dark:text-white">{data.release_date}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Duración:</span>{' '}
                        <span className="text-slate-900 dark:text-white">{data.duration}</span>
                      </div>
                      {revision > 0 && (
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Revisión:</span>{' '}
                          <span className="text-slate-900 dark:text-white font-medium">#{revision}</span>
                        </div>
                      )}
                      {getCoverImage(data) && (
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Portada:</span>
                          <Image
                            src={getCoverImage(data)!}
                            alt="Cover"
                            width={600}
                            height={160}
                            unoptimized
                            className="mt-2 w-full h-40 object-cover rounded-lg"
                          />
                        </div>
                      )}
                      {data.lyrics && (
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Letra:</span>
                          <p className="mt-1 text-slate-700 dark:text-slate-300 whitespace-pre-line max-h-32 overflow-y-auto">
                            {data.lyrics}
                          </p>
                        </div>
                      )}
                    </div>
                    {selected.status === 'pending' && (
                      <div className="flex gap-2 mt-6">
                        <button
                          onClick={() => handleAction(selected.id, 'approve')}
                          disabled={actionLoading === selected.id}
                          className="flex-1 px-4 py-2.5 text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg font-medium transition-colors disabled:opacity-50 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => { openRejectModal(selected); setSelected(null); }}
                          disabled={actionLoading === selected.id}
                          className="flex-1 px-4 py-2.5 text-white bg-red-500 hover:bg-red-600 rounded-lg font-medium transition-colors disabled:opacity-50 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                        >
                          Rechazar
                        </button>
                        <button
                          onClick={() => { openRevisionModal(selected); setSelected(null); }}
                          disabled={actionLoading === selected.id}
                          className="flex-1 px-4 py-2.5 text-white bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition-colors disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                        >
                          Revisión
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && rejectTarget && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeRejectModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-modal-title"
          >
            <div
              className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="reject-modal-title" ref={rejectModalTitleRef} tabIndex={-1} className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                Rechazar envío
              </h2>
              <div className="mb-4">
                <label
                  htmlFor="reject-reason"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Razón del rechazo (mín. 10 caracteres)
                </label>
                <textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explica por qué se rechaza este envío..."
                  className="w-full p-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white min-h-[100px] focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  aria-describedby="reject-char-count"
                />
                <div id="reject-char-count" className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex justify-end">
                  <span className={rejectReason.length < 10 ? 'text-red-500' : 'text-emerald-500'}>
                    {rejectReason.length}/10 caracteres mínimos
                  </span>
                </div>
              </div>
              <div className="flex gap-2" role="alert" aria-live="polite">
                <button
                  onClick={handleRejectConfirm}
                  disabled={rejectReason.length < 10 || actionLoading === rejectTarget?.id}
                  className="flex-1 px-4 py-2.5 text-white bg-red-500 hover:bg-red-600 rounded-lg font-medium transition-colors disabled:opacity-50 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                >
                  Confirmar rechazo
                </button>
                <button
                  onClick={closeRejectModal}
                  className="px-4 py-2.5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Revision Modal */}
        {showRevisionModal && revisionTarget && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeRevisionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="revision-modal-title"
          >
            <div
              className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="revision-modal-title" ref={revisionModalTitleRef} tabIndex={-1} className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                Solicitar revisión
              </h2>
              <div className="mb-4">
                <label
                  htmlFor="revision-reason"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Comentarios para el artista (mín. 10 caracteres)
                </label>
                <textarea
                  id="revision-reason"
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  placeholder="Indica qué necesita cambiar el artista..."
                  className="w-full p-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white min-h-[100px] focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  aria-describedby="revision-char-count"
                />
                <div id="revision-char-count" className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex justify-end">
                  <span className={revisionReason.length < 10 ? 'text-red-500' : 'text-emerald-500'}>
                    {revisionReason.length}/10 caracteres mínimos
                  </span>
                </div>
              </div>
              <div className="flex gap-2" role="alert" aria-live="polite">
                <button
                  onClick={handleRevisionConfirm}
                  disabled={revisionReason.length < 10 || actionLoading === revisionTarget?.id}
                  className="flex-1 px-4 py-2.5 text-white bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition-colors disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                >
                  Solicitar revisión
                </button>
                <button
                  onClick={closeRevisionModal}
                  className="px-4 py-2.5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
