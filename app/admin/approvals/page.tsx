'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

interface Submission {
  id: string;
  user_id: string;
  track_data: string;
  status: 'pending' | 'approved' | 'rejected' | 'revision';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  submission_type?: string;
}

interface Stats {
  pending: number;
  approved: number;
  rejected: number;
  revision: number;
  total: number;
}

export default function ApprovalsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'revision'>('pending');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Submission | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    fetchApprovals();
  }, [filter]);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      const url = filter === 'all' ? '/api/admin/approvals' : `/api/admin/approvals?status=${filter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch approvals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'revision', reason?: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/admin/approvals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) {
        fetchApprovals();
        setSelected(null);
        setShowRejectModal(false);
        setRejectReason('');
      }
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setActionLoading(null);
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
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;
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
          <p className="text-slate-500 dark:text-slate-400">Revisa y aprueba submissions de artistas</p>
        </div>

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

        {/* Submissions list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando...</div>
          ) : submissions.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No hay submissions {filter !== 'all' ? `con estado "${filter}"` : ''}</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {submissions.map((sub) => {
                const data = parseTrackData(sub.track_data);
                return (
                  <div key={sub.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                            {data.title || 'Sin título'}
                          </h3>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[sub.status] || ''}`}>
                            {statusLabels[sub.status] || sub.status}
                          </span>
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
                          className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          Ver
                        </button>
                        {sub.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleAction(sub.id, 'approve')}
                              disabled={actionLoading === sub.id}
                              className="px-3 py-1.5 text-sm text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => { setRejectTarget(sub); setShowRejectModal(true); }}
                              disabled={actionLoading === sub.id}
                              className="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Rechazar
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
        </div>

        {/* Detail Modal */}
        {selected && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const data = parseTrackData(selected.track_data);
                return (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{data.title || 'Sin título'}</h2>
                      <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div><span className="text-slate-500">Artista:</span> <span className="text-slate-900 dark:text-white">{data.artist_name}</span></div>
                      <div><span className="text-slate-500">Tipo:</span> <span className="text-slate-900 dark:text-white">{data.release_type}</span></div>
                      <div><span className="text-slate-500">Fecha:</span> <span className="text-slate-900 dark:text-white">{data.release_date}</span></div>
                      <div><span className="text-slate-500">Duración:</span> <span className="text-slate-900 dark:text-white">{data.duration}</span></div>
                      {data.cover_image && (
                        <div>
                          <span className="text-slate-500">Portada:</span>
                          <img src={data.cover_image} alt="Cover" className="mt-2 w-full h-40 object-cover rounded-lg" />
                        </div>
                      )}
                      {data.lyrics && (
                        <div>
                          <span className="text-slate-500">Letra:</span>
                          <p className="mt-1 text-slate-700 dark:text-slate-300 whitespace-pre-line max-h-32 overflow-y-auto">{data.lyrics}</p>
                        </div>
                      )}
                    </div>
                    {selected.status === 'pending' && (
                      <div className="flex gap-2 mt-6">
                        <button
                          onClick={() => handleAction(selected.id, 'approve')}
                          disabled={actionLoading === selected.id}
                          className="flex-1 px-4 py-2.5 text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => { setRejectTarget(selected); setShowRejectModal(true); setSelected(null); }}
                          disabled={actionLoading === selected.id}
                          className="flex-1 px-4 py-2.5 text-white bg-red-500 hover:bg-red-600 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Rechazar
                        </button>
                        <button
                          onClick={() => { handleAction(selected.id, 'revision', 'Por favor revisa y actualiza la información'); }}
                          disabled={actionLoading === selected.id}
                          className="flex-1 px-4 py-2.5 text-white bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition-colors disabled:opacity-50"
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRejectModal(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Rechazar Submission</h2>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Razón del rechazo (mín. 10 caracteres)"
                className="w-full p-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white min-h-[100px] mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(rejectTarget.id, 'reject', rejectReason)}
                  disabled={rejectReason.length < 10 || actionLoading === rejectTarget.id}
                  className="flex-1 px-4 py-2.5 text-white bg-red-500 hover:bg-red-600 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Confirmar Rechazo
                </button>
                <button
                  onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                  className="px-4 py-2.5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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
