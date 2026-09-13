"use client";

import { useState, useEffect } from "react";
import { formatNumber } from "@/lib/null-safe";

interface UnifiedMetricsProps {
  streamCount: number;
  likeCount: number;
  saves: number;
  playlists: number;
  youtubeVideoId?: string | null;
}

export function UnifiedMetrics({
  streamCount,
  likeCount,
  saves,
  playlists,
  youtubeVideoId,
}: UnifiedMetricsProps) {
  const [youtubeStats, setYoutubeStats] = useState<{
    viewCount: number;
    likeCount: number;
  } | null>(null);

  useEffect(() => {
    if (youtubeVideoId) {
      fetch(`/api/youtube/stats?videoId=${youtubeVideoId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setYoutubeStats)
        .catch(() => {});
    }
  }, [youtubeVideoId]);

  return (
    <div className="border-t border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50 px-5 sm:px-6 lg:px-8 py-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center">
          <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatNumber(youtubeStats?.viewCount ?? streamCount)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Streams
          </p>
        </div>
        <div className="text-center border-x border-slate-200 dark:border-slate-700">
          <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatNumber(youtubeStats?.likeCount ?? likeCount)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Likes
          </p>
        </div>
        <div className="text-center sm:border-x border-slate-200 dark:border-slate-700">
          <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatNumber(saves)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Saves
          </p>
          {saves === 0 && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Próximamente
            </p>
          )}
        </div>
        <div className="text-center">
          <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatNumber(playlists)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Playlists
          </p>
          {playlists === 0 && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Próximamente
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
