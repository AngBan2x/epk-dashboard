"use client";

import { useState, useEffect } from "react";
import { formatNumber } from "@/lib/null-safe";
import {
  reasonMessageEs,
  reasonNoteEs,
  type IntegrationReason,
} from "@/lib/integration-reasons";

const YOUTUBE = "YouTube";

interface UnifiedMetricsProps {
  streamCount: number;
  /**
   * Fase E: antes el caller pasaba `likeCount={0}` inventado y, si YouTube
   * fallaba, la celda caía a ese 0. Ahora `null`/undefined significa "no hay
   * dato de PressPlay" y la celda lo dice en vez de mostrar un número falso.
   */
  likeCount?: number | null;
  saves: number;
  playlists: number;
  youtubeVideoId?: string | null;
}

type YtState =
  | { status: "loading" }
  | { status: "ok"; viewCount: number; likeCount: number }
  | { status: "error"; reason: IntegrationReason };

export function UnifiedMetrics({
  streamCount,
  likeCount = null,
  saves,
  playlists,
  youtubeVideoId,
}: UnifiedMetricsProps) {
  const [yt, setYt] = useState<YtState>({ status: "loading" });

  useEffect(() => {
    if (!youtubeVideoId) {
      setYt({ status: "error", reason: "not_found" });
      return;
    }
    let cancelled = false;
    fetch(`/api/youtube/stats?videoId=${encodeURIComponent(youtubeVideoId)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!json) throw new Error("respuesta ilegible");
        if (typeof json.viewCount === "number" && typeof json.likeCount === "number") {
          return { status: "ok", viewCount: json.viewCount, likeCount: json.likeCount } as const;
        }
        // La ruta ya manda el motivo discriminado; si no viene, "upstream".
        return {
          status: "error",
          reason: (json.reason as IntegrationReason) ?? "upstream",
        } as const;
      })
      .then((next) => {
        if (!cancelled) setYt(next);
      })
      .catch(() => {
        if (!cancelled) setYt({ status: "error", reason: "network" });
      });
    return () => {
      cancelled = true;
    };
  }, [youtubeVideoId]);

  const hasVideo = !!youtubeVideoId;
  const ytOk = yt.status === "ok";
  const ytReason: IntegrationReason | null = yt.status === "error" ? yt.reason : null;
  /** El fetch de YouTube aún no ha respondido: no se inventa nada mientras tanto. */
  const ytPending = yt.status === "loading";

  const streamsValue = ytOk ? formatNumber(yt.viewCount) : hasVideo ? "—" : formatNumber(streamCount);
  const streamsTitle = ytOk
    ? "Reproducciones en YouTube"
    : ytReason
      ? reasonMessageEs(ytReason, YOUTUBE)
      : "Streams registrados en PressPlay (este track no tiene video de YouTube)";
  // Nota visible (el `title` solo sale en hover y en móvil no existe): solo
  // tiene sentido cuando NO hay número que enseñar.
  const streamsNote = ytPending
    ? "Consultando YouTube…"
    : ytOk
      ? null
      : ytReason
        ? hasVideo
          ? reasonNoteEs(ytReason, YOUTUBE)
          : "Sin video de YouTube"
        : null;

  const likesValue = ytOk
    ? formatNumber(yt.likeCount)
    : hasVideo
      ? "—"
      : likeCount != null
        ? formatNumber(likeCount)
        : "—";
  const likesTitle = ytOk
    ? "Likes en YouTube"
    : ytReason
      ? reasonMessageEs(ytReason, YOUTUBE)
      : likeCount != null
        ? "Likes registrados en PressPlay"
        : "PressPlay no registra los likes de este track";
  const likesNote = ytPending
    ? "Consultando YouTube…"
    : ytOk
      ? null
      : ytReason
        ? hasVideo
          ? reasonNoteEs(ytReason, YOUTUBE)
          : "Sin datos de likes"
        : likeCount == null
          ? "Sin datos aún"
          : null;

  return (
    <div className="border-t border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50 px-5 sm:px-6 lg:px-8 py-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCell
          value={streamsValue}
          label={ytOk && yt.viewCount === 1 ? "Stream" : "Streams"}
          title={streamsTitle}
          note={streamsNote}
        />
        <MetricCell
          value={likesValue}
          label="Likes"
          title={likesTitle}
          note={likesNote}
          borderClassName="border-x border-slate-200 dark:border-slate-700"
        />
        <MetricCell
          value={formatNumber(saves)}
          label="Guardados"
          title="Guardados en PressPlay"
          note={saves === 0 ? "Sin datos aún" : null}
          borderClassName="sm:border-x border-slate-200 dark:border-slate-700"
        />
        <MetricCell
          value={formatNumber(playlists)}
          label="Listas"
          title="Veces que el track se añadió a una lista"
          note={playlists === 0 ? "Sin datos aún" : null}
        />
      </div>
    </div>
  );
}

interface MetricCellProps {
  value: string;
  label: string;
  title: string;
  note: string | null;
  borderClassName?: string;
}

function MetricCell({ value, label, title, note, borderClassName = "" }: MetricCellProps) {
  return (
    <div className={`text-center ${borderClassName}`}>
      {/* El `title` solo aparece en hover, así que el mismo texto se repite en
          `sr-only`: un lector de pantalla también sabe de dónde sale el número. */}
      <p
        className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100"
        title={title}
      >
        {value}
        <span className="sr-only">. {title}</span>
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      {note && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{note}</p>
      )}
    </div>
  );
}
