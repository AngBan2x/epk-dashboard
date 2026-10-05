"use client";

import { useState } from "react";
import { safeString } from "@/lib/null-safe";

/**
 * Grid único de descargas: **3 secciones × 3 formatos**.
 *
 * ## Por qué un solo componente
 *
 * Antes había dos widgets con la misma descarga duplicada:
 *
 * - `DownloadCenter` declaraba 5 opciones, de las cuales `catalog-json` y
 *   `catalog-html` eran **el mismo `include: ["catalog"]` con distinto
 *   `format`**, y `press-pdf` (las 3 secciones en PDF) desaparecía en cuanto
 *   la rejilla 3×3 existía, según el ancho del contenedor.
 * - `CatalogDownloadButton` repetía las dos opciones de catálogo.
 *
 * El backend ya soporta las 9 combinaciones: `POST /api/export` acepta
 * `format: html|json|pdf` de forma uniforme (`app/api/export/route.ts`) y las
 * tres secciones tienen renderizador en los tres formatos. Faltaba la UI, no el
 * backend. Este archivo es esa UI: `DownloadCenter` monta el mismo grid dentro de
 * su tarjeta, así que ya no hay dos listas de descargas que puedan divergir.
 *
 * ## Alcance: siempre por artista
 *
 * `dossier` y `rider` exigen `artist_id` en servidor
 * (`lib/export-bundle.ts` responde 400 sin él). El catálogo es la única sección
 * que funciona sin él, y en ese caso significa "catálogo público del PressPlay",
 * que es exactamente lo que devuelve el export sin `artist_id`.
 *
 * ## Sin `artist_id` no se montan las filas, no se deshabilitan
 *
 * Antes, sin artista, la rejilla pintaba las 3 filas y ponía `disabled` en las
 * 6 celdas de dossier y rider, con un `title` que explicaba por qué. El usuario
 * pidió lo contrario, y tenía razón: **6 botones muertos son 6 botones que
 * parecen una avería**. Un control deshabilitado promete algo que no va a pasar;
 * un botón que no existe no promete nada. La vista de invitado del catálogo y
 * la ficha pública de un artista muestran ahora exactamente lo mismo —una fila
 * y tres celdas vivas— en lugar de dos definiciones de "invitado".
 *
 * El filtro es `DOWNLOAD_ROWS.filter(...)`, no una constante aparte: si
 * mañana aparece una cuarta sección, hereda la regla por estar en el array en
 * lugar de porfigurarse a mano.
 */

type DownloadSection = "dossier" | "rider" | "catalog";
type DownloadFormat = "html" | "json" | "pdf";

interface DownloadRow {
  /** Id de la sección. Va tal cual en `include`, por eso es `dossier|rider|catalog`. */
  id: DownloadSection;
  name: string;
  /**
   * Descripción del CONTENIDO, no del formato: el formato es el propio botón.
   * Se corrigieron tres afirmaciones falsas del copy anterior:
   * el dossier no imprime métricas, el rider no trae stage plot, y la ficha
   * imprimible del catálogo no tiene portada (`catalogTrackFields` no tiene
   * campo de portada y `catalogTrackHtml` no renderiza ningún `<img>`).
   */
  description: string;
  /** Sin `artist_id` el servidor responde 400. */
  requiresArtist: boolean;
}

export const DOWNLOAD_ROWS: readonly DownloadRow[] = [
  {
    id: "dossier",
    name: "Dossier de prensa",
    description: "Biografía, género, notas de prensa, contactos y enlaces",
    requiresArtist: true,
  },
  {
    id: "rider",
    name: "Rider técnico",
    description: "PA, monitores, backline, escenario, hospitality y transporte",
    requiresArtist: true,
  },
  {
    id: "catalog",
    name: "Catálogo",
    description: "Cada lanzamiento con duración, métricas y enlaces a plataformas",
    requiresArtist: false,
  },
];

export const DOWNLOAD_FORMATS: ReadonlyArray<{ id: DownloadFormat; label: string }> = [
  { id: "html", label: "HTML" },
  { id: "json", label: "JSON" },
  { id: "pdf", label: "PDF" },
];

type CellStatus = "idle" | "loading";

interface DownloadGridProps {
  /**
   * Id del artista en `artists`. **Obligatorio** para las filas de dossier y
   * rider: sin él esas dos filas no se montan (y el catálogo sigue saliendo), en
   * vez de pintarse deshabilitadas o de fallar con un 400.
   */
  artistId?: string | null;
  /** Solo se usa en las etiquetas accesibles y en el nombre de reserva. */
  artistName?: string;
  className?: string;
}

/**
 * El nombre del archivo lo decide el servidor en `Content-Disposition`
 * (`lib/export-bundle.ts`), que ya incluye el slug del artista cuando el
 * export es por artista. Antes se fijaba `PressPlay_Catalogo.json` a mano, así
 * que cualquier cambio de nombre en el backend se perdía en silencio.
 */
