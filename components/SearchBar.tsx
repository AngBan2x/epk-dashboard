"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { MIN_QUERY_LENGTH, type SearchResponse, type SearchResultItem } from "@/lib/search";

const DEBOUNCE_MS = 300;

type GroupKey = "artists" | "releases" | "shows";

interface GroupMeta {
  key: GroupKey;
  label: string;
  badge: string;
  badgeClass: string;
}

const GROUPS: GroupMeta[] = [
  {
    key: "artists",
    label: "Artistas",
    badge: "Artista",
    badgeClass: "bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300",
  },
  {
    key: "releases",
    label: "Releases",
    badge: "Release",
    badgeClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
  {
    key: "shows",
    label: "Shows",
    badge: "Show",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
];

interface FlatEntry {
  item: SearchResultItem;
  meta: GroupMeta;
  index: number;
}

interface GroupedEntries {
  meta: GroupMeta;
  entries: FlatEntry[];
}

interface SearchBoxProps {
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  onDismiss?: () => void;
}

function SearchBox({ className = "", autoFocus, placeholder = "Buscar artistas, shows, releases...", onDismiss }: SearchBoxProps) {
  const router = useRouter();
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setLoading(false);
      setError(null);
      setActiveIndex(-1);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            setResults(null);
            setError(body?.error ?? "No se pudo completar la búsqueda");
            return;
          }
          setResults(body as SearchResponse);
          setError(null);
          setActiveIndex(-1);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResults(null);
          setError("No se pudo completar la búsqueda");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const { grouped, flat } = useMemo(() => {
    const entries: FlatEntry[] = [];
    const groups: GroupedEntries[] = [];
    for (const meta of GROUPS) {
      const items = results?.results[meta.key] ?? [];
      if (items.length === 0) continue;
      const start = entries.length;
      const groupEntries = items.map((item, offset) => {
        const entry: FlatEntry = { item, meta, index: start + offset };
        entries.push(entry);
        return entry;
      });
      groups.push({ meta, entries: groupEntries });
    }
    return { grouped: groups, flat: entries };
  }, [results]);

  useEffect(() => {
    if (activeIndex >= 0) activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        onDismiss?.();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      onDismiss?.();
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onDismiss]);

  const navigateTo = useCallback(
    (entry: FlatEntry) => {
      router.push(entry.item.url);
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
      onDismiss?.();
    },
    [router, onDismiss]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      if (onDismiss) {
        onDismiss();
      } else if (!open) {
        inputRef.current?.blur();
      }
      return;
    }

    if (!open) {
      if (event.key === "ArrowDown" && flat.length > 0) {
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (flat.length > 0) setActiveIndex((current) => (current + 1) % flat.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (flat.length > 0) setActiveIndex((current) => (current <= 0 ? flat.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter") {
      const entry = flat[activeIndex];
      if (entry) {
        event.preventDefault();
        navigateTo(entry);
      }
    }
  };

  const showHint = !loading && !error && trimmed.length < MIN_QUERY_LENGTH;
  const showEmpty = !loading && !error && trimmed.length >= MIN_QUERY_LENGTH && results !== null && results.total === 0;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${baseId}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined}
          aria-label="Buscar artistas, shows y releases"
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/30"
        />
      </div>

      {open && (
        <div
          id={`${baseId}-listbox`}
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
        >
          {loading && (
            <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
              Buscando “{trimmed}”…
            </p>
          )}

          {showHint && (
            <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              {trimmed.length === 0
                ? "Escribe para buscar artistas, releases y shows"
                : `Escribe al menos ${MIN_QUERY_LENGTH} caracteres para buscar`}
            </p>
          )}

          {error && (
            <p className="px-4 py-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          {showEmpty && (
            <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              No se encontraron resultados para “{trimmed}”
            </p>
          )}

          {grouped.map((group) => (
            <div key={group.meta.key} role="group" aria-label={group.meta.label}>
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {group.meta.label}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">{group.entries.length}</span>
              </div>
              {group.entries.map((entry) => {
                const isActive = entry.index === activeIndex;
                return (
                  <Link
                    key={`${group.meta.key}-${entry.item.id}`}
                    id={`${baseId}-option-${entry.index}`}
                    href={entry.item.url}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    ref={isActive ? activeRef : undefined}
                    onClick={() => navigateTo(entry)}
                    onMouseMove={() => setActiveIndex(entry.index)}
                    className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                      isActive
                        ? "bg-primary-50 dark:bg-primary-950"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {entry.item.image ? (
                      <Image
                        src={entry.item.image}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-500 dark:text-slate-400"
                      >
                        {entry.item.title.charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {entry.item.title}
                      </span>
                      {entry.item.subtitle && (
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {entry.item.subtitle}
                        </span>
                      )}
                    </span>
                    <span
                      className={`hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${entry.meta.badgeClass}`}
                    >
                      {entry.meta.badge}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchBar({ className = "" }: { className?: string }) {
  return <SearchBox className={className} />;
}

export function MobileSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        aria-expanded={open}
        className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-950 md:hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 px-3 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar búsqueda"
                className="flex-shrink-0 p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <SearchBox className="min-w-0 flex-1" autoFocus onDismiss={() => setOpen(false)} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
