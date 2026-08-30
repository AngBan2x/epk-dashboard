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

  const generateRiderHTML = () => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rider Técnico - ${artistName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #0f172a; line-height: 1.6; }
    h1 { font-size: 2rem; color: #0f172a; border-bottom: 4px solid #10b981; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
    h2 { font-size: 1.3rem; color: #047857; margin: 2rem 0 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .section { margin-bottom: 2rem; padding: 1.5rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .item { padding: 0.75rem; background: white; border-radius: 8px; border: 1px solid #e2e8f0; }
    .item-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .item-value { font-size: 1rem; color: #0f172a; font-weight: 500; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; text-align: center; }
    @media print { body { padding: 1rem; } .section { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>🎤 Rider Técnico</h1>
  <p><strong>Artista:</strong> ${artistName}</p>
  <p><strong>Fecha:</strong> ${new Date().toLocaleDateString("es-VE", { year: "numeric", month: "long", day: "numeric" })}</p>

  <div class="section">
    <h2>Equipo de Sonido</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Sistema PA</div><div class="item-value">Line Array - Mínimo 15,000W RMS</div></div>
      <div class="item"><div class="item-label">Monitores</div><div class="item-value">Mínimo 4 mezclas in-ear o wedge</div></div>
      <div class="item"><div class="item-label">Consola FOH</div><div class="item-value">Digital - mínimo 32 canales</div></div>
      <div class="item"><div class="item-label">Subwoofers</div><div class="item-value">Mínimo 4 sub-graves (18&quot; o 21&quot;)</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Backline</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Guitarra</div><div class="item-value">Amplificador Combo 100W o Head + Cabinet</div></div>
      <div class="item"><div class="item-label">Bajo</div><div class="item-value">Amplificador Combo 300W mínimo</div></div>
      <div class="item"><div class="item-label">Batería</div><div class="item-value">Kit completo +.hardware + baquetas</div></div>
      <div class="item"><div class="item-label">Teclados</div><div class="item-value">Piano digital 88 teclas con sustain</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Rider de Catering</h2>
    <p>Agua natural, café, frutas frescas, snacks antes del show.</p>
  </div>

  <div class="footer">
    <p>Generado por EPK Dashboard Musical · ${new Date().getFullYear()}</p>
  </div>
</body>
</html>`;

  const generateDossierHTML = () => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dossier de Prensa - ${artistName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Georgia', serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #0f172a; }
    h1 { font-size: 2.5rem; border-bottom: 4px solid #db2777; padding-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; color: #be185d; margin-top: 2rem; }
    .track { border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; margin: 1rem 0; page-break-inside: avoid; }
    .badge { display: inline-block; background: #fce7f3; color: #be185d; border-radius: 9999px; padding: 0.2rem 0.8rem; font-size: 0.8rem; font-weight: bold; margin-bottom: 0.5rem; }
    .meta { color: #475569; font-size: 0.9rem; margin: 0.3rem 0; }
    .stats { display: flex; gap: 2rem; margin: 1rem 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #db2777; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }
    @media print { body { padding: 1rem; } }
  </style>
</head>
<body>
  <h1>🎵 EPK Dashboard — Dossier de Prensa</h1>
  <p class="meta">Generado el ${new Date().toLocaleDateString("es-VE", { year: "numeric", month: "long", day: "numeric" })}</p>

  <h2>Biografía</h2>
  <p class="meta">Artista multidisciplinario con trayectoria en producción musical, composición y performance en vivo. Catálogo que abarca desde rock clásico hasta producción electrónica contemporánea.</p>

  <h2>Contacto</h2>
  <p class="meta"><strong>Email:</strong> booking@epk-dashboard.com</p>
  <p class="meta"><strong>Management:</strong> EPK Dashboard Records</p>

  <div class="footer" style="margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; text-align: center;">
    <p>Generado por EPK Dashboard Musical · ${new Date().getFullYear()}</p>
  </div>
</body>
</html>`;

  const handleDownload = (asset: DownloadableAsset) => {
    setDownloadingId(asset.id);
    setTimeout(() => {
      if (asset.url) {
        window.open(asset.url, "_blank");
      } else {
        let htmlContent = "";
        let filename = "";

        if (asset.category === "Tech Rider") {
          htmlContent = generateRiderHTML();
          filename = "Rider_Tecnico_EPK_Dashboard.html";
        } else if (asset.category === "Ficha EPK") {
          htmlContent = generateDossierHTML();
          filename = "Dossier_Prensa_EPK_Dashboard.html";
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
    <section className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Centro de Descargas & Assets
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
            className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:border-primary-500/50 transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-950/80 text-primary-600 dark:text-primary-400 font-bold text-xs flex items-center justify-center border border-primary-300 dark:border-primary-800/60 flex-shrink-0">
                {asset.format}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {safeString(asset.name)}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
