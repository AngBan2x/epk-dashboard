"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  NotificationIcon,
  NotificationTime,
  notificationHref,
  type NotificationItem,
} from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

const PAGE_SIZE = 20;

function apiErrorMessage(status: number, data: unknown): string {
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (status === 401) return "Tu sesión ha expirado. Inicia sesión de nuevo.";
  if (status >= 500) return "Error interno del servidor";
  return "No se pudieron cargar las notificaciones";
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(async (currentFilter: Filter) => {
    setLoading(true);
    setError("");
    try {
      const query = currentFilter === "unread" ? "?unread=1" : "";
      const res = await fetch(`/api/notifications${query}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(res.status, data));
        setItems([]);
        setUnreadCount(0);
        return;
      }
      const notifications = (data as { notifications?: unknown } | null)?.notifications;
      const count = (data as { unread_count?: unknown } | null)?.unread_count;
      setItems(Array.isArray(notifications) ? (notifications as NotificationItem[]) : []);
      setUnreadCount(typeof count === "number" ? count : 0);
      setVisible(PAGE_SIZE);
    } catch {
      setError("Error de conexión");
      setItems([]);
      setUnreadCount(0);
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
      void load(filter);
    }
  }, [authLoading, user, filter, load]);

  const handleMarkRead = async (id: string) => {
    const target = items.find((item) => item.id === id);
    const wasUnread = target !== undefined && !target.read;
    setPendingId(id);
    setActionError("");
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
    if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
    try {
      const res = await fetch(`/api/notifications/read?id=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setActionError("No se pudo marcar la notificación como leída");
        void load(filter);
        return;
      }
      if (filter === "unread") {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {
      setActionError("Error de conexión");
      void load(filter);
    } finally {
      setPendingId(null);
    }
  };

  const handleMarkAll = async () => {
    if (unreadCount === 0) return;
    const previousItems = items;
    const previousCount = unreadCount;
    setMarkingAll(true);
    setActionError("");
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("read-all failed");
      if (filter === "unread") setItems([]);
    } catch {
      setItems(previousItems);
      setUnreadCount(previousCount);
      setActionError("No se pudieron marcar las notificaciones como leídas");
    } finally {
      setMarkingAll(false);
    }
  };

  const handleOpen = (item: NotificationItem) => {
    const href = notificationHref(item.data);
    if (!href) return;
    if (!item.read) void handleMarkRead(item.id);
    router.push(href);
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

  const visibleItems = items.slice(0, visible);
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "unread", label: "No leídas" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Notificaciones
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Actividad reciente de tu cuenta
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-primary-600 px-2 py-0.5 text-xs font-bold text-white">
                  {unreadCount} sin leer
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleMarkAll()}
            disabled={markingAll || unreadCount === 0}
            className="h-10 px-4 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            {markingAll ? "Marcando..." : "Marcar todas como leídas"}
          </button>
        </div>

        <div className="mb-6 inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
          {filters.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                filter === option.key
                  ? "bg-primary-600 hover:bg-primary-700 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm flex flex-wrap items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void load(filter)}
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
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 animate-pulse"
              >
                <div className="flex gap-3">
                  <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-700" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 && !error ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-14 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                />
              </svg>
            </span>
            <p className="text-lg font-medium text-slate-900 dark:text-slate-100">
              {filter === "unread"
                ? "No tienes notificaciones sin leer"
                : "No hay notificaciones"}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              {filter === "unread"
                ? "Estás al día con la actividad de tu cuenta."
                : "Cuando haya actividad en tu cuenta aparecerá aquí."}
            </p>
            {filter === "unread" && (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="inline-flex items-center justify-center mt-5 h-10 px-5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                Ver todas
              </button>
            )}
          </div>
        ) : (
          <>
            <ul className="space-y-4">
              {visibleItems.map((item) => {
                const href = notificationHref(item.data);
                const busy = pendingId === item.id;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "rounded-xl border p-4 sm:p-5 transition-colors",
                      item.read
                        ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                        : "border-primary-200 dark:border-primary-900 bg-primary-50/50 dark:bg-primary-950/30"
                    )}
                  >
                    <div className="flex gap-3">
                      <NotificationIcon type={item.type} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">
                            {item.title}
                          </p>
                          {!item.read && (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-600"
                              aria-label="Sin leer"
                            />
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 break-words">
                          {item.message}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                          <NotificationTime
                            iso={item.created_at}
                            className="text-xs text-slate-400 dark:text-slate-500"
                          />
                          {!item.read && (
                            <button
                              type="button"
                              onClick={() => void handleMarkRead(item.id)}
                              disabled={busy}
                              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                            >
                              {busy ? "Marcando..." : "Marcar como leída"}
                            </button>
                          )}
                          {href && (
                            <button
                              type="button"
                              onClick={() => handleOpen(item)}
                              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                            >
                              Abrir
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {items.length > visible && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setVisible((count) => count + PAGE_SIZE)}
                  className="h-10 px-5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  Cargar más notificaciones
                </button>
              </div>
            )}

            {filter === "all" && items.length > 0 && (
              <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
                Mostrando {visibleItems.length} de {items.length}
              </p>
            )}
          </>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/subscriptions"
            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            Gestionar avisos en Mis suscripciones
          </Link>
        </div>
      </main>
    </div>
  );
}
