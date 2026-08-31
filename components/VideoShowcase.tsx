"use client";

import React, { useState } from "react";
import { safeString } from "@/lib/null-safe";
import { VideoPlayerModal } from "./VideoPlayerModal";

interface VideoShowcaseProps {
  title?: string;
  youtubeVideoId?: string | null;
  videoEmbedUrl?: string | null;
  coverImage?: string | null;
  className?: string;
}

export function VideoShowcase({
  title = "Videoclip Oficial",
  youtubeVideoId,
  videoEmbedUrl,
  coverImage,
  className = "",
}: VideoShowcaseProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hasVideo = Boolean(youtubeVideoId || videoEmbedUrl);
  const resolvedTitle = safeString(title, "Videoclip Oficial");

  // Thumbnail dinámico: si hay YouTube ID obtenemos maxresdefault o hqdefault, sino coverImage o placeholder
  const thumbnail = youtubeVideoId
    ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`
    : coverImage && coverImage !== "—"
    ? coverImage
    : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80";

  return (
    <section className={`p-6 bg-white dark:bg-dark-800 rounded-2xl border border-slate-200 dark:border-dark-700 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-dark-100 flex items-center gap-2">
            <span>🎬</span> {resolvedTitle}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Material audiovisual oficial en alta definición
          </p>
        </div>
        {hasVideo ? (
          <span className="text-xs bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-semibold px-2.5 py-1 rounded-full border border-red-300 dark:border-red-800">
            Video Disponible
          </span>
        ) : (
          <span className="text-xs bg-slate-100 dark:bg-dark-700 text-slate-400 px-2.5 py-1 rounded-full">
            Próximamente
          </span>
        )}
      </div>

      {/* Tarjeta Fachada Ligera (Facade Pattern) */}
      <div
        onClick={() => hasVideo && setIsModalOpen(true)}
        className={`relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-dark-700 bg-slate-900 group ${
          hasVideo ? "cursor-pointer" : "opacity-75 cursor-not-allowed"
        }`}
      >
        <img
          src={thumbnail}
          alt={resolvedTitle}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />

        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/25 transition-colors flex items-center justify-center">
          {hasVideo ? (
            <div className="w-16 h-16 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-xl transform transition-transform group-hover:scale-110 group-hover:bg-red-600">
              <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          ) : (
            <div className="text-center p-4 bg-slate-900/80 rounded-lg backdrop-blur-sm border border-slate-700 text-slate-300 text-sm">
              Material audiovisual en post-producción
            </div>
          )}
        </div>

        {hasVideo && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white bg-black/60 px-3 py-1.5 rounded-lg backdrop-blur-sm">
            <span className="font-medium truncate">{resolvedTitle}</span>
            <span className="text-red-400 font-bold ml-2">HD 1080p</span>
          </div>
        )}
      </div>

      <VideoPlayerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={resolvedTitle}
        youtubeId={youtubeVideoId}
        videoUrl={videoEmbedUrl}
      />
    </section>
  );
}
