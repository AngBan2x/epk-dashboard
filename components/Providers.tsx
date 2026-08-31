"use client";

import React from "react";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import { AuthProvider } from "@/context/AuthContext";
import { GlobalAudioPlayer } from "@/components/GlobalAudioPlayer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AudioPlayerProvider>
      <AuthProvider>
        {children}
        <GlobalAudioPlayer />
      </AuthProvider>
    </AudioPlayerProvider>
  );
}
