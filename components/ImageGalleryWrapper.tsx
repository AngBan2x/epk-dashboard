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

  return (
    <ImageGallery
      images={currentImages}
      title={title}
      trackId={trackId}
      isOwner={isOwner}
      onImageAdded={(url) => {
        setCurrentImages((prev) => [...(prev ?? []), url]);
      }}
      onImageRemoved={(id) => {
        setCurrentImages((prev) =>
          (prev ?? []).filter((img) => {
            if (typeof img === "string") return true;
            return img.id !== id;
          })
        );
      }}
      onImageEdited={(id, newTitle, category) => {
        setCurrentImages((prev) =>
          (prev ?? []).map((img) => {
            if (typeof img === "string") return img;
            if (img.id === id) {
              return { ...img, title: newTitle, category: category as GalleryItem["category"] };
            }
            return img;
          })
        );
      }}
    />
  );
}
