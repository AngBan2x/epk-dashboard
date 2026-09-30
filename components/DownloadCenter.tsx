"use client";

import React from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge, CountBadge } from "@/components/ui/Badge";
import { DownloadGrid } from "@/components/CatalogDownloadButton";
import { safeString } from "@/lib/null-safe";

interface DownloadCenterProps {
  /**
   * Id del artista en `artists`. Sin él, las 6 celdas de dossier y rider quedan
   * deshabilitadas con su explicación en el propio botón, y el catálogo sigue
   * funcionando (como catálogo público, que es lo que el export hace sin
   * `artist_id`).
   */
  artistId?: string;
  artistName?: string;
  trackCount?: number;
  className?: string;
}

export function DownloadCenter({
  artistId,
  artistName = "Artista",
  trackCount = 0,
  className = "",
}: DownloadCenterProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 p-6 dark:border-slate-700 dark:bg-slate-800 ${className}`}
    >
      <SectionHeader
        emoji="📥"
        title="Descargas para prensa"
        subtitle="Cada archivo se genera en el servidor al pulsar su botón, con los datos publicados en ese momento"
        badges={
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <Badge variant="emerald">Sin coste</Badge>
            <CountBadge>{trackCount || 0} tracks incluidos</CountBadge>
          </div>
        }
      />

      {/*
        El grid (3 secciones × 3 formatos) vive en `CatalogDownloadButton` y esta
        tarjeta lo monta. Antes esta página declaraba sus PROPIAS 5 opciones, dos
        de las cuales eran el mismo `include: ["catalog"]` con distinto `format`,
        y el bundle PDF en las 3 secciones solo aparecía cuando la rejilla 3×3 no
        cabía. Ahora las 9 combinaciones salen del mismo sitio.

        El subtítulo anterior decía "Todo se genera en el servidor con tus datos
        más recientes", y esta tarjeta se monta también en la página pública del
        artista, donde el visitante no es el artista: era una afirmación falsa
        sobre a quién pertenecía el documento.

        No hay un botón de "Actualizar datos del dossier" a propósito.
        `refreshDossier` hacía `GET /api/dossiers?artist_id=...`, descartaba la
        respuesta y solo incrementaba un contador `dossierRevision` que se volcaba
        en `data-dossier-revision`, atributo que no leía nadie en el repo
        (verificado con git grep sobre app/, components/, lib/, scripts/ y
        tests/). Es decir: era código muerto. Se puede eliminar porque no hay nada
        que "actualizar": no hay cache de dossier, ni archivo pregenerado, ni
        columna de versión en la base de datos. `POST /api/export` lee fresco de
        Turso en cada clic (`lib/export-bundle.ts`) y responde con
        `Cache-Control: no-store` (`app/api/export/route.ts`), así que el flujo
        "guardar y se actualiza solo" ya funciona y no necesita un botón que no
        hacía nada.
      */}
      <DownloadGrid artistId={artistId} artistName={safeString(artistName, "Artista")} />
    </div>
  );
}
