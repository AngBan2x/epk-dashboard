"use client";

import { useState } from "react";

interface CatalogDownloadButtonProps {
  label?: string;
  className?: string;
}

export function CatalogDownloadButton({
  label = "Descargar catálogo (JSON)",
  className = "mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
}: CatalogDownloadButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ format: "json", include: ["catalog"] }),
      });
      if (!response.ok) throw new Error("No se pudo generar el catálogo");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "PressPlay_Catalogo.json";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al descargar el catálogo");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div>
      <button type="button" onClick={download} disabled={status === "loading"} className={className}>
        {status === "loading" ? "Generando…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
