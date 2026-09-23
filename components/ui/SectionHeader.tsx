import React from "react";

export function SectionHeader({
  emoji,
  title,
  subtitle,
  badges,
  action,
  className = "",
}: {
  emoji?: string;
  title: string;
  subtitle?: string;
  badges?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex items-start justify-between gap-2 mb-4 ${className}`}>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          {emoji && <span aria-hidden>{emoji}</span>}
          <span className="truncate">{title}</span>
        </h2>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {(badges || action) && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {badges}
          {action}
        </div>
      )}
    </header>
  );
}
