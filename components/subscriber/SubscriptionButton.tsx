"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { LoginModal } from "@/components/LoginModal";
import { cn } from "@/lib/utils";

interface SubscriptionButtonProps {
  artistId: string;
  artistName?: string;
  artistUserId?: string | null;
}

function apiErrorMessage(status: number, data: unknown): string {
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (status === 401) return "Tu sesión ha expirado. Inicia sesión de nuevo.";
  if (status === 403) return "No tienes permiso para realizar esta acción";
  if (status === 404) return "La suscripción ya no existe";
  if (status === 429)
    return "Demasiados intentos. Vuelve a intentarlo en unos minutos.";
  if (status >= 500) return "Error interno del servidor";
  return "No se pudo completar la operación";
}

export function SubscriptionButton({
  artistId,
  artistName,
  artistUserId,
}: SubscriptionButtonProps) {
  const { user, loading: authLoading } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const isOwner = !!user && !!artistUserId && user.id === artistUserId;
  const displayName = artistName || "este artista";

  useEffect(() => {
    if (authLoading || !user || isOwner) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/subscriptions?artist_id=${encodeURIComponent(artistId)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(apiErrorMessage(res.status, data));
          return;
        }
        setSubscribed(!!data?.subscribed);
        setSubscriptionId(data?.subscription?.id ?? null);
      } catch {
        if (!cancelled) setError("Error de conexión");
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, artistId, isOwner]);

  const handleSubscribe = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artistId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(res.status, data));
        return;
      }
      setSubscribed(true);
      setSubscriptionId(data?.id ?? null);
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!subscriptionId) {
      setError("No se encontró tu suscripción. Recarga la página e inténtalo de nuevo.");
      setConfirming(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(res.status, data));
        return;
      }
      setSubscribed(false);
      setSubscriptionId(null);
      setConfirming(false);
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || (user && !ready && !isOwner)) {
    return (
      <div
        className="h-10 w-44 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse"
        aria-hidden="true"
      />
    );
  }

  if (isOwner) return null;

  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLoginOpen(true)}
          className="inline-flex items-center justify-center h-10 px-5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
        >
          Iniciar sesión
        </button>
        <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div
          role="group"
          aria-label={`Confirmar cancelación de suscripción a ${displayName}`}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
        >
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            ¿Cancelar suscripción a {displayName}?
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Dejarás de recibir avisos de nuevos releases y shows.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={busy}
              aria-busy={busy}
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {busy ? "Cancelando..." : "Confirmar baja"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setError("");
              }}
              disabled={busy}
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Mantener suscripción
            </button>
          </div>
        </div>
      ) : subscribed ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="inline-flex items-center justify-center h-10 px-5 rounded-lg text-sm font-medium border border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors disabled:opacity-50"
          aria-label={`Suscrito a ${displayName}. Activar para cancelar la suscripción`}
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          Suscrito
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex items-center justify-center h-10 px-5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {busy ? "Suscribiéndote..." : "Suscribirse"}
        </button>
      )}

      {error && (
        <p
          role="alert"
          className={cn(
            "text-xs text-red-600 dark:text-red-400 max-w-xs",
            confirming && "max-w-sm"
          )}
        >
          {error}
        </p>
      )}
    </div>
  );
}
