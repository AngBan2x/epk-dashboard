'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import type { UserPreferences } from '@/types/music';
import { cn } from '@/lib/utils';

const PREFERENCE_FIELDS: { key: keyof UserPreferences; label: string; description: string }[] = [
  {
    key: 'email_notifications',
    label: 'Notificaciones por email',
    description: 'Resumen de la actividad de tu cuenta en tu correo',
  },
  {
    key: 'push_notifications',
    label: 'Notificaciones push',
    description: 'Avisos en tiempo real dentro de la aplicación',
  },
  {
    key: 'new_release_alerts',
    label: 'Avisos de nuevos releases',
    description: 'Cuando un artista al que sigues publica algo nuevo',
  },
  {
    key: 'show_alerts',
    label: 'Avisos de shows',
    description: 'Nuevos shows, cambios y recordatorios',
  },
  {
    key: 'marketing_emails',
    label: 'Emails promocionales',
    description: 'Novedades y campañas de PressPlay',
  },
];

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

export default function AccountPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState('');
  const [prefsSaved, setPrefsSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadPreferences = async () => {
      setPrefsLoading(true);
      try {
        const res = await fetch('/api/user/preferences', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (res.ok && data && data.preferences) {
          setPreferences(data.preferences as UserPreferences);
          setPrefsError('');
        } else {
          setPrefsError('No se pudieron cargar las preferencias de notificación');
        }
      } catch {
        if (active) setPrefsError('Error de conexión');
      } finally {
        if (active) setPrefsLoading(false);
      }
    };
    void loadPreferences();
    return () => {
      active = false;
    };
  }, [user]);

  const handlePreferenceChange = async (key: keyof UserPreferences, value: boolean) => {
    if (!preferences) return;
    const previous = preferences;
    const next = { ...previous, [key]: value } as UserPreferences;
    setPreferences(next);
    setPrefsSaving(true);
    setPrefsError('');
    setPrefsSaved(false);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPreferences(previous);
        setPrefsError(
          typeof data?.error === 'string' && data.error.trim().length > 0
            ? data.error
            : 'No se pudieron guardar las preferencias de notificación'
        );
        return;
      }
      if (data && data.preferences) {
        setPreferences(data.preferences as UserPreferences);
      }
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 3000);
    } catch {
      setPreferences(previous);
      setPrefsError('Error de conexión al guardar las preferencias');
    } finally {
      setPrefsSaving(false);
    }
  };

  const handleUpdateEmail = async () => {
    try {
      setSaving(true);
      setError('');
      setSaved(false);
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al actualizar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    try {
      setSaving(true);
      setError('');
      setSaved(false);

      if (newPassword !== confirmPassword) {
        setError('Las contraseñas no coinciden');
        setSaving(false);
        return;
      }
      if (newPassword.length < 6) {
        setError('La nueva contraseña debe tener al menos 6 caracteres');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setSaved(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al cambiar contraseña');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleting(true);
      setError('');
      const res = await fetch('/api/user/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (res.ok) {
        logout();
        router.push('/');
      } else {
        const data = await res.json();
        setError(data.error || 'Error al eliminar cuenta');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Configuración de Cuenta</h1>
          <p className="text-slate-500 dark:text-slate-400">Gestiona tu email, contraseña y preferencias</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Email */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Email</h2>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dirección de email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <button
                onClick={handleUpdateEmail}
                disabled={saving || !email.trim()}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Actualizar
              </button>
            </div>
          </div>

          {/* Password */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Cambiar Contraseña</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Contraseña actual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nueva contraseña</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirmar contraseña</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <button
                onClick={handleUpdatePassword}
                disabled={saving || !currentPassword || !newPassword}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Cambiar Contraseña
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Notificaciones</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Elige qué avisos quieres recibir
            </p>

            {prefsError && (
              <div
                role="alert"
                className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm"
              >
                {prefsError}
              </div>
            )}

            {prefsLoading || !preferences ? (
              <div className="space-y-4" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="h-9 w-full rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {PREFERENCE_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {field.label}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {field.description}
                        </p>
                      </div>
                      <Switch
                        checked={preferences[field.key]}
                        disabled={prefsSaving}
                        label={field.label}
                        onChange={(next) => void handlePreferenceChange(field.key, next)}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-3 min-h-[1.25rem] text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {prefsSaved ? '✓ Preferencias guardadas' : ''}
                </p>
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-red-200 dark:border-red-800 p-6">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Zona de Peligro</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Eliminar tu cuenta es permanente. Tienes 30 días de gracia para recuperarla.
            </p>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Eliminar mi cuenta
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                  Escribe tu contraseña para confirmar:
                </p>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Tu contraseña actual"
                  className="w-full px-3 py-2 border border-red-200 dark:border-red-700 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting || !deletePassword}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Eliminando...' : 'Confirmar Eliminación'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                    className="px-4 py-2 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Success message */}
          {saved && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-300 text-sm font-medium">
              ✓ Cambios guardados correctamente
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