function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(header);
  return match?.[1] ?? fallback;
}

/**
 * El grid vive en un contenedor con `container-type: inline-size` y decide por
 * **container query**, no por breakpoint de viewport. Se usa en dos contenedores
 * muy distintos: la página de artista (grid de 1248px, celdas de ~618px) y la
 * barra lateral de `/track/[id]` (celda de 304-347px). Un breakpoint de viewport
 * sabe el ancho de la ventana, no el del componente, y con `sm:grid-cols-2` la
 * barra lateral se partía en celdas de 146px donde el texto se quedaba en 0px.
 * Medido con `scripts/rc30-measure-ficha.ts`:
 *
 *     390px   card=358  celda=316  texto=154   OK
 *     768px   card=720  celda=333  texto=171   OK
 *    1024px   card=304  celda=125  texto=  0   ROTO
 *    1280px   card=347  celda=146  texto=  0   ROTO
 *    1440px   card=347  celda=146  texto=  0   ROTO
 *
 * Las tres celdas de formato van siempre en 3 columnas y no se reparten: los
 * botones son cortos ("HTML", "JSON", "PDF") y caben incluso en 304px, que es el
 * caso más estrecho. Lo que crece con el ancho es el hueco entre ellos.
 */
export function DownloadGrid({ artistId, artistName = "PressPlay", className = "" }: DownloadGridProps) {
  const artist = safeString(artistId, "");
  const slug = artistName.replace(/[^a-zA-Z0-9]/g, "") || "PressPlay";
  const [statusByCell, setStatusByCell] = useState<Record<string, CellStatus>>({});
  const [error, setError] = useState<string | null>(null);

  /**
   * Sin `artist_id` solo se monta la sección que el servidor puede servir. La
   * lista se calcula aquí y no dentro del `map` para que "qué se ve" se lea de
   * un solo sitio: el `map` ya no puede decidir qué existe.
   */
  const rows = artist === "" ? DOWNLOAD_ROWS.filter((row) => !row.requiresArtist) : DOWNLOAD_ROWS;

  const handleDownload = async (row: DownloadRow, format: DownloadFormat) => {
    // Invariante, no camino vivo: `rows` ya filtró las secciones que exigen
    // artista cuando no hay `artist_id`, así que aquí no se puede llegar. Se
    // deja escrito porque es el único sitio donde se comprueba, y porque un 400
    // del servidor en un botón que el usuario ha pulsado es la peor forma de
    // descubrir que el filtro se rompió.
    if (row.requiresArtist && artist === "") {
      setError("El dossier y el rider necesitan un artist_id, y esta vista no tiene ninguno.");
      return;
    }

    const cell = `${row.id}:${format}`;
    setStatusByCell((prev) => ({ ...prev, [cell]: "loading" }));
    setError(null);

    try {
      const body: { format: DownloadFormat; include: DownloadSection[]; artist_id?: string } = {
        format,
        include: [row.id],
      };
      if (artist !== "") body.artist_id = artist;

      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "No se pudo generar el archivo");
      }

      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("Content-Disposition"),
        `PressPlay_${row.id}_${slug}.${format}`
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setStatusByCell((prev) => ({ ...prev, [cell]: "idle" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el archivo. Inténtalo de nuevo.");
      setStatusByCell((prev) => ({ ...prev, [cell]: "idle" }));
    }
  };

  return (
    <div className={`[container-type:inline-size] ${className}`.trim()}>
      {/*
        La única fuente de verdad de "qué filas existen" es el filtro. Las
        secciones que exigen artista desaparecen del DOM, así que tampoco
        quedan celdas `disabled` que un lector de pantalla anuncie como
        "no disponible" ni que un tabulador de teclado tenga que saltar.
      */}
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-primary-500/50 dark:border-slate-700 dark:bg-slate-900/60"
          >
            <div className="mb-2 min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                {safeString(row.name)}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                {row.description}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 [@container(min-width:30rem)]:gap-3">
              {DOWNLOAD_FORMATS.map((format) => {
                const cell = `${row.id}:${format.id}`;
                const loading = statusByCell[cell] === "loading";
                return (
                  <button
                    key={format.id}
                    type="button"
                    data-section={row.id}
                    data-format={format.id}
                    onClick={() => handleDownload(row, format.id)}
                    disabled={loading}
                    aria-label={`Descargar ${row.name} de ${artistName} en ${format.label}`}
                    title={`Descargar ${row.name} en ${format.label}`}
                    className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-primary-600 px-2 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 [@container(min-width:30rem)]:px-2.5"
                  >
                    {loading ? "Generando…" : format.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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
            className="inline-flex min-h-[36px] items-center rounded border border-red-400 px-2 py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Punto de entrada para las páginas que solo montan el grid
 * (`/track/[id]`, `/dashboard`). Mismo componente que el de la página de
 * artista: no hay dos widgets que mantener en paralelo.
 */
export function CatalogDownloadButton(props: DownloadGridProps) {
  return <DownloadGrid {...props} />;
}
