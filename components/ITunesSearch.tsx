"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";

interface ITunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
  releaseDate?: string;
}

interface ITunesSearchProps {
  onSelect: (track: ITunesResult) => void;
  placeholder?: string;
}

function formatDuration(millis: number): string {
  const totalSec = Math.round(millis / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function ITunesSearch({ onSelect, placeholder = "Buscar en iTunes" }: ITunesSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ITunesResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    debounceTimeout.current = setTimeout(async () => {
      if (value.trim().length < 2) {
        setResults([]);
        setOpen(value.trim().length > 0);
        return;
      }
      setLoading(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const res = await fetch(`/api/itunes-search?term=${encodeURIComponent(value)}&entity=song&limit=5`, { signal: controller.signal });
        const data = await res.json();
        setResults(data.results || []);
        setOpen(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelect = (track: ITunesResult) => {
    onSelect(track);
    setOpen(false);
    setQuery(track.trackName);
    setResults([]);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        setResults([]);
      }
    },
    []
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [handleKeyDown]);

  useEffect(() => {
    // Click outside to close
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
        setResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <div>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 mt-2 w-full max-w-md bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 z-20 p-4 shadow-lg max-h-[400px] overflow-y-auto"
        >
          {loading ? (
            <div className="p-4 text-center text-slate-400">
              <span className="spinner spinner-spin spinner-lg text-primary-600" />
            </div>
          ) : results.length === 0 ? query.trim().length >= 2 ? (
            <div className="p-4 text-center text-slate-500 dark:text-slate-400">
              Sin resultados
            </div>
          ) : (
            <div className="p-4 text-center text-slate-400">
              Escribe para buscar...
            </div>
          ) : null}

          {results.map((track) => (
            <div
              key={track.trackId}
              className="p-3 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              onClick={() => handleSelect(track)}
            >
              {track.artworkUrl100 && (
                <Image
                  src={track.artworkUrl100}
                  alt={track.trackName}
                  width={40}
                  height={40}
                  unoptimized
                  className="w-10 h-10 rounded object-contain object-center mb-2"
                />
              )}
              <div className="flex flex-col">
                <p className="font-medium text-slate-900 dark:text-slate-100 truncate line-clamp-1">
                  {track.trackName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {track.artistName}
                </p>
                {track.primaryGenreName && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {track.primaryGenreName}
                  </p>
                )}
                {track.trackTimeMillis && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {formatDuration(track.trackTimeMillis)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}