"use client";

import Image from "next/image";
import React, { useState } from "react";
import { safeArray, safeString } from "@/lib/null-safe";
import { ImageUploader } from "./ImageUploader";
import type { GalleryImage as GalleryItem } from "@/types/music";

export type { GalleryImage as GalleryItem } from "@/types/music";

interface ImageGalleryProps {
  images?: (string | GalleryItem)[];
  title?: string;
  trackId?: string;
  isOwner?: boolean;
  onImageAdded?: (item: GalleryItem) => void;
  onImageRemoved?: (id: string) => void;
  onImageEdited?: (id: string, title: string, category: string) => void;
}

export function ImageGallery({
  images = [],
  title = "Galería de Prensa & Assets Visuales",
  trackId,
  isOwner = false,
  onImageAdded,
  onImageRemoved,
  onImageEdited,
}: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);

  const normalizedImages: GalleryItem[] = safeArray<string | GalleryItem>(images).map((img, idx) => {
    if (typeof img === "string") {
      return {
        id: `img-${idx}`,
        url: img,
        title: `Asset de Prensa #${idx + 1}`,
        category: "Prensa",
      };
    }
    return {
      id: img.id || `img-${idx}`,
      url: img.url,
      title: img.title || `Asset de Prensa #${idx + 1}`,
      category: img.category || "Prensa",
    };
  });

  const handleUploadComplete = (
    url: string,
    meta?: { id?: string; title?: string; category?: string }
  ) => {
    setShowUploader(false);
    onImageAdded?.({
      id: meta?.id || `img-${Date.now()}`,
      url,
      title: meta?.title,
      category: (meta?.category as GalleryItem["category"]) || "Prensa",
    });
  };

  // Fallbacks elegantes en caso de que el artista no tenga imágenes.
  // Son decorativos: sin CRUD (editar/borrar fallbacks no tiene efecto persistente).
  const showingFallbacks = normalizedImages.length === 0;
  const displayImages =
    normalizedImages.length > 0
      ? normalizedImages
      : [
          {
            id: "fb-1",
            url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80",
            title: "Estudio de Grabación",
            category: "Estudio" as const,
          },
          {
            id: "fb-2",
            url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80",
            title: "Concierto en Vivo",
            category: "En Vivo" as const,
          },
          {
            id: "fb-3",
            url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80",
            title: "Presentación Escénica",
            category: "En Vivo" as const,
          },
        ];

  return (
    <section className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Recursos gráficos en alta resolución para prensa y promotores
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && trackId && (
            <button
              onClick={() => setShowUploader(!showUploader)}
              className="text-xs bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-300 font-semibold px-2.5 py-1 rounded-full border border-primary-300 dark:border-primary-800 hover:bg-primary-200 dark:hover:bg-primary-900 transition-colors"
            >
              {showUploader ? "Cerrar" : "+ Subir"}
            </button>
          )}
          <span className="text-xs bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-300 font-semibold px-2.5 py-1 rounded-full border border-primary-300 dark:border-primary-800">
            {displayImages.length} Assets HD
          </span>
        </div>
      </div>

      {showUploader && trackId && (
        <div className="mb-4 p-4 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-800/50">
          <ImageUploader
            trackId={trackId}
            onUploadComplete={handleUploadComplete}
          />
        </div>
      )}

      {showingFallbacks && isOwner && trackId && (
        <p className="mb-4 px-1 text-xs text-slate-500 dark:text-slate-400">
          💡 Mostrando imágenes de ejemplo. Sube tus propias fotos con <span className="font-semibold">+ Subir</span> para gestionar tu galería (editar / eliminar aparecen sobre tus imágenes).
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {displayImages.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedImage(item.url)}
            className="group relative aspect-video rounded-xl overflow-hidden cursor-pointer bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 transition-all hover:scale-[1.02] hover:shadow-xl"
          >
            <Image
              src={item.url}
              alt={safeString(item.title)}
              width={640}
              height={360}
              unoptimized
              className="w-full h-full object-cover transition duration-300 group-hover:brightness-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
              <span className="text-xs font-semibold text-primary-300">
                {item.category}
              </span>
              <p className="text-sm font-medium text-white truncate">
                {item.title}
              </p>
              {isOwner && trackId && !showingFallbacks && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newTitle = prompt("Editar título:", item.title || "");
                      if (newTitle !== null && onImageEdited) {
                        onImageEdited(item.id, newTitle, item.category || "Prensa");
                      }
                    }}
                    className="text-xs bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded border border-white/30 transition-colors"
                    aria-label="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("¿Eliminar esta imagen de la galería?")) {
                        onImageRemoved?.(item.id);
                      }
                    }}
                    className="text-xs bg-red-500/20 hover:bg-red-500/30 text-white px-2 py-1 rounded border border-red-500/30 transition-colors"
                    aria-label="Eliminar"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox modal simple & accesible */}
      {selectedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa de imagen"
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="relative max-w-4xl max-h-[85vh] flex flex-col items-center">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 text-white text-sm bg-slate-800 px-3 py-1 rounded-full border border-slate-600 hover:bg-slate-700 transition"
              aria-label="Cerrar modal"
            >
              ✕ Cerrar
            </button>
            <Image
              src={selectedImage}
              alt="Vista previa"
              width={1200}
              height={800}
              unoptimized
              className="max-h-[80vh] w-auto rounded-lg shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </section>
  );
}
