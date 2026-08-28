import { z } from "zod";

export const TopCountrySchema = z.object({
  country: z.string().min(1),
  pct: z.number().min(0).max(100),
});

export const MetricsSchema = z.object({
  streams: z.number().int().min(0),
  saves: z.number().int().min(0),
  playlist_additions: z.number().int().min(0),
  top_countries: z.array(TopCountrySchema),
});

export const ProductionDetailsSchema = z.object({
  daw: z.string().nullable(),
  guitars: z.string().nullable(),
  effects_chain: z.string().nullable(),
  tuning: z.string().nullable(),
  key: z.string().nullable(),
});

export const TrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  release_type: z.string(),
  release_date: z.string(),
  duration: z.string().regex(/^\d{2}:\d{2}$/, "Formato mm:ss"),
  cover_image: z.string().url().or(z.string().startsWith("/")),
  audio_preview_url: z.string().url().or(z.string().startsWith("/")),
  spotify_url: z.string().url().nullable(),
  youtube_video_id: z.string().nullable(),
  metrics: MetricsSchema,
  production_details: ProductionDetailsSchema,
  lyrics: z.string().nullable(),
});

export const ArtistSchema = z.object({
  name: z.string().min(1),
  genre: z.string().min(1),
  location: z.string().min(1),
  monthly_listeners: z.number().int().min(0),
  listeners_growth_pct: z.number(),
});

export type ValidatedTrack = z.infer<typeof TrackSchema>;
export type ValidatedMetrics = z.infer<typeof MetricsSchema>;
export type ValidatedProductionDetails = z.infer<typeof ProductionDetailsSchema>;

export function validateTrack(data: unknown): ValidatedTrack {
  return TrackSchema.parse(data);
}

export function validateTrackSafe(data: unknown) {
  return TrackSchema.safeParse(data);
}

export function validateMetrics(data: unknown): ValidatedMetrics {
  return MetricsSchema.parse(data);
}

export function validateProductionDetails(data: unknown): ValidatedProductionDetails {
  return ProductionDetailsSchema.parse(data);
}
