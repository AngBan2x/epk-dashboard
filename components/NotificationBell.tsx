"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { diffDaysUTC, formatDateES, safeDate } from "@/lib/null-safe";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

const PANEL_LIMIT = 10;
const POLL_INTERVAL_MS = 30000;

const BELL_PATH =
  "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0";

const ICONS: Record<string, { node: React.ReactNode; wrapper: string }> = {
  submission_approved: {
    node: <path d="M4.5 12.75l6 6 9-13.5" />,
    wrapper: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
  },
  submission_rejected: {
    node: <path d="M6 18L18 6M6 6l12 12" />,
    wrapper: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
  },
  new_release: {
    node: (
      <path d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
    ),
    wrapper: "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
  },
  track_liked: {
    node: (
      <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    ),
    wrapper: "bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400",
  },
  show_pending_review: {
    node: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5V12l3 1.8" />
      </>
    ),
    wrapper: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  },
  system: {
    node: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11.25v4.5M12 8.25h.01" />
      </>
    ),
    wrapper: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  },
  show_postponed: {
    node: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M8 2.75v4M16 2.75v4M3.5 10h17M12 13.5v3l1.75 1.05" />
      </>
    ),
    wrapper: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  },
  show_cancelled: {
    node: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M14.5 9.5l-5 5M9.5 9.5l5 5" />
      </>
    ),
    wrapper: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
  },
  show_reactivated: {
    node: (
      <>
        <path d="M4.93 4.93a7.5 7.5 0 0112.74 3.17M19.07 19.07a7.5 7.5 0 01-12.74-3.17" />
        <path d="M17.5 2.5v4h-4M6.5 21.5v-4h4" />
      </>
    ),
    wrapper: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
  },
  new_show: {
    node: (
      <path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    ),
    wrapper: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
  },
};

export function notificationHref(data: Record<string, unknown> | null): string | null {
  if (!data || typeof data !== "object") return null;
  const track = data.track_id ?? data.trackId;
  if (typeof track === "string" && track.length > 0) return `/track/${track}`;
  const release = data.release_id ?? data.releaseId;
  if (typeof release === "string" && release.length > 0) return `/releases/${release}`;
  const show = data.show_id ?? data.showId;
  if (typeof show === "string" && show.length > 0) return "/shows";
  return null;
}

export function relativeTimeES(iso: string): string {
  const date = safeDate(iso);
  if (!date) return "—";
  const now = new Date();
  const days = diffDaysUTC(date, now);
  if (days >= 1) return days === 1 ? "hace 1 día" : `hace ${days} días`;
  if (days <= -1) return formatDateES(iso, { hour: "2-digit", minute: "2-digit" });
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < 60000) return "hace un momento";
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return minutes === 1 ? "hace 1 minuto" : `hace ${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
}

export function NotificationTime({ iso, className }: { iso: string; className?: string }) {
  const [relative, setRelative] = useState("");

  useEffect(() => {
    setRelative(relativeTimeES(iso));
    const timer = setInterval(() => setRelative(relativeTimeES(iso)), 60000);
    return () => clearInterval(timer);
  }, [iso]);

  const label =
    relative || formatDateES(iso, { hour: "2-digit", minute: "2-digit" });

  return (
    <time dateTime={iso} className={className}>
      {label}
    </time>
  );
}

export function NotificationIcon({ type, className }: { type: string; className?: string }) {
  const icon = ICONS[type] ?? ICONS.system;
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        icon.wrapper,
        className
      )}
      aria-hidden="true"
    >
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        viewBox="0 0 24 24"
      >
        {icon.node}
      </svg>
    </span>
  );
}

export function NotificationBell() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        setItems([]);
        setUnreadCount(0);
        setError(false);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !Array.isArray(data.notifications)) {
        setError(true);
        return;
      }
      setItems(data.notifications);
      setUnreadCount(typeof data.unread_count === "number" ? data.unread_count : 0);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void load();
    const timer = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [authLoading, user, load]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  const markRead = async (id: string) => {
    const target = items.find((item) => item.id === id);
    const wasUnread = target !== undefined && !target.read;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
    try {
      const res = await fetch(`/api/notifications/read?id=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) void load();
    } catch {
      void load();
    }
  };

  const markAll = async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) void load();
    } catch {
      void load();
    } finally {
      setMarkingAll(false);
    }
  };

  const handleSelect = (item: NotificationItem) => {
    const href = notificationHref(item.data);
    if (!item.read) void markRead(item.id);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  };

  if (!user) return null;

  const visibleItems = items.slice(0, PANEL_LIMIT);
  const showSkeleton = loading && items.length === 0 && !error;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={
          unreadCount > 0
            ? `Notificaciones, ${unreadCount} sin leer`
            : "Notificaciones"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={BELL_PATH} />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-4.5rem))] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Notificaciones
            </p>
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={markingAll || unreadCount === 0}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Marcar todas como leídas
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {showSkeleton ? (
              <div className="p-4 space-y-4" role="status" aria-label="Cargando notificaciones">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex gap-3 animate-pulse">
                    <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No se pudieron cargar las notificaciones
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-3 h-8 px-4 rounded-lg text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  Reintentar
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No hay notificaciones
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Cuando haya actividad en tu cuenta aparecerá aquí
                </p>
              </div>
            ) : (
              <ul>
                {visibleItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={cn(
                        "w-full text-left flex gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500",
                        item.read
                          ? "hover:bg-slate-50 dark:hover:bg-slate-800"
                          : "bg-primary-50/60 dark:bg-primary-950/30 hover:bg-primary-100/70 dark:hover:bg-primary-950/50"
                      )}
                    >
                      <NotificationIcon type={item.type} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                            {item.title}
                          </span>
                          {!item.read && (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-600"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                          {item.message}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <NotificationTime
                            iso={item.created_at}
                            className="text-[11px] text-slate-400 dark:text-slate-500"
                          />
                          {!item.read && (
                            <span className="text-[11px] font-medium text-primary-600 dark:text-primary-400">
                              Sin leer
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block w-full text-center text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 py-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              Ver todas las notificaciones
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
