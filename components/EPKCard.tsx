import { Card, CardContent } from "@/components/ui/Card";
import type { Track } from "@/types/music";
import { safeString, formatDuration, formatNumber } from "@/lib/null-safe";
import { AudioPlayer } from "@/components/AudioPlayer";

interface EPKCardProps {
  track: Track;
}

export function EPKCard({ track }: EPKCardProps) {
  const title = safeString(track.title);
  const duration = formatDuration(track.duration);
  const streams = formatNumber(track.metrics?.streams ?? 0);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="aspect-square bg-slate-100 dark:bg-dark-700 relative overflow-hidden">
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
        </div>
      </CardContent>
    </Card>
  );
}