"use client";

import { Card, CardContent } from "@/components/ui/Card";
import type { Track } from "@/types/music";
import { safeString, formatDuration, formatNumber } from "@/lib/null-safe";
import { AudioPlayer } from "@/components/AudioPlayer";
import { useState, useEffect } from "react";

interface EPKCardProps {
  track: Track;
  initialLiked?: boolean;
  initialLikeCount?: number;
}

export function EPKCard({ track, initialLiked = false, initialLikeCount = 0 }: EPKCardProps) {
  const title = safeString(track.title);
  const duration = formatDuration(track.duration);
  const streams = formatNumber(track.metrics?.streams ?? 0);
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [animating, setAnimating] = useState(false);
  const [loading, setLoading] = useState(false);

  // Badge "Nuevo Lanzamiento" — track released in the last 7 days
  const isNewRelease = (() => {
    if (!track.release_date) return false;
    const releaseDate = new Date(track.release_date);
    const now = new Date();
    const diffMs = now.getTime() - releaseDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  })();

  useEffect(() => {
    // Fetch initial like count
    fetch(`/api/likes?track_id=${track.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.count !== undefined) {
          setLikeCount(data.count);
        }
        if (data.liked !== undefined) {
          setLiked(data.liked);
        }
      })
      .catch(() => {
        // Silently fail, use initial values
      });
  }, [track.id]);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

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
      // Reset animation after it completes
      setTimeout(() => setAnimating(false), 300);
    }
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="aspect-square bg-slate-100 dark:bg-slate-700 relative overflow-hidden">
        {track.cover_image && track.cover_image !== "—" ? (
          <img
            src={track.cover_image}
            alt={title}
            className="w-full h-full object-cover"
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
            } ${liked ? "text-red-500" : "text-slate-500 hover:text-red-500"}`}
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
      <CardContent>
        <h3 className="font-semibold text-lg mb-1 truncate">{title}</h3>
        <p className="text-sm text-slate-500 mb-2">
          {track.release_type} · {duration}
        </p>
        <AudioPlayer
          id={track.id}
          src={track.audio_preview_url}
          title={track.title}
          coverImage={track.cover_image}
        />
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
          <span>▶ {streams} streams</span>
          <span>·</span>
          <span>♥ {formatNumber(track.metrics?.saves ?? 0)}</span>
          <span>·</span>
          <span className={liked ? "text-red-500" : "text-slate-400"}>
            🤍 {likeCount}
          </span>
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