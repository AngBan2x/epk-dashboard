import type { CSSProperties } from "react";
import type { SocialLink } from "@/types/music";
import {
  filterValidSocialLinks,
  getSocialPlatform,
  type SocialPlatform,
} from "@/lib/social-platforms";

export interface SocialPlatformIconProps {
  platform: SocialPlatform;
  className?: string;
}

export function SocialPlatformIcon({
  platform,
  className = "w-5 h-5",
}: SocialPlatformIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule={platform.icon.fillRule}
      aria-hidden="true"
      focusable="false"
    >
      <path d={platform.icon.d} />
    </svg>
  );
}

export interface ArtistSocialLinksProps {
  socialLinks?: SocialLink[] | null;
  artistName?: string | null;
  className?: string;
  showLabels?: boolean;
  ariaLabel?: string;
  size?: "sm" | "md";
}

export function ArtistSocialLinks({
  socialLinks,
  artistName,
  className = "",
  showLabels = false,
  ariaLabel = "Redes sociales del artista",
  size = "md",
}: ArtistSocialLinksProps) {
  const links = filterValidSocialLinks(socialLinks);
  if (links.length === 0) return null;

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <div
      role="list"
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      {links.map((link) => {
        const platform = getSocialPlatform(link.platform);
        if (!platform) return null;

        const brandStyle = { "--brand": platform.color } as CSSProperties;
        const subject = artistName ? ` de ${artistName}` : "";

        return (
          <a
            key={platform.key}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            role="listitem"
            title={platform.label}
            aria-label={`Visitar ${platform.label}${subject} (se abre en una pestaña nueva)`}
            style={brandStyle}
            className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 transition-colors hover:border-[color:var(--brand)] hover:text-[color:var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:focus-visible:ring-offset-slate-900 ${
              size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
            }`}
          >
            <SocialPlatformIcon platform={platform} className={iconSize} />
            {showLabels && <span>{platform.label}</span>}
          </a>
        );
      })}
    </div>
  );
}

export default ArtistSocialLinks;
