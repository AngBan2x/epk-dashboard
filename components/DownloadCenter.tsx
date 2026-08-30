"use client";

import React, { useState } from "react";
import { safeString } from "@/lib/null-safe";

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
  assets?: DownloadableAsset[];
}

export function DownloadCenter({
  artistName = "Artista",
  assets = [],
}: DownloadCenterProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const defaultAssets: DownloadableAsset[] = [
    {
      id: "asset-1",
      name: `Rider Técnico & Stage Plot - ${artistName} 2026`,
      category: "Tech Rider",
      size: "2.4 MB",
      format: "PDF",
    },
    {
      id: "asset-2",
      name: `Pack Oficial de Logos e Isotipos (Alta Resolución)`,
      category: "Logos & Vectores",
      size: "14.8 MB",
      format: "ZIP",
    },
    {
      id: "asset-3",
      name: `Dossier de Prensa & Biografía Oficial`,
      category: "Ficha EPK",
      size: "1.1 MB",
      format: "PDF",
    },
    {
      id: "asset-4",
      name: `Sesión Fotográfica Oficial (300 DPI para Impresión)`,
      category: "Fotos HD",
      size: "48.2 MB",
      format: "ZIP",
    },
  ];

  const assetList = assets.length > 0 ? assets : defaultAssets;

  const handleDownload = (asset: DownloadableAsset) => {
    setDownloadingId(asset.id);
    setTimeout(() => {
      // Simulación de descarga de archivo o redirección a asset.url
      if (asset.url) {
        window.open(asset.url, "_blank");
      } else {
        // Generar descarga simulada de documento de texto/JSON como fallback
        const content = `EPK ASSET: ${asset.name}\nArtista: ${artistName}\nCategoría: ${asset.category}\nGenerado el: ${new Date().toISOString()}`;
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${asset.name.replace(/[^a-z0-9]/gi, "_")}.${asset.format.toLowerCase()}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setDownloadingId(null);
    }, 600);
  };

  return (
    <section className="p-6 bg-white dark:bg-dark-800 rounded-2xl border border-dark-200 dark:border-dark-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-dark-900 dark:text-dark-100">
            Centro de Descargas & Assets
          </h2>
          <p className="text-xs text-dark-500 mt-0.5">
            Documentación técnica y paquetes de medios para festivales, venues y prensa
          </p>
        </div>
        <span className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold px-2.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-800">
          Disponibles para Prensa
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assetList.map((asset) => (
          <div
            key={asset.id}
            className="flex items-center justify-between p-4 rounded-xl bg-dark-50 dark:bg-dark-900/60 border border-dark-200 dark:border-dark-700 hover:border-primary-500/50 transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-950/80 text-primary-600 dark:text-primary-400 font-bold text-xs flex items-center justify-center border border-primary-300 dark:border-primary-800/60 flex-shrink-0">
                {asset.format}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-dark-900 dark:text-dark-100 truncate">
                  {safeString(asset.name)}
                </p>
                <div className="flex items-center gap-2 text-xs text-dark-500 mt-0.5">
                  <span>{asset.category}</span>
                  <span>·</span>
                  <span>{asset.size}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleDownload(asset)}
              disabled={downloadingId === asset.id}
              className="ml-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white transition flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
              aria-label={`Descargar ${asset.name}`}
            >
              {downloadingId === asset.id ? (
                <>⏳ Preparando...</>
              ) : (
                <>📥 Descargar</>
              )}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
