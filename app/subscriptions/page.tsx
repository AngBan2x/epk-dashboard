"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { Subscription } from "@/types/music";
import { cn } from "@/lib/utils";

interface SubscriptionArtist {
  id: string;
  name: string;
  image: string | null;
}

interface SubscriptionItem extends Subscription {
  artist: SubscriptionArtist | null;
}

function apiErrorMessage(status: number, data: unknown): string {
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (status === 401) return "Tu sesión ha expirado. Inicia sesión de nuevo.";
  if (status === 403) return "No tienes permiso para realizar esta acción";
  if (status === 404) return "La suscripción ya no existe";
  if (status >= 500) return "Error interno del servidor";
  return "No se pudo completar la operación";
}

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
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-primary-600" : "bg-slate-300 dark:bg-slate-600"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export default function SubscriptionsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/subscriptions", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(res.status, data));
        setItems([]);
        return;
      }
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setError("Error de conexión");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user) {
      load();
    }
  }, [authLoading, user, load]);

  const handleToggle = async (
    sub: SubscriptionItem,
    field: "notify_releases" | "notify_shows",
    value: boolean
  ) => {
    setPendingId(sub.id);
    setActionError("");
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(apiErrorMessage(res.status, data));
      }
    } catch {
      setActionError("Error de conexión");
    } finally {
      setPendingId(null);
      await load();
    }
  };

  const handleUnsubscribe = async (sub: SubscriptionItem) => {
    setPendingId(sub.id);
    setActionError("");
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(apiErrorMessage(res.status, data));
        setConfirmId(null);
      }
    } catch {
      setActionError("Error de conexión");
      setConfirmId(null);
    } finally {
      setPendingId(null);
      await load();
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div
          className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"
          role="status"
          aria-label="Cargando"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Mis suscripciones
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Gestiona los artistas a los que sigues y qué avisos quieres recibir
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm flex flex-wrap items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={load}
              className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm"
          >
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="space-y-4" aria-hidden="true">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 animate-pulse"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-700" />
                </div>
                <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700 mb-3" />
                <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
            ))}
          </div>
        ) : items.length === 0 && !error ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-14 text-center">
            <p className="text-lg font-medium text-slate-900 dark:text-slate-100">
              Aún no tienes suscripciones
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Suscríbete a un artista para recibir avisos de sus nuevos releases
              y shows.
            </p>
            <Link
              href="/artists"
              className="inline-flex items-center justify-center mt-5 h-10 px-5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
            >
              Explorar artistas
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {items.map((sub) => {
              const busy = pendingId === sub.id;
              const name = sub.artist?.name || "Artista no disponible";
              const confirming = confirmId === sub.id;

              return (
                <li
                  key={sub.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    {sub.artist?.image ? (
                      <Image
                        src={sub.artist.image}
                        alt={name}
                        width={56}
                        height={56}
                        unoptimized
                        className="w-14 h-14 rounded-full object-cover bg-slate-200 dark:bg-slate-700"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xl font-bold"
                        aria-hidden="true"
                      >
                        {name[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                    <div className="min-w-0">
                      {sub.artist ? (
                        <Link
                          href={`/artists/${sub.artist_id}`}
                          className="font-semibold text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors break-words"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-500 dark:text-slate-400">
                          {name}
                        </span>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {sub.artist ? "Suscripción activa" : "Perfil no disponible"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        Avisar de nuevos releases
                      </span>
                      <Switch
                        checked={sub.notify_releases}
                        disabled={busy}
                        label={`Avisar de nuevos releases de ${name}`}
                        onChange={(next) =>
                          handleToggle(sub, "notify_releases", next)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        Avisar de nuevos shows
                      </span>
                      <Switch
                        checked={sub.notify_shows}
                        disabled={busy}
                        label={`Avisar de nuevos shows de ${name}`}
                        onChange={(next) => handleToggle(sub, "notify_shows", next)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                    {confirming ? (
                      <div
                        role="group"
                        aria-label={`Confirmar baja de ${name}`}
                        className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3"
                      >
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">
                          ¿Darte de baja de {name}?
                        </p>
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                          Dejarás de recibir avisos de este artista.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => handleUnsubscribe(sub)}
                            disabled={busy}
                            aria-busy={busy}
                            className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {busy ? "Dando de baja..." : "Confirmar baja"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            disabled={busy}
                            className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(sub.id)}
                        disabled={busy}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-sm font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      >
                        Darse de baja
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
