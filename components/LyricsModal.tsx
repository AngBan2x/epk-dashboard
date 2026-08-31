"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { safeString } from "@/lib/null-safe";
import { cn } from "@/lib/utils";

interface LyricsModalProps {
  lyrics: string | null;
  title: string;
  className?: string;
}

export function LyricsModal({ lyrics, title, className }: LyricsModalProps) {
  const [open, setOpen] = useState(false);
  const hasLyrics = lyrics != null && lyrics.length > 0;

  return (
    <div className={cn(className)}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!hasLyrics}
      >
        Ver letra
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <h2 className="text-xl font-bold mb-4">{safeString(title)}</h2>
        {hasLyrics ? (
          <pre className="whitespace-pre-wrap text-sm text-dark-600 dark:text-dark-300 font-sans">
            {lyrics}
          </pre>
        ) : (
          <p className="text-slate-400 dark:text-slate-500">Letra no disponible.</p>
        )}
      </Modal>
    </div>
  );
}
