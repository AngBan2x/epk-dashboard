import { extractSpotifyId, extractAppleMusicId } from './youtube';

export type AudioSourceType = 'preview' | 'spotify' | 'apple_music' | 'youtube';

export interface AudioSource {
  type: AudioSourceType;
  url: string;
  embedUrl?: string;
  videoId?: string;
  priority: number;
  label: string;
}

export interface TrackAudioInfo {
  audio_preview_url?: string | null;
  spotify_url?: string | null;
  apple_music_url?: string | null;
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  external_links?: Record<string, unknown> | null;
}

function extractSpotifyTrackId(url: string): string | null {
  const match = url.match(/(?:spotify\.com\/track\/|spotify:track:)([\w-]{22})/);
  return match ? match[1] : null;
}

function extractAppleMusicTrackId(url: string): string | null {
  const match = url.match(/(?:music\.apple\.com\/[a-z]{2}\/song\/[^\/]+\/)(\d+)/);
  return match ? match[1] : null;
}

function getSpotifyEmbedUrl(trackId: string): string {
  return `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;
}

function getAppleMusicEmbedUrl(trackId: string): string {
  return `https://embed.music.apple.com/us/song/${trackId}`;
}

export function getAudioSources(track: TrackAudioInfo): AudioSource[] {
  const sources: AudioSource[] = [];
  const external = track.external_links as Record<string, unknown> | undefined;

  // 1. Preview directo (iTunes/Spotify 30s) - MÁXIMA PRIORIDAD
  if (track.audio_preview_url) {
    sources.push({
      type: 'preview',
      url: track.audio_preview_url,
      priority: 100,
      label: 'Preview (30s)',
    });
  }

  // 2. Spotify = Apple Music (mismo nivel) - PRIORIDAD ALTA
  const spotifyId = track.spotify_url ? extractSpotifyTrackId(track.spotify_url) : 
    external?.spotify ? extractSpotifyTrackId(external.spotify as string) : null;
  
  if (spotifyId) {
    sources.push({
      type: 'spotify',
      url: track.spotify_url || `https://open.spotify.com/track/${spotifyId}`,
      embedUrl: `https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0`,
      priority: 90,
      label: 'Spotify',
    });
  }

  const appleMusicId = track.apple_music_url ? extractAppleMusicTrackId(track.apple_music_url) :
    external?.apple_music ? extractAppleMusicTrackId(external.apple_music as string) : null;

  if (appleMusicId) {
    sources.push({
      type: 'apple_music',
      url: track.apple_music_url || `https://music.apple.com/song/${appleMusicId}`,
      embedUrl: `https://embed.music.apple.com/us/song/${appleMusicId}`,
      priority: 90,
      label: 'Apple Music',
    });
  }

  // 3. YouTube iframe embed - MENOR PRIORIDAD
  const youtubeId = track.youtube_video_id || external?.youtube_video_id as string | undefined;
  if (youtubeId) {
    sources.push({
      type: 'youtube',
      url: `https://www.youtube.com/watch?v=${youtubeId}`,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL || 'https://epk-dashboard.vercel.app')}`,
      videoId: youtubeId,
      priority: 50,
      label: 'YouTube',
    });
  }

  // Ordenar por prioridad descendente
  return sources.sort((a, b) => b.priority - a.priority);
}

export function getPrimaryAudioSource(track: TrackAudioInfo): AudioSource | null {
  const sources = getAudioSources(track);
  return sources[0] || null;
}

export function getAudioSourceByType(track: TrackAudioInfo, type: AudioSourceType): AudioSource | null {
  const sources = getAudioSources(track);
  return sources.find(s => s.type === type) || null;
}

export function hasStreamingSource(track: TrackAudioInfo): boolean {
  const sources = getAudioSources(track);
  return sources.some(s => s.type === 'spotify' || s.type === 'apple_music' || s.type === 'preview');
}

export function isYouTubeOnly(track: TrackAudioInfo): boolean {
  const sources = getAudioSources(track);
  return sources.length > 0 && sources.every(s => s.type === 'youtube');
}
