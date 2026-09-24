"use client";

import Image from "next/image";
import { useState, useEffect, useCallback } from "react";
import { formatNumber } from "@/lib/null-safe";

interface ArtistHeroProps {
  name: string;
  genre?: string | null;
  location?: string | null;
  monthlyListeners?: number;
  profileImage?: string | null;
  bannerImage?: string | null;
}

// Hero with banner + avatar; click either image to expand fullscreen (gallery-style lightbox).
export function ArtistHero({
  name,
  genre,
  location,
  monthlyListeners = 0,
  profileImage,
  bannerImage,
}: ArtistHeroProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const close = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, close]);

  const initial = name?.[0]?.toUpperCase() || "?";

  return (
    <>
      {/* Hero: banner + avatar (fallbacks keep layout identical when empty) */}
      <div
        className={`relative h-48 md:h-64 bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-500 overflow-hidden ${
          bannerImage ? "cursor-zoom-in" : ""
        }`}
        onClick={() => bannerImage && setLightbox(bannerImage)}
        role={bannerImage ? "button" : undefined}
        aria-label={bannerImage ? "Ver banner ampliado" : undefined}
        title={bannerImage ? "Ver banner ampliado" : undefined}
      >
        {bannerImage && (
          <Image src={bannerImage} alt="" fill unoptimized className="object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
      </div>
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <div className="flex items-end gap-4 -mt-10 mb-4">
            <div
              className={`w-20 h-20 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 border-4 border-slate-50 dark:border-slate-950 shrink-0 relative z-10 ${
                profileImage ? "cursor-zoom-in hover:ring-2 hover:ring-primary-500 transition" : ""
              }`}
              onClick={() => profileImage && setLightbox(profileImage)}
              role={profileImage ? "button" : undefined}
              aria-label={profileImage ? "Ver foto de perfil ampliada" : undefined}
              title={profileImage ? "Ver foto de perfil ampliada" : undefined}
            >
              {profileImage ? (
                <Image
                  src={profileImage}
                  alt={name}
                  width={80}
                  height={80}
                  unoptimized
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-slate-400">
                  {initial}
                </div>
              )}
            </div>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {name}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
            {genre && <span>🎵 {genre}</span>}
            {location && <span>📍 {location}</span>}
            {monthlyListeners > 0 && (
              <span>🎧 {formatNumber(monthlyListeners)} oyentes mensuales</span>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa de imagen"
          onClick={close}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="relative max-w-4xl max-h-[85vh] flex flex-col items-center">
            <button
              onClick={close}
              className="absolute -top-10 right-0 text-white text-sm bg-slate-800 px-3 py-1 rounded-full border border-slate-600 hover:bg-slate-700 transition"
              aria-label="Cerrar modal"
            >
              ✕ Cerrar
            </button>
            <Image
              src={lightbox}
              alt={name}
              width={1200}
              height={800}
              unoptimized
              className="max-h-[80vh] w-auto rounded-lg shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
