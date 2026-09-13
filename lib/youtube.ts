export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  duration: string;
  durationSeconds: number;
  thumbnails: Record<string, { url: string; width: number; height: number }>;
  publishedAt: string;
  channelTitle: string;
  tags: string[];
  viewCount: string;
  likeCount: string;
  topicCategories: string[];
}

export function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

export function extractSpotifyId(url: string): string | null {
  const match = url.match(/(?:spotify\.com\/track\/|spotify:track:)([\w-]+)/);
  return match ? match[1] : null;
}

export function extractAppleMusicId(url: string): string | null {
  const match = url.match(/(?:music\.apple\.com\/[a-z]{2}\/album\/[^\/]+\/|music\.apple\.com\/[a-z]{2}\/song\/[^\/]+\/)(\d+)/);
  return match ? match[1] : null;
}

export async function fetchYouTubeVideo(videoId: string): Promise<YouTubeVideo | null> {
  try {
    const res = await fetch(`/api/youtube?id=${videoId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://epk-dashboard.vercel.app'}`;
}

export function getYouTubeThumbnail(videoId: string, quality: 'default' | 'mqdefault' | 'hqdefault' | 'maxresdefault' | 'maxres' = 'maxresdefault'): string {
  const q = quality === 'maxres' ? 'maxresdefault' : quality;
  return `https://img.youtube.com/vi/${videoId}/${q}.jpg`;
}

export function getSpotifyEmbedUrl(trackId: string): string {
  return `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;
}

export function getAppleMusicEmbedUrl(albumId: string): string {
  return `https://embed.music.apple.com/us/album/${albumId}`;
}

// ---------------------------------------------------------------------------
// YouTube Data API v3 — Lightweight Stats Client
// ---------------------------------------------------------------------------

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeVideoStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string; // ISO 8601 like PT4M13S
  title: string;
  thumbnail: string;
}

/**
 * Fetch video statistics via the YouTube Data API v3.
 * Returns `null` when the API key is missing or the request fails.
 */
export async function getVideoStats(videoId: string): Promise<YouTubeVideoStats | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !videoId) return null;

  try {
    const url = `${YOUTUBE_API_BASE}/videos?id=${videoId}&part=statistics,contentDetails,snippet&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items || data.items.length === 0) return null;

    const item = data.items[0];
    const stats = item.statistics;
    const snippet = item.snippet;
    const contentDetails = item.contentDetails;

    return {
      viewCount: parseInt(stats.viewCount || '0', 10),
      likeCount: parseInt(stats.likeCount || '0', 10),
      commentCount: parseInt(stats.commentCount || '0', 10),
      duration: contentDetails?.duration || '',
      title: snippet?.title || '',
      thumbnail: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url || '',
    };
  } catch {
    return null;
  }
}

/**
 * Parse an ISO 8601 duration string (e.g. "PT4M13S") into a human-readable
 * format such as "4:13" or "1:02:05".
 */
export function parseISODuration(duration: string): string {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
