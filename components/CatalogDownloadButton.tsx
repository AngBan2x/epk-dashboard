"use client";

import { useState } from "react";

type CatalogFormat = "json" | "html";

interface CatalogOption {
  id: string;
  format: CatalogFormat;
  label: string;
  description: string;
  badge: string;
}

interface CatalogDownloadButtonProps {
  label?: string;
  className?: string;
}

const OPTIONS: CatalogOption[] = [
  {
    id: "catalog-json",
    format: "json",
    label: "Descargar catálogo (JSON)",
    description: "Todos los tracks con métricas, enlaces y detalles de producción, listo para automatizar",
    badge: "JSON",
  },
  {
    id: "catalog-html",
    format: "html",
    label: "Descargar catálogo (HTML)",
    description: "Ficha imprimible de cada lanzamiento con portada",
    badge: "HTML",
  },
];

/**
 * El nombre del archivo lo decide el servidor en `Content-Disposition`
 * (`lib/export-bundle.ts`), igual que en `DownloadCenter`. Antes se fijaba
 * `PressPlay_Catalogo.json` a mano, así que cualquier cambio de nombre en el
 * backend se perdía en silencio.
 */
function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(header);
  return match?.[1] ?? fallback;
}

export function CatalogDownloadButton({
  label,
  className = "flex-shrink-0 rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
}: CatalogDownloadButtonProps) {
  const [statusById, setStatusById] = useState<Record<string, "idle" | "loading">>({});
  const [error, setError] = useState<string | null>(null);

  const download = async (option: CatalogOption) => {
    setStatusById((prev) => ({ ...prev, [option.id]: "loading" }));
    setError(null);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ format: option.format, include: ["catalog"] }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "No se pudo generar el catálogo");
      }
      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("Content-Disposition"),
        `PressPlay_Catalogo.${option.format}`
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al descargar el catálogo");
    } finally {
      setStatusById((prev) => ({ ...prev, [option.id]: "idle" }));
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const status = statusById[option.id] ?? "idle";
          const text = label && option.format === "json" ? label : option.label;
          return (
            <div
              key={option.id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-primary-500/50 dark:border-slate-700 dark:bg-slate-900/60"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-pink-300 bg-pink-800 text-[10px] font-bold text-pink-50 dark:border-pink-800/60">
                {option.badge}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {text}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                  {option.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => download(option)}
                disabled={status === "loading"}
                className={className}
                aria-label={text}
              >
                {status === "loading" ? "Generando…" : "Descargar"}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
