import type { SocialLink } from "@/types/music";

export const MAX_SOCIAL_URL_LENGTH = 300;

export interface SocialIcon {
  readonly d: string;
  readonly fillRule: "nonzero" | "evenodd";
}

export interface SocialPlatformDefinition {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly placeholder: string;
  readonly match: readonly string[];
  readonly aliases?: readonly string[];
  readonly icon: SocialIcon;
}

export const SOCIAL_PLATFORMS = [
  {
    key: "spotify",
    label: "Spotify",
    color: "#1DB954",
    placeholder: "https://open.spotify.com/artist/tu-id",
    match: ["open.spotify.com", "spotify.com", "spotify.link"],
    aliases: [],
    icon: {
      d: "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z",
      fillRule: "nonzero",
    },
  },
  {
    key: "youtube",
    label: "YouTube",
    color: "#FF0000",
    placeholder: "https://youtube.com/@tucanal",
    match: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    aliases: ["yt", "youtube music", "youtubemusic"],
    icon: {
      d: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 7.754 0 12 0 12s0 4.246.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 16.246 24 12 24 12s0-4.246-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
      fillRule: "nonzero",
    },
  },
  {
    key: "instagram",
    label: "Instagram",
    color: "#E4405F",
    placeholder: "https://instagram.com/tu_usuario",
    match: ["instagram.com", "instagr.am"],
    aliases: [],
    icon: {
      d: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z",
      fillRule: "nonzero",
    },
  },
  {
    key: "tiktok",
    label: "TikTok",
    color: "#FE2C55",
    placeholder: "https://tiktok.com/@tu_usuario",
    match: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
    aliases: ["tik tok", "tiktok music"],
    icon: {
      d: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.09-.01-8.18.02-12.26z",
      fillRule: "nonzero",
    },
  },
  {
    key: "facebook",
    label: "Facebook",
    color: "#1877F2",
    placeholder: "https://facebook.com/tu-pagina",
    match: ["facebook.com", "fb.com", "fb.watch", "m.me"],
    aliases: ["meta", "meta facebook"],
    icon: {
      d: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
      fillRule: "nonzero",
    },
  },
  {
    key: "x",
    label: "X",
    color: "#1D9BF0",
    placeholder: "https://x.com/tu_usuario",
    match: ["x.com", "twitter.com", "t.co"],
    aliases: ["twitter", "x twitter"],
    icon: {
      d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z",
      fillRule: "nonzero",
    },
  },
  {
    key: "threads",
    label: "Threads",
    color: "#71767B",
    placeholder: "https://threads.net/@tu_usuario",
    match: ["threads.net", "threads.com"],
    aliases: ["meta threads"],
    icon: {
      d: "M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm0 2.6a6.9 6.9 0 1 0 0 13.8 6.9 6.9 0 0 0 0-13.8zM6.4 10.7h11.2v2.6H6.4z",
      fillRule: "evenodd",
    },
  },
  {
    key: "apple-music",
    label: "Apple Music",
    color: "#FA243C",
    placeholder: "https://music.apple.com/us/artist/tu-artista",
    match: ["music.apple.com", "itunes.apple.com", "podcasts.apple.com"],
    aliases: ["apple", "applemusic", "itunes"],
    icon: {
      d: "M6.4 3.2h11.2v2.6H6.4zM6.4 3.2h2.2v11.6H6.4zM15.4 3.2h2.2v10.2h-2.2zM7.8 15.4A2.5 2 0 1 0 2.8 15.4 2.5 2 0 1 0 7.8 15.4zM16.8 14A2.5 2 0 1 0 11.8 14 2.5 2 0 1 0 16.8 14z",
      fillRule: "nonzero",
    },
  },
  {
    key: "soundcloud",
    label: "SoundCloud",
    color: "#FF5500",
    placeholder: "https://soundcloud.com/tu-usuario",
    match: ["soundcloud.com", "on.soundcloud.com"],
    aliases: ["sound cloud"],
    icon: {
      d: "M15 12.8A4.4 4.4 0 1 0 6.2 12.8 4.4 4.4 0 1 0 15 12.8zM15.6 9.6h1.6v6.8h-1.6zM17.8 7.4h1.6v9h-1.6zM19.9 6.4h1.5a1.2 1.2 0 0 1 1.2 1.2v7.6a1.2 1.2 0 0 1-1.2 1.2h-1.5z",
      fillRule: "nonzero",
    },
  },
  {
    key: "bandcamp",
    label: "Bandcamp",
    color: "#629AA9",
    placeholder: "https://tu-artista.bandcamp.com",
    match: ["bandcamp.com"],
    aliases: ["band camp"],
    icon: {
      d: "M0 18.75l7.437-13.5H24l-7.438 13.5z",
      fillRule: "nonzero",
    },
  },
  {
    key: "deezer",
    label: "Deezer",
    color: "#A238FF",
    placeholder: "https://deezer.com/us/artist/123456",
    match: ["deezer.com", "deezer.page.link"],
    aliases: [],
    icon: {
      d: "M2 5.4h3.4v2.5H2zM6.4 5.4h3.4v2.5H6.4zM10.8 5.4h11.2v2.5H10.8zM2 15.9h3.4v2.5H2zM6.4 15.9h3.4v2.5H6.4zM10.8 15.9h11.2v2.5H10.8z",
      fillRule: "nonzero",
    },
  },
  {
    key: "tidal",
    label: "Tidal",
    color: "#00A0B0",
    placeholder: "https://tidal.com/browse/artist/tu-artista",
    match: ["tidal.com", "listen.tidal.com"],
    aliases: [],
    icon: {
      d: "M3 4.4h4.2L5.6 19.6H1.4zM9 4.4h3.8L11.2 19.6H7.4zM14.6 4.4h3.4L16.4 19.6H13zM20 4.4h2.6L21.2 19.6H18.6z",
      fillRule: "nonzero",
    },
  },
  {
    key: "amazon-music",
    label: "Amazon Music",
    color: "#00A8E1",
    placeholder: "https://music.amazon.com/artists/tu-artista",
    match: ["music.amazon.com", "amzn.to"],
    aliases: ["amazon", "amazonmusic", "amazon music unlimited"],
    icon: {
      d: "M3.2 4.4h8.4v2.2H3.2zM3.2 4.4H5v8.6H3.2zM5.6 13.4A2.2 1.7 0 1 0 1.2 13.4 2.2 1.7 0 1 0 5.6 13.4zM1.4 12.4A11 11 0 0 0 22.6 12.4L20.2 12.4A8.6 8.6 0 0 1 3.8 12.4zM20.6 10.8l2.6 2-3.4.5z",
      fillRule: "nonzero",
    },
  },
  {
    key: "audiomack",
    label: "Audiomack",
    color: "#FFA200",
    placeholder: "https://audiomack.com/tu-artista",
    match: ["audiomack.com"],
    aliases: ["audio mack"],
    icon: {
      d: "M4.6 2.2 20.6 12 4.6 21.8zM9.4 8 10.9 6.9 14.7 10 13.2 11.1zM12.4 10.4 13.9 9.3 17.7 12.4 16.2 13.5z",
      fillRule: "evenodd",
    },
  },
  {
    key: "mixcloud",
    label: "Mixcloud",
    color: "#7B64FF",
    placeholder: "https://mixcloud.com/tu-usuario/",
    match: ["mixcloud.com"],
    aliases: ["mix cloud"],
    icon: {
      d: "M11.8 12.8A3.8 3.8 0 1 0 4.2 12.8 3.8 3.8 0 1 0 11.8 12.8zM17.4 10.6A4.4 4.4 0 1 0 8.6 10.6 4.4 4.4 0 1 0 17.4 10.6zM19.6 13.4A3.2 3.2 0 1 0 13.2 13.4 3.2 3.2 0 1 0 19.6 13.4zM9 10.4h1.6v9.8H9zM12.2 8.4h1.6v11.8h-1.6zM15.4 11.4h1.6v8.8h-1.6z",
      fillRule: "nonzero",
    },
  },
  {
    key: "webflow",
    label: "Webflow",
    color: "#4353FF",
    placeholder: "https://mi-sitio.webflow.io",
    match: ["webflow.com", "webflow.io"],
    aliases: ["web flow"],
    icon: {
      d: "M1.2 5.6h3.2l2.6 12.8H4zM6.4 18.4h3l4.2-12.8h-3zM22.8 5.6h-3.2l-2.6 12.8H20zM14.6 18.4h3l-7.2-12.8h-3z",
      fillRule: "nonzero",
    },
  },
] as const satisfies readonly SocialPlatformDefinition[];

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialPlatformKey = SocialPlatform["key"];

