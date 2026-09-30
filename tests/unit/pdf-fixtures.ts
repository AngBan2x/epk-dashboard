import type { Track } from "@/types/music";
import type { DossierData } from "@/lib/db";

/**
 * Fixtures del PDF. Viven aparte para que se puedan importar desde el factory de
 * `vi.mock`, que se evalua antes que cualquier `import` del fichero de test.
 */

export const PDF_ARTIST_ID = "art-fixture-pdf";

export const pdfTrack: Track = {
  id: "track-fixture-1",
  title: "Amanecer",
  artist_name: "Ñandú",
  release_type: "Single",
  release_date: "2026-01-15",
  duration: "3:42",
  cover_image: "",
  audio_preview_url: "",
  spotify_url: "https://open.spotify.com/track/abc123",
  youtube_video_id: null,
  metrics: { streams: 128453, saves: 9120, playlist_additions: 340, top_countries: [{ country: "ES", pct: 32 }] },
  production_details: {
    daw: "Ableton Live 12",
    guitars: null,
    effects_chain: null,
    tuning: null,
    key: "D minor",
    genre: "Art Pop",
    bpm: 118,
  },
  lyrics: "Línea uno con ñ\nLínea dos con á é í ó ú",
  status: "approved",
  gallery_images: ["a.jpg"],
  stems_urls: { drums: "https://example.test/drums.wav" },
} as Track;

/**
 * P15 — el caso real de los 9 padres del catálogo semilla: la fila del álbum
 * trae `duration = "00:00"` porque es la fila agrupadora, no una pista
 * reproducible. Sus hijas sí tienen duración real, en el formato `M:SS` del
 * seed (`"3:45"`, un solo dígito de minuto).
 */
export const pdfAlbumParent: Track = {
  ...pdfTrack,
  id: "track-fixture-album",
  title: "Cielo Roto",
  release_type: "album",
  duration: "00:00",
  release_id: null,
  disc_number: 1,
  status: "approved",
} as Track;

export const pdfAlbumChild1: Track = {
  ...pdfTrack,
  id: "track-fixture-album-1",
  title: "Cielo Roto I",
  release_id: "track-fixture-album",
  duration: "3:45",
  disc_number: 1,
  track_number: 1,
  status: "approved",
} as Track;

export const pdfAlbumChild2: Track = {
  ...pdfTrack,
  id: "track-fixture-album-2",
  title: "Cielo Roto II",
  release_id: "track-fixture-album",
  duration: "6:07",
  disc_number: 1,
  track_number: 2,
  status: "approved",
} as Track;

/** El álbum con sus dos hijas: exactamente el caso que P15 arregla. */
export const pdfAlbum: Track[] = [pdfAlbumParent, pdfAlbumChild1, pdfAlbumChild2];

export const pdfDossier: DossierData = {  id: "dossier-fixture-1",
  artist_id: PDF_ARTIST_ID,
  biography: "Biografía con eñes y acentos: ¿qué? ¡sí!",
  press_text: "Texto de «prensa»",
  genre: "Art Pop",
  location: "Valencia, Venezuela",
  influences: "Måneskin, Björk, Ñandú",
  contact_email: "prensa@nandú.test",
  booking_email: "booking@nandú.test",
  management: "Gestión Añil",
  website: "https://nandu.test",
  rider_pa_system: "Line Array L-Acoustics K2 - 20,000W RMS",
  rider_monitors: null,
  rider_console: null,
  rider_subwoofers: null,
  rider_guitar: null,
  rider_bass: null,
  rider_drums: null,
  rider_keyboards: null,
  rider_lighting: null,
  rider_stage_size: null,
  rider_stage_conditions: null,
  rider_hospitality: null,
  rider_transport: null,
  rider_special_notes: "No se permite pirotecnia",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

/** N pistas variadas, para forzar saltos de pagina en los tests de maquetacion. */
export function makeManyTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => ({
    ...pdfTrack,
    id: `${PDF_ARTIST_ID}-m${i + 1}`,
    title: `Pista ${String(i + 1).padStart(2, "0")}`,
    release_type: i % 3 === 0 ? "EP" : "Single",
  }));
}
