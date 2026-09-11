"use client";

import React, { useState } from "react";
import { safeString } from "@/lib/null-safe";
import { generateRiderHTML, generateDossierHTML } from "@/lib/downloadable-assets";

export interface DownloadableAsset {
  id: string;
  name: string;
  category: "Tech Rider" | "Logos & Vectores" | "Fotos HD" | "Ficha EPK" | "Audio Stems";
  size: string;
  format: string;
  url?: string;
}

interface DownloadCenterProps {
  artistName?: string;
  trackTitle?: string;
  assets?: DownloadableAsset[];
}

export function DownloadCenter({
  artistName = "Artista",
  trackTitle,
  assets = [],
}: DownloadCenterProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const defaultAssets: DownloadableAsset[] = [
    {
      id: "asset-1",
      name: `Rider Técnico & Stage Plot - ${artistName} 2026`,
      category: "Tech Rider",
      size: "~15 KB",
      format: "HTML",
    },
    {
      id: "asset-3",
      name: `Dossier de Prensa & Biografía Oficial`,
      category: "Ficha EPK",
      size: "~12 KB",
      format: "HTML",
    },
  ];

  const assetList = assets.length > 0 ? assets : defaultAssets;

  const handleDownload = (asset: DownloadableAsset) => {
    setDownloadingId(asset.id);
    setTimeout(() => {
      if (asset.url) {
        window.open(asset.url, "_blank");
      } else {
        let htmlContent = "";
        let filename = "";

        if (asset.category === "Tech Rider") {
          htmlContent = generateRiderHTML(artistName);
          const safeName = artistName.replace(/[^a-zA-Z0-9]/g, "");
          filename = `PressPlay_Rider_Tecnico_${safeName}.html`;
        } else if (asset.category === "Ficha EPK") {
          htmlContent = generateDossierHTML(artistName);
          const safeName = artistName.replace(/[^a-zA-Z0-9]/g, "");
          filename = `PressPlay_Dossier_${safeName}.html`;
        } else {
          const content = `EPK ASSET: ${asset.name}\nArtista: ${artistName}\nCategoría: ${asset.category}\nGenerado el: ${new Date().toISOString()}`;
          const blob = new Blob([content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${asset.name.replace(/[^a-z0-9]/gi, "_")}.${asset.format.toLowerCase()}`;
          a.click();
          URL.revokeObjectURL(url);
          setDownloadingId(null);
          return;
        }

        const blob = new Blob([htmlContent], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      setDownloadingId(null);
    }, 600);
  };

  return (
    <section className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Centro de Descargas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Assets para prensa y venues
          </p>
        </div>
        <span className="flex-shrink-0 text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
          Disponibles
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {assetList.map((asset) => (
          <div
            key={asset.id}
            className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:border-primary-500/50 transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-950/80 text-primary-600 dark:text-primary-400 font-bold text-[10px] flex items-center justify-center border border-primary-300 dark:border-primary-800/60 flex-shrink-0">
              {asset.format}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {safeString(asset.name)}
              </p>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {asset.size}
              </div>
            </div>

            <button
              onClick={() => handleDownload(asset)}
              disabled={downloadingId === asset.id}
              className="flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold bg-primary-600 hover:bg-primary-500 text-white transition flex items-center gap-1 disabled:opacity-50"
              aria-label={`Descargar ${asset.name}`}
            >
              {downloadingId === asset.id ? (
                <>⏳</>
              ) : (
                <>📥</>
              )}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