export const SOCIAL_PLATFORM_KEYS: readonly SocialPlatformKey[] = SOCIAL_PLATFORMS.map(
  (platform) => platform.key
);

const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  "si",
  "feature",
  "ref",
  "ref_src",
  "ref_url",
  "referrer",
  "source",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "igsh",
  "yclid",
  "twclid",
  "spm",
  "scm",
  "amp",
  "share_id",
  "share_token",
  "share_medium",
]);

export interface SocialUrlValidation {
  valid: boolean;
  normalized?: string;
  error?: string;
}

function normalizePlatformToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const PLATFORM_LOOKUP: ReadonlyMap<string, SocialPlatform> = (() => {
  const lookup = new Map<string, SocialPlatform>();
  for (const platform of SOCIAL_PLATFORMS) {
    const tokens = [platform.key, platform.label, ...(platform.aliases ?? [])];
    for (const token of tokens) {
      lookup.set(normalizePlatformToken(token), platform);
    }
  }
  return lookup;
})();

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function stripTrackingParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.search);
  for (const name of Array.from(params.keys())) {
    const lower = name.toLowerCase();
    if (lower.startsWith("utm_") || lower.startsWith("_") || TRACKING_PARAMS.has(lower)) {
      params.delete(name);
    }
  }
  return params;
}

