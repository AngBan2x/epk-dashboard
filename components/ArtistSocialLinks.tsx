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
  /**
   * Encabezado visible por encima de los botones.
   *
   * **Opcional y sin valor por defecto**: `app/profile/page.tsx` ya pone su
   * propio "Vista previa" encima de este mismo componente, y forzarlo aquí le
   * daría dos títulos a un bloque que ya tiene uno. Quien quiera el título lo
   * pasa; quien no, no lo ve.
   *
   * Vive en el componente y no en el envoltorio de la página porque el
   * encabezado y la lista son **una** unidad semántica: si el texto viviera
   * fuera, cada consumidor tendría que acordarse además de que el `aria-label`
   * de la lista tiene que decir lo mismo. Aquí las dos cosas se escriben una vez.
   */
  title?: string | null;
}

export function ArtistSocialLinks({
  socialLinks,
  artistName,
  className = "",
  showLabels = false,
  ariaLabel = "Redes sociales del artista",
  size = "md",
  title = null,
}: ArtistSocialLinksProps) {
  const links = filterValidSocialLinks(socialLinks);
  if (links.length === 0) return null;

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <div className={className}>
      {/*
        `h2`, no `h3` ni `h4`. La jerarquía de `/artists/[id]` es: `h1` = nombre
        del artista (`ArtistHero`) y **todo lo demás son `h2`** — "Biografía &
        Prensa" (`SectionHeader`), "Descargas para prensa" (`SectionHeader`) y
        "Lanzamientos" (`ArtistTracksSection`). Este bloque se inserta entre el
        `h1` y esos tres, así que `h2` no introduce ningún salto: un `h4`
        saltaría del `h1` al `h4`, que es justo lo que rompe la navegación por
        encabezados de un lector de pantalla.
      */}
      {title && (
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      )}
      <div
        role="list"
        aria-label={ariaLabel}
        className="flex flex-wrap items-center gap-2"
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
    </div>
  );
}

export default ArtistSocialLinks;
