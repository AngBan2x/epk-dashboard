import Link from "next/link";
import { safeString, sumDurations } from "@/lib/null-safe";
import { tracklistDurationLabel } from "@/lib/audio-priority";
import type { Track } from "@/types/music";

interface ReleaseTracklistSectionProps {
  release: Track;
  tracks: Track[];
}

/**
 * Lista de pistas de un LANZAMIENTO (album, EP o single con lados B).
 *
 * Antes no existia. La ficha de un album se maquetaba con la plantilla de una
 * pista suelta, asi que aparecian tarjetas de "Letra no disponible",
 * "Videoclip Oficial - Sin video", "Sin datos de produccion" y
 * "No hay enlaces externos disponibles", y la lista de pistas no aparecia por
 * ningun sitio. Para un periodista que llega desde la pagina del artista, la
 * lista de pistas es justo lo que vino a ver.
 *
 * El orden es por disco y numero de pista (M0), no por `start_time` ni por
 * orden de insercion.
 */
export function ReleaseTracklistSection({ release, tracks }: ReleaseTracklistSectionProps) {
  if (tracks.length === 0) return null;

  const ordered = [...tracks].sort(
    (a, b) =>
      (a.disc_number ?? 1) - (b.disc_number ?? 1) ||
      (a.track_number ?? 999) - (b.track_number ?? 999) ||
      (a.start_time ?? 0) - (b.start_time ?? 0)
  );

  const discs = [...new Set(ordered.map((t) => t.disc_number ?? 1))].sort((a, b) => a - b);
  /**
   * P15 ÔÇö la duraci├│n total sale de `sumDurations` (`lib/null-safe.ts`), no de
   * un parser propio.
   *
   * El que hab├¡a aqu├¡ hac├¡a `const [m, s] = safeString(t.duration).split(":")`:
   * con `"1:02:03"` el array es `[1, 2, 3]`, as├¡ que sumaba `1*60 + 2 = 62`
   * segundos en vez de 3723, y el `isNaN` de guarda NO saltaba porque un
   * array de n├║meros no contiene NaN. El error era silencioso y adem├ís se
   * escrib├¡a de vuelta en la columna `duration`.
   *
   * `sumDurations` adem├ís devuelve `null` (no `0`) cuando no hay nada
   * sumable, para no pintar "0:00" como si un disco reci├®n creado durara cero.
   */
  const totalDuration = sumDurations(ordered.map((t) => t.duration));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Pistas del lanzamiento
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {tracks.length} {tracks.length === 1 ? "pista" : "pistas"}
          {discs.length > 1 ? ` ┬À ${discs.length} discos` : ""}
          {totalDuration ? ` ┬À ${totalDuration.label} en total` : ""}
        </p>
      </div>

      {discs.map((disc) => {
        const rows = ordered.filter((t) => (t.disc_number ?? 1) === disc);
        return (
          <div key={disc} className="mb-4 last:mb-0">
            {discs.length > 1 && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Disco {disc}
              </p>
            )}
            <ol className="flex flex-col gap-1.5">
              {rows.map((track) => {
                const n = track.track_number ?? ordered.indexOf(track) + 1;
                return (
                  <li key={track.id}>
                    <Link
                      href={`/track/${track.id}`}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-primary-500/50 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                    >
                      <span className="w-6 shrink-0 text-center text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400">
                        {n}
                      </span>
                      {/* `truncate` recorta en una sola linea, asi que sin
                          `title` el nombre largo era irrecuperable. Mismo
                          fallo de a11y que se corrigio en EPKCard. */}
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100"
                        title={safeString(track.title)}
                      >
                        {safeString(track.title)}
                      </span>
                      {/* RC.32, tarea 5: esta vista ya imprim├¡a `track.duration` sin mirar los
                          timestamps ÔÇö la que hac├¡a bien. Se unifica con
                          `tracklistDurationLabel` para que las dos vistas no
                          diverjan otra vez.
                          Se pasa **sin** `start_time`/`end_time` a prop├│sito:
                          aqu├¡ el rango de cap├¡tulo no es ni siquiera un recurso,
                          porque una lista de pistas de un lanzamiento no tiene
                          v├¡deo al que atribuirle cap├¡tulos.
                          De paso se cuela el placeholder `"-"` del seed, que el
                          `safeString(...) !== "ÔÇö"` anterior s├¡ pintaba. */}
                      {(() => {
                        const label = tracklistDurationLabel({ duration: track.duration });
                        if (!label.text) return null;
                        return (
                          <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                            {label.text}
                          </span>
                        );
                      })()}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Ficha de{" "}
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {safeString(release.title)}
        </span>{" "}
        en el EPK. Pulsa una pista para ver su ficha completa.
      </p>
    </section>
  );
}
