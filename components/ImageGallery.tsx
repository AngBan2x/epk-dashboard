"use client";

import React, { useState } from "react";
import { safeArray, safeString } from "@/lib/null-safe";

export interface GalleryItem {
  id: string;
  url: string;
  title?: string;
  category?: "Portada" | "Prensa" | "En Vivo" | "Estudio";
}

interface ImageGalleryProps {
  images?: (string | GalleryItem)[];
  title?: string;
}

export function ImageGallery({
  images = [],
  title = "Galería de Prensa & Assets Visuales",
}: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

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

  // Fallbacks elegantes en caso de que el artista no tenga imágenes
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
    <section className="p-6 bg-white dark:bg-dark-800 rounded-2xl border border-dark-200 dark:border-dark-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-dark-900 dark:text-dark-100">{title}</h2>
          <p className="text-xs text-dark-500 mt-0.5">
            Recursos gráficos en alta resolución para prensa y promotores
          </p>
        </div>
        <span className="text-xs bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-300 font-semibold px-2.5 py-1 rounded-full border border-primary-300 dark:border-primary-800">
          {displayImages.length} Assets HD
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {displayImages.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedImage(item.url)}
            className="group relative aspect-video rounded-xl overflow-hidden cursor-pointer bg-dark-100 dark:bg-dark-700 border border-dark-200 dark:border-dark-600 transition-all hover:scale-[1.02] hover:shadow-xl"
          >
            <img
              src={item.url}
              alt={safeString(item.title)}
              className="w-full h-full object-cover transition duration-300 group-hover:brightness-110"
              loading="lazy"
              onError={(e) => {
                // Fallback silencioso en caso de URL rota
                (e.target as HTMLImageElement).src =
                  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
              <span className="text-xs font-semibold text-primary-300">
                {item.category}
              </span>
              <p className="text-sm font-medium text-white truncate">
                {item.title}
              </p>
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
              className="absolute -top-10 right-0 text-white text-sm bg-dark-800 px-3 py-1 rounded-full border border-dark-600 hover:bg-dark-700 transition"
              aria-label="Cerrar modal"
            >
              ✕ Cerrar
            </button>
            <img
              src={selectedImage}
              alt="Vista previa"
              className="max-h-[80vh] w-auto rounded-lg shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </section>
  );
}
