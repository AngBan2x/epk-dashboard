"use client";

import React, { useEffect } from "react";
import { safeString } from "@/lib/null-safe";

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  youtubeId?: string | null;
  videoUrl?: string | null;
}

export function VideoPlayerModal({
  isOpen,
  onClose,
  title,
  youtubeId,
  videoUrl,
}: VideoPlayerModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resolvedTitle = safeString(title, "Video Oficial");

  // Resolver fuente de video
  let embedSrc: string | null = null;
  let isDirectVideo = false;

  if (youtubeId) {
    embedSrc = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`;
  } else if (videoUrl) {
    if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
      const match = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      const extractedId = match ? match[1] : null;
      if (extractedId) {
        embedSrc = `https://www.youtube-nocookie.com/embed/${extractedId}?autoplay=1&rel=0`;
      } else {
        embedSrc = videoUrl;
      }
    } else if (videoUrl.includes("vimeo.com")) {
      const match = videoUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      const vimeoId = match ? match[1] : "";
      embedSrc = `https://player.vimeo.com/video/${vimeoId}?autoplay=1`;
    } else if (videoUrl.endsWith(".mp4") || videoUrl.endsWith(".webm")) {
      isDirectVideo = true;
      embedSrc = videoUrl;
    } else {
      embedSrc = videoUrl;
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-dark-900 border border-dark-700 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header del Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-800 bg-dark-950/60">
          <h3 id="video-modal-title" className="text-base font-semibold text-white truncate">
            {resolvedTitle}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white flex items-center justify-center transition"
            aria-label="Cerrar modal de video"
          >
            ✕
          </button>
        </div>

        {/* Contenedor del Reproductor con relación 16:9 */}
        <div className="relative aspect-video bg-black flex items-center justify-center">
          {embedSrc ? (
            isDirectVideo ? (
              <video
                src={embedSrc}
                controls
                autoPlay
                className="w-full h-full object-contain"
              >
                Tu navegador no soporta reproducción directa de video.
              </video>
            ) : (
              <iframe
                src={embedSrc}
                title={resolvedTitle}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            )
          ) : (
            <div className="text-center p-8 text-dark-400">
              <span className="text-4xl block mb-2">🎬</span>
              <p className="text-sm">No se encontró una fuente de video válida para este track.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
