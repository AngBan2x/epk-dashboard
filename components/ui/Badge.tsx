import React from "react";

export function Badge({
  children,
  variant = "slate",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "slate" | "emerald" | "indigo" | "amber" | "rose" | "violet";
  className?: string;
}) {
  const variants: Record<string, string> = {
    slate:
      "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    emerald:
      "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    indigo:
      "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
    amber:
      "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    rose:
      "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    violet:
      "bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function CountBadge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 ${className}`}
    >
      {children}
    </span>
  );
}
