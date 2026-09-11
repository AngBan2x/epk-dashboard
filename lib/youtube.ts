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

export function getYouTubeThumbnail(videoId: string, quality: 'default' | 'mqdefault' | 'hqdefault' | 'maxresdefault' = 'maxresdefault'): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

export function getSpotifyEmbedUrl(trackId: string): string {
  return `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;
}

export function getAppleMusicEmbedUrl(albumId: string): string {
  return `https://embed.music.apple.com/us/album/${albumId}`;
}
