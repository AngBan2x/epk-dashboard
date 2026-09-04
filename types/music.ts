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
  // P2.5: New fields
  external_links?: ExternalLinks | null;
  disc_number?: number;
  is_double_single?: boolean;
  sides_b?: string[] | null;
  isrc?: string | null;
  composers?: string[] | null;
}

export interface ExternalLinks {
  spotify?: string;
  apple_music?: string;
  youtube?: string;
  soundcloud?: string;
  bandcamp?: string;
  tiktok?: string;
  instagram?: string;
  [key: string]: string | undefined;
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
  // P2.5: New fields
  external_links?: string | null;
  disc_number?: number | null;
  is_double_single?: number | null;
  sides_b?: string | null;
  isrc?: string | null;
  composers?: string | null;
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
  // P2.2: New fields
  preferences: UserPreferences | null;
  avatar: string | null;
  email_verified: boolean;
  deleted_at: string | null;
  last_login: string | null;
  created_at: string;
}

export interface UserPreferences {
  email_notifications: boolean;
  push_notifications: boolean;
  new_release_alerts: boolean;
  show_alerts: boolean;
  marketing_emails: boolean;
}

export interface RawUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  preferences: string | null;
  avatar: string | null;
  email_verified: number;
  deleted_at: string | null;
  last_login: string | null;
  created_at: string;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type SubmissionType = "track" | "release" | "show";

export interface TrackSubmission {
  id: string;
  user_id: string;
  track_data: string; // JSON string of track data
  status: SubmissionStatus;
  admin_notes: string | null;
  // P2.6: New fields
  submission_type: SubmissionType;
  metadata: string | null; // JSON object for additional metadata
  admin_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawTrackSubmissionRow {
  id: string;
  user_id: string;
  track_data: string;
  status: string;
  admin_notes: string | null;
  submission_type: string;
  metadata: string | null;
  admin_id: string | null;
  reviewed_at: string | null;
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

export interface ArtistProfile {
  id: string;
  name: string;
  user_id: string | null;
  biography: string | null;
  press_text: string | null;
  press_highlights: string[] | null;
  genre: string | null;
  location: string | null;
  monthly_listeners: number;
  // P2.1: New fields
  social_links: SocialLink[] | null;
  profile_image: string | null;
  banner_image: string | null;
  slug: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface SocialLink {
  platform: string;
  url: string;
  label?: string;
}

export interface CreateArtistInput {
  name: string;
  userId?: string;
  biography?: string;
  pressText?: string;
  pressHighlights?: string[];
  genre?: string;
  location?: string;
  monthly_listeners?: number;
  // P2.1: New fields
  socialLinks?: SocialLink[];
  profileImage?: string;
  bannerImage?: string;
  slug?: string;
  isActive?: boolean;
}

// Shows & Booking
export type ShowStatus = "disponible" | "agotado" | "proximamente" | "vip" | "cancelado" | "pausado";

export interface Show {
  id: string;
  artist_id: string;
  venue_name: string;
  city: string | null;
  country: string | null;
  date: string | null;
  time: string | null;
  price_range: string | null;
  status: ShowStatus;
  ticket_url: string | null;
  // P2.4: New fields
  payment_methods: PaymentMethod[] | null;
  postponement_reason: string | null;
  flyer_url: string | null;
  ticket_link: string | null;
  description: string | null;
  guest_artists: GuestArtist[] | null;
  notes: string | null;
  deleted_at: string | null;
  updated_at: string | null;
  created_at: string;
}

export interface PaymentMethod {
  type: "cash" | "card" | "transfer" | "ticket_platform" | "other";
  details?: string;
  platform_url?: string;
}

export interface GuestArtist {
  name: string;
  role?: string;
}

export interface RawShowRow {
  id: string;
  artist_id: string;
  venue_name: string;
  city: string | null;
  country: string | null;
  date: string | null;
  time: string | null;
  price_range: string | null;
  status: string;
  ticket_url: string | null;
  payment_methods: string | null;
  postponement_reason: string | null;
  flyer_url: string | null;
  ticket_link: string | null;
  description: string | null;
  guest_artists: string | null;
  notes: string | null;
  deleted_at: string | null;
  updated_at: string | null;
  created_at: string;
}

export interface CreateShowInput {
  artist_id: string;
  venue_name: string;
  city?: string;
  country?: string;
  date?: string;
  time?: string;
  price_range?: string;
  status?: ShowStatus;
  ticket_url?: string;
  payment_methods?: PaymentMethod[];
  postponement_reason?: string;
  flyer_url?: string;
  ticket_link?: string;
  description?: string;
  guest_artists?: GuestArtist[];
  notes?: string;
}

// P2.3: Subscriptions
export interface Subscription {
  id: string;
  subscriber_id: string;
  artist_id: string;
  notify_releases: boolean;
  notify_shows: boolean;
  created_at: string;
}

export interface RawSubscriptionRow {
  id: string;
  subscriber_id: string;
  artist_id: string;
  notify_releases: number;
  notify_shows: number;
  created_at: string;
}
