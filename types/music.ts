export interface TopCountry {
  country: string;
  pct: number;
}

export interface Metrics {
  streams: number;
  saves: number;
  playlist_additions: number;
  top_countries: TopCountry[];
}

export interface ProductionDetails {
  daw: string | null;
  guitars: string | null;
  effects_chain: string | null;
  tuning: string | null;
  key: string | null;
}

export interface StemsUrls {
  drums?: string;
  bass?: string;
  guitars?: string;
  vocals?: string;
  other?: string;
}

export interface Track {
  id: string;
  title: string;
  release_type: string;
  release_date: string;
  duration: string;
  cover_image: string;
  audio_preview_url: string;
  spotify_url: string | null;
  youtube_video_id: string | null;
  metrics: Metrics;
  production_details: ProductionDetails;
  lyrics: string | null;
  // Campos multimedia F8
  itunes_track_id?: string | null;
  stems_urls?: StemsUrls | null;
  video_embed_url?: string | null;
  gallery_images?: string[] | null;
}

export interface Artist {
  name: string;
  genre: string;
  location: string;
  monthly_listeners: number;
  listeners_growth_pct: number;
}

export interface CatalogData {
  artist: Artist;
  tracks: Track[];
}

export interface RawTrackRow {
  id: string;
  title: string;
  release_type: string | null;
  release_date: string | null;
  duration: string | null;
  cover_image: string | null;
  audio_preview_url: string | null;
  spotify_url: string | null;
  youtube_video_id: string | null;
  metrics: string | null;
  production_details: string | null;
  lyrics: string | null;
  // Campos multimedia F8
  itunes_track_id?: string | null;
  stems_urls?: string | null;
  video_embed_url?: string | null;
  gallery_images?: string | null;
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}
