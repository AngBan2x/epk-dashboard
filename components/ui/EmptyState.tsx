import React from "react";

export function EmptyState({
  emoji,
  message,
  cta,
  className = "",
}: {
  emoji: string;
  message: string;
  cta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`py-10 px-6 text-center ${className}`}>
      <p className="text-3xl mb-2" aria-hidden>
        {emoji}
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {cta && <div className="mt-3">{cta}</div>}
    </div>
  );
}
