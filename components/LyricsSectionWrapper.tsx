"use client";

import { useState, useEffect } from "react";
import { LyricsSection } from "@/components/LyricsSection";

interface LyricsSectionWrapperProps {
  lyrics: string | null;
  isInstrumental?: boolean;
  trackId: string;
  artistName: string;
}

export function LyricsSectionWrapper({
  lyrics,
  isInstrumental = false,
  trackId,
  artistName,
}: LyricsSectionWrapperProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [currentLyrics, setCurrentLyrics] = useState(lyrics);
  const [currentInstrumental, setCurrentInstrumental] = useState(isInstrumental);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data) return;
        if (data.role === 'admin' || data.name === artistName) {
          setIsOwner(true);
        }
      })
      .catch(() => {});
  }, [artistName]);

  return (
    <LyricsSection
      lyrics={currentLyrics}
      isInstrumental={currentInstrumental}
      trackId={trackId}
      isOwner={isOwner}
      onLyricsUpdated={(newLyrics, newInstrumental) => {
        setCurrentLyrics(newLyrics);
        setCurrentInstrumental(newInstrumental);
      }}
    />
  );
}
