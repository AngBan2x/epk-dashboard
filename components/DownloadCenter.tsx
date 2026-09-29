"use client";

import React, { useState } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge, CountBadge } from "@/components/ui/Badge";
import { safeString } from "@/lib/null-safe";

type ExportSection = "dossier" | "rider" | "catalog";
// B5 pendiente: aqui ira `| "pdf"` cuando se permita instalar `pdfkit`.
// No se anade ya a proposito: el backend no sabe generar PDF, asi que aceptarlo
// devolveria un JSON con extension .pdf. Ver el TODO de B5 en
// docs/PLAN_RC29_RC31.md.
type ExportFormat = "html" | "json";

interface DownloadOption {
  id: string;
  name: string;
  description: string;
  format: ExportFormat;
  sections: ExportSection[];
  badge: string;
}

interface DownloadCenterProps {
  artistId?: string;
  artistName?: string;
  trackCount?: number;
  className?: string;
}

type Status = "idle" | "loading" | "error";

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(header);
  return match?.[1] ?? fallback;
}

export function DownloadCenter({
  artistId,
  artistName = "Artista",
  trackCount = 0,
  className = "",
}: DownloadCenterProps) {
  const safeName = artistName.replace(/[^a-zA-Z0-9]/g, "") || "Artista";
  const [statusById, setStatusById] = useState<Record<string, Status>>({});
  const [error, setError] = useState<string | null>(null);

  const options: DownloadOption[] = [
    {
      id: "dossier",
      name: `Dossier de prensa`,
      description: "Ficha de prensa con biography, métricas, contactos y notas",
      format: "html",
      sections: ["dossier"],
      badge: "HTML",
    },
    {
      id: "rider",
      name: `Rider técnico`,
      description: "Stage plot, requisitos de sonido, luz y backline",
      format: "html",
      sections: ["rider"],
      badge: "HTML",
    },
    {
      id: "catalog-json",
      name: `Catálogo en JSON`,
      description: "Todos los tracks con métricas y enlaces, listo para automatizar",
      format: "json",
      sections: ["catalog"],
      badge: "JSON",
    },
    {
      id: "catalog-html",
      name: `Catálogo imprimible`,
      description: "Ficha imprimible de cada lanzamiento con portada",
      format: "html",
      sections: ["catalog"],
      badge: "HTML",
    },
  ];

  // No hay un boton de "Actualizar datos del dossier" a proposito.
  //
  // Antes existia `refreshDossier`: hacia `GET /api/dossiers?artist_id=...`,
  // descartaba la respuesta y solo incrementaba un contador `dossierRevision`
  // que se volcaba en `data-dossier-revision`, atributo que no leia nadie en el
  // repo (verificado con git grep sobre app/, components/, lib/, scripts/ y
  // tests/). Es decir: era codigo muerto.
  //
  // Se puede eliminar porque no hay nada que "actualizar": no hay cache de
  // dossier, ni archivo pregenerado, ni columna de version en la base de datos.
  // `POST /api/export` lee fresco de Turso en cada clic
  // (`lib/export-bundle.ts:92-102`) y responde con `Cache-Control: no-store`
  // (`app/api/export/route.ts:78`), asi que el flujo "guardar y se actualiza
  // solo" ya funciona y no necesita un boton que no hacia nada.
  const handleDownload = async (option: DownloadOption) => {
    if (!artistId) {
      setError("Necesitas un perfil de artista para generar el dossier y el rider.");
      return;
    }

    setStatusById((prev) => ({ ...prev, [option.id]: "loading" }));
    setError(null);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          format: option.format,
          artist_id: artistId,
          include: option.sections,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "No se pudo generar el archivo");
      }

      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("Content-Disposition"),
        `${option.id}-${safeName}.${option.format}`
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setStatusById((prev) => ({ ...prev, [option.id]: "idle" }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo generar el archivo. Inténtalo de nuevo."
      );
      setStatusById((prev) => ({ ...prev, [option.id]: "error" }));
    }
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 p-6 dark:border-slate-700 dark:bg-slate-800 ${className}`}
    >
      <SectionHeader
        emoji="📥"
        title="Descargas para prensa"
        subtitle="Todo se genera en el servidor con tus datos más recientes"
        badges={
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <Badge variant="emerald">Sin coste</Badge>
            <CountBadge>{trackCount || 0} tracks incluidos</CountBadge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const status = statusById[option.id] ?? "idle";
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
                  {safeString(option.name)}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                  {option.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(option)}
                disabled={status === "loading"}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                aria-label={`Descargar ${option.name} de ${artistName}`}
              >
                {status === "loading" ? "Generando…" : "Descargar"}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded border border-red-400 px-2 py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
