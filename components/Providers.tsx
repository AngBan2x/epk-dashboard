"use client";

import React from "react";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import { AuthProvider } from "@/context/AuthContext";
import { GlobalAudioPlayer } from "@/components/GlobalAudioPlayer";
import { ToastProvider } from "@/components/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AudioPlayerProvider>
      <AuthProvider>
        <ToastProvider>
          {children}
          <GlobalAudioPlayer />
        </ToastProvider>
      </AuthProvider>
    </AudioPlayerProvider>
  );
}
