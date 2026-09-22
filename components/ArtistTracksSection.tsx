"use client";

import { useState } from "react";
import { EPKCard } from "@/components/EPKCard";
import { LoginModal } from "@/components/LoginModal";
import type { Track } from "@/types/music";

interface ArtistTracksSectionProps {
  tracks: Track[];
}

export function ArtistTracksSection({ tracks }: ArtistTracksSectionProps) {
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const handleLoginPrompt = () => {
    setLoginModalOpen(true);
  };

  if (tracks.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Lanzamientos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tracks.map((track) => (
          <EPKCard
            key={track.id}
            track={track}
            onLoginPrompt={handleLoginPrompt}
          />
        ))}
      </div>
      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
    </section>
  );
}