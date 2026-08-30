"use client";

import React from "react";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import { GlobalAudioPlayer } from "@/components/GlobalAudioPlayer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AudioPlayerProvider>
      {children}
      <GlobalAudioPlayer />
    </AudioPlayerProvider>
  );
}