function serializeUrl(url: URL): string {
  const params = stripTrackingParams(url);
  const search = params.toString();
  const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${pathname}${search ? `?${search}` : ""}${url.hash}`;
}

export function getSocialPlatform(key: string): SocialPlatform | undefined {
  if (typeof key !== "string" || key.trim() === "") return undefined;
  return PLATFORM_LOOKUP.get(normalizePlatformToken(key));
}

export function isSocialPlatform(key: string): key is SocialPlatformKey {
  return getSocialPlatform(key) !== undefined;
}

export function inferSocialPlatformFromUrl(url: string): SocialPlatform | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  for (const platform of SOCIAL_PLATFORMS) {
    for (const domain of platform.match) {
      if (matchesDomain(host, domain)) return platform;
    }
  }
  return undefined;
}

export function validateSocialUrl(key: string, url: string): SocialUrlValidation {
  const platform = getSocialPlatform(key);
  if (!platform) {
    return { valid: false, error: "Plataforma no reconocida." };
  }

  const cleaned = (typeof url === "string" ? url : "").replace(/\s+/g, "");
  if (cleaned === "") {
    return { valid: false, error: "Introduce una URL." };
  }
  if (cleaned.length > MAX_SOCIAL_URL_LENGTH) {
    return {
      valid: false,
      error: `La URL no puede superar los ${MAX_SOCIAL_URL_LENGTH} caracteres.`,
    };
  }
  if (!/^https?:\/\//i.test(cleaned)) {
    return { valid: false, error: "La URL debe empezar por http:// o https://." };
  }

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return { valid: false, error: "La URL no es válida." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Solo se permiten enlaces http:// o https://." };
  }

  const host = parsed.hostname.toLowerCase();
  const belongs = platform.match.some((domain) => matchesDomain(host, domain));
  if (!belongs) {
    return {
      valid: false,
      error: `El enlace debe ser de ${platform.label} (${platform.match[0]}).`,
    };
  }

  const normalized = serializeUrl(parsed);
  if (normalized.length > MAX_SOCIAL_URL_LENGTH) {
    return {
      valid: false,
      error: `La URL no puede superar los ${MAX_SOCIAL_URL_LENGTH} caracteres.`,
    };
  }

  return { valid: true, normalized };
}

export function filterValidSocialLinks(
  links: readonly SocialLink[] | null | undefined
): SocialLink[] {
  if (!Array.isArray(links)) return [];

  const seen = new Set<string>();
  const result: SocialLink[] = [];

  for (const link of links) {
    if (!link || typeof link !== "object") continue;

    const rawUrl = typeof link.url === "string" ? link.url : "";
    const platform =
      getSocialPlatform(String(link.platform ?? "")) ?? inferSocialPlatformFromUrl(rawUrl);
    if (!platform || seen.has(platform.key)) continue;

    const validation = validateSocialUrl(platform.key, rawUrl);
    if (!validation.valid || !validation.normalized) continue;

    seen.add(platform.key);
    result.push({ platform: platform.key, url: validation.normalized, label: platform.label });
  }

  return result;
}
