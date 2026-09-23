"use client";

import React, { useRef, useState, useCallback } from "react";
import Image from "next/image";

interface ImageUploaderProps {
  trackId?: string;
  /** DOM id suffix (defaults to trackId). Required when trackId is absent. */
  uploadId?: string;
  /** Profile/banner mode: sent as kind+artistId instead of trackId. */
  kind?: "profile" | "banner";
  artistId?: string;
  onUploadComplete: (url: string, meta?: { id?: string; title?: string; category?: string }) => void;
  onError?: (message: string) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

export function ImageUploader({ trackId, uploadId, kind, artistId, onUploadComplete, onError }: ImageUploaderProps) {
  const inputId = `upload-${uploadId ?? trackId ?? kind ?? "file"}`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const validateFile = useCallback((file: File): string | null => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return "Tipo no válido. Solo JPG, PNG o WebP.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "El archivo supera 5MB.";
    }
    return null;
  }, []);

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      onError?.(validationError);
      return;
    }
    setError(null);
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, [validateFile, onError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (trackId) formData.append("trackId", trackId);
      if (kind) formData.append("kind", kind);
      if (artistId) formData.append("artistId", artistId);

      // Simulate progress since XHR upload progress isn't available with fetch
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const res = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al subir");
      }

      const data = await res.json();
      setProgress(100);
      onUploadComplete(data.url, { id: data.id, title: data.title, category: data.category });

      // Reset state
      setSelectedFile(null);
      setPreview(null);
      setProgress(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al subir la imagen";
      setError(message);
      onError?.(message);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, trackId, kind, artistId, onUploadComplete, onError]);

  const handleCancel = useCallback(() => {
    setSelectedFile(null);
    setPreview(null);
    setError(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileInput}
        className="hidden"
        id={inputId}
      />

      {!preview ? (
        <label
          htmlFor={inputId}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
            isDragOver
              ? "border-primary-500 bg-primary-50 dark:bg-primary-950/30"
              : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-950/20"
          }`}
        >
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <svg
              className="w-8 h-8 text-slate-400 dark:text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
              />
            </svg>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Arrastra una imagen o haz clic para seleccionar
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              JPG, PNG o WebP — Max 5MB
            </p>
          </div>
        </label>
      ) : (
        <div className="space-y-3">
          <div className="relative w-full h-40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <Image
              src={preview}
              alt="Preview"
              fill
              unoptimized
              className="object-cover"
            />
            {!uploading && (
              <button
                onClick={handleCancel}
                className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg hover:bg-black/80 transition"
              >
                Quitar
              </button>
            )}
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Subiendo...</span>
                <span className="text-primary-500 font-semibold">{progress}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary-500 to-violet-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}

          {!uploading && (
            <button
              onClick={handleUpload}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              Subir imagen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
