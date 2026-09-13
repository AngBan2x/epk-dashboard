"use client";

import { useEffect, useState } from "react";
import type {
  LastfmArtistInfo,
  LastfmTrackInfo,
  LastfmTopTrack,
} from "@/lib/lastfm";
import { formatNumber } from "@/lib/null-safe";

interface LastfmMetricsProps {
  artist: string;
  trackTitle?: string;
}

interface LastfmData {
  artist: LastfmArtistInfo | null;
  track: LastfmTrackInfo | null;
  topTracks: LastfmTopTrack[];
}

function Skeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50 animate-pulse">
      <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
      <div className="space-y-3">
        <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    </div>
  );
}

export default function LastfmMetrics({ artist, trackTitle }: LastfmMetricsProps) {
  const [data, setData] = useState<LastfmData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ artist });
    if (trackTitle) {
      params.set("track", trackTitle);
      params.set("method", "track");
    }
    fetch(`/api/lastfm?${params}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [artist, trackTitle]);

  if (loading) return <Skeleton />;
  if (!data?.artist && !data?.track && (!data?.topTracks || data.topTracks.length === 0)) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
          Last.fm
        </span>
      </div>

      {data.track && (
        <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-700/50">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Track</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(data.track.listeners)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Listeners</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(data.track.playcount)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Reproducciones</p>
            </div>
          </div>
          {data.track.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {data.track.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {data.artist && (
        <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-700/50">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Artista</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(data.artist.listeners)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Listeners</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(data.artist.plays)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Reproducciones</p>
            </div>
          </div>
          {data.artist.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {data.artist.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {data.topTracks && data.topTracks.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Top Tracks</p>
          <div className="space-y-1.5">
            {data.topTracks.slice(0, 5).map((t, i) => (
              <div
                key={t.name}
                className="flex items-center gap-3 text-sm"
              >
                <span className="w-4 text-xs text-slate-400 dark:text-slate-500 text-right">
                  {i + 1}
                </span>
                <span className="flex-1 text-slate-700 dark:text-slate-300 truncate">
                  {t.name}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {formatNumber(t.playcount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
