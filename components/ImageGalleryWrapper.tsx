"use client";

import { useState, useEffect } from "react";
import { ImageGallery, GalleryItem } from "@/components/ImageGallery";

interface ImageGalleryWrapperProps {
  images?: (string | GalleryItem)[];
  title?: string;
  trackId: string;
  artistName: string;
}

export function ImageGalleryWrapper({
  images,
  title,
  trackId,
  artistName,
}: ImageGalleryWrapperProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [currentImages, setCurrentImages] = useState(images);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.role === "admin" || data.name === artistName) {
          setIsOwner(true);
        }
      })
      .catch(() => {});
  }, [artistName]);

  const persistGallery = async (next: (string | GalleryItem)[]) => {
    try {
      await fetch(`/api/tracks/${trackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gallery_images: next }),
      });
    } catch {
      console.error("Failed to persist gallery");
    }
  };

  return (
    <ImageGallery
      images={currentImages}
      title={title}
      trackId={trackId}
      isOwner={isOwner}
      onImageAdded={(item) => {
        setCurrentImages((prev) => [...(prev ?? []), item]);
      }}
      onImageRemoved={(id) => {
        setCurrentImages((prev) => {
          const next = (prev ?? []).filter((img) => {
            if (typeof img === "string") return true;
            return img.id !== id;
          });
          return next;
        });
        const target = (currentImages ?? []).find(
          (img) => typeof img !== "string" && img.id === id
        );
        const url = typeof target === "object" ? target.url : null;
        if (url) {
          fetch(`/api/upload/image?trackId=${trackId}&url=${encodeURIComponent(url)}`, {
            method: "DELETE",
          }).catch(() => {});
        }
      }}
      onImageEdited={(id, newTitle, category) => {
        setCurrentImages((prev) => {
          const next = (prev ?? []).map((img) => {
            if (typeof img === "string") return img;
            if (img.id === id) {
              return { ...img, title: newTitle, category: category as GalleryItem["category"] };
            }
            return img;
          });
          persistGallery(next);
          return next;
        });
      }}
    />
  );
}
