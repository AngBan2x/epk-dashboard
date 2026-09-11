"use client";

import { useState, useEffect } from "react";
import { LyricsSection } from "@/components/LyricsSection";

interface LyricsSectionWrapperProps {
  lyrics: string | null;
  isInstrumental?: boolean;
  trackId: string;
}

export function LyricsSectionWrapper({
  lyrics,
  isInstrumental = false,
  trackId,
}: LyricsSectionWrapperProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [currentLyrics, setCurrentLyrics] = useState(lyrics);
  const [currentInstrumental, setCurrentInstrumental] = useState(isInstrumental);

  useEffect(() => {
    try {
      const cookie = document.cookie
        .split("; ")
        .find((c) => c.startsWith("auth_session="));
      if (cookie) {
        const decoded = atob(cookie.split("=")[1]);
        const session = JSON.parse(decoded) as { role?: string };
        if (session.role === "admin" || session.role === "artist") {
          setIsOwner(true);
        }
      }
    } catch {
      // Not logged in or invalid session
    }
  }, []);

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
