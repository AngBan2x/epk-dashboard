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
  artist_name: string;
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
  artist_name: string | null;
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

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "artist";
  created_at: string;
}

export interface RawUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface TrackSubmission {
  id: string;
  user_id: string;
  track_data: string; // JSON string of track data
  status: SubmissionStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawTrackSubmissionRow {
  id: string;
  user_id: string;
  track_data: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Like {
  id: string;
  user_id: string;
  track_id: string;
  created_at: string;
}

export interface RawLikeRow {
  id: string;
  user_id: string;
  track_id: string;
  created_at: string;
}

export type NotificationType = "submission_approved" | "submission_rejected" | "new_release" | "track_liked" | "system";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: string | null; // JSON
  read: boolean;
  created_at: string;
}

export interface RawNotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: string | null;
  read: number; // 0 or 1
  created_at: string;
}

export interface MetricsHistory {
  id: string;
  track_id: string;
  date: string; // ISO date string
  streams: number;
  saves: number;
  playlist_additions: number;
  top_countries: TopCountry[];
  source: string; // e.g., "spotify", "apple_music", "webhook"
  created_at: string;
}

export interface RawMetricsHistoryRow {
  id: string;
  track_id: string;
  date: string;
  streams: number;
  saves: number;
  playlist_additions: number;
  top_countries: string; // JSON
  source: string;
  created_at: string;
}
