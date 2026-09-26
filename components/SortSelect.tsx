"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { parseListSortParams, type ListSortState } from "@/lib/search";

interface SortOption {
  value: string;
  label: string;
  state: ListSortState;
}

const SORT_OPTIONS: SortOption[] = [
  { value: "name:asc", label: "Nombre (A-Z)", state: { sort: "name", order: "asc" } },
  { value: "name:desc", label: "Nombre (Z-A)", state: { sort: "name", order: "desc" } },
  { value: "date:desc", label: "Fecha (más reciente)", state: { sort: "date", order: "desc" } },
  { value: "date:asc", label: "Fecha (más antigua)", state: { sort: "date", order: "asc" } },
];


export function useListSort(defaultState: ListSortState): [ListSortState, (next: ListSortState) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<ListSortState>(defaultState);
  const defaultSort = defaultState.sort;
  const defaultOrder = defaultState.order;

  useEffect(() => {
    const applyFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const sortParam = params.get("sort");
      const orderParam = params.get("order");
      setState(
        sortParam || orderParam
          ? parseListSortParams(sortParam, orderParam)
          : { sort: defaultSort, order: defaultOrder }
      );
    };
    applyFromUrl();
    window.addEventListener("popstate", applyFromUrl);
    return () => window.removeEventListener("popstate", applyFromUrl);
  }, [defaultSort, defaultOrder]);

  const update = useCallback(
    (next: ListSortState) => {
      setState(next);
      const params = new URLSearchParams(window.location.search);
      params.set("sort", next.sort);
      params.set("order", next.order);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router]
  );

  return [state, update];
}

interface SortSelectProps {
  value: ListSortState;
  onChange: (next: ListSortState) => void;
  label?: string;
  className?: string;
}

export function SortSelect({ value, onChange, label = "Ordenar por", className = "" }: SortSelectProps) {
  const id = useId();
  const current = `${value.sort}:${value.order}`;
  const known = SORT_OPTIONS.some((option) => option.value === current);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <select
        id={id}
        value={known ? current : SORT_OPTIONS[0].value}
        onChange={(event) => {
          const option = SORT_OPTIONS.find((item) => item.value === event.target.value);
          if (option) onChange(option.state);
        }}
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/30"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
