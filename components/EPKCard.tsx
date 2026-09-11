"use client";

import { Card, CardContent } from "@/components/ui/Card";
import type { Track } from "@/types/music";
import {
  safeString,
  formatDuration,
  formatNumber,
  capitalizeReleaseType,
  getCoverImage,
} from "@/lib/null-safe";
import { AudioPlayer } from "@/components/AudioPlayer";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

interface EPKCardProps {
  track: Track;
  initialLiked?: boolean;
  initialLikeCount?: number;
  onLoginPrompt?: () => void;
}

export function EPKCard({ track, initialLiked = false, initialLikeCount = 0, onLoginPrompt }: EPKCardProps) {
  const { user } = useAuth();
  const title = safeString(track.title);
  const artistName = safeString(track.artist_name);
  const duration = formatDuration(track.duration);
  const streams = formatNumber(track.metrics?.streams ?? 0);
  const releaseDate = track.release_date ? new Date(track.release_date).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }) : "—";
  const isrc = safeString(track.isrc);
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [animating, setAnimating] = useState(false);
  const [loading, setLoading] = useState(false);

  // Badge "Nuevo Lanzamiento" — track released in the last 7 days
  const isNewRelease = (() => {
    if (!track.release_date) return false;
    const releaseDateObj = new Date(track.release_date);
    const now = new Date();
    const diffMs = now.getTime() - releaseDateObj.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  })();

  useEffect(() => {
    // Fetch initial like count and user's liked state
    const fetchLikes = async () => {
      try {
        const params = new URLSearchParams({ track_id: track.id });
        const res = await fetch(`/api/likes?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.count !== undefined) setLikeCount(data.count);
          if (data.liked !== undefined) setLiked(data.liked);
        }
      } catch {
        // Silently fail, use initial values
      }
    };
    fetchLikes();
  }, [track.id]);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Show login prompt for guests
    if (!user) {
      onLoginPrompt?.();
      return;
    }

    if (loading) return;
    setLoading(true);
    setAnimating(true);

    try {
      const response = await fetch("/api/likes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ track_id: track.id }),
      });

      if (response.ok) {
        const data = await response.json();
        setLiked(data.liked);
        setLikeCount(data.count);
      }
    } catch (error) {
      console.error("Like error:", error);
    } finally {
      setLoading(false);
      setTimeout(() => setAnimating(false), 300);
    }
  };

  const coverImage = getCoverImage(track);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
      <div className="aspect-square bg-slate-100 dark:bg-slate-700 relative overflow-hidden flex-shrink-0">
        {coverImage ? (
          <img
            src={coverImage}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-3xl">
            🎵
          </div>
        )}
        {/* Like button overlay */}
        <button
          onClick={handleLike}
          disabled={loading}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label={liked ? "Quitar like" : "Dar like"}
          aria-pressed={liked}
        >
          <span
            className={`inline-block transition-all duration-300 ${
              animating ? "animate-heartbeat" : ""
            } ${liked ? "text-red-500" : "text-slate-400 dark:text-slate-500 hover:text-red-500"}`}
            style={{ fontSize: "1.5rem", lineHeight: 1 }}
          >
            {liked ? "❤️" : "🤍"}
          </span>
        </button>
        {/* Badge "Nuevo Lanzamiento" */}
        {isNewRelease && (
          <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg animate-pulse">
            ✨ Nuevo
          </div>
        )}
      </div>
      <CardContent className="flex flex-col flex-grow p-4">
        <h3 className="font-semibold text-lg mb-1 truncate text-slate-900 dark:text-white">{title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-1">{artistName}</p>

        {/* Metadata: Release type, Duration, Release Date, ISRC */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
            {capitalizeReleaseType(track.release_type)}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {duration}
          </span>
          {track.release_date && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {releaseDate}
              </span>
            </>
          )}
          {track.isrc && track.isrc !== "—" && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-mono">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                ISRC: {isrc}
              </span>
            </>
          )}
        </div>

        <AudioPlayer
          id={track.id}
          src={track.audio_preview_url}
          title={track.title}
          artist={track.artist_name || undefined}
          coverImage={coverImage || undefined}
          track={track}
        />

        {/* Stats footer: streams, saves, likes */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {streams}
            </span>
            <span className="inline-flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              {formatNumber(track.metrics?.saves ?? 0)}
            </span>
          </div>
          <div className={`inline-flex items-center gap-1 ${liked ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>
            <span className={animating ? "animate-heartbeat" : ""} style={{ fontSize: "0.875rem", lineHeight: 1 }}>
              {liked ? "❤️" : "🤍"}
            </span>
            <span>{formatNumber(likeCount)}</span>
          </div>
        </div>
      </CardContent>
      <style jsx>{`
        @keyframes heartbeat {
          0% { transform: scale(1); }
          25% { transform: scale(1.3); }
          50% { transform: scale(1); }
          75% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .animate-heartbeat {
          animation: heartbeat 0.6s ease-in-out;
        }
      `}</style>
    </Card>
  );
}