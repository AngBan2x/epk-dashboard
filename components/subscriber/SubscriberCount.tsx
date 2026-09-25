"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface SubscriberCountProps {
  artistId: string;
  artistUserId?: string | null;
}

export function SubscriberCount({ artistId, artistUserId }: SubscriberCountProps) {
  const { user, loading: authLoading } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  const isOwner = !!user && !!artistUserId && user.id === artistUserId;

  useEffect(() => {
    if (authLoading || !isOwner) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (
          data?.artistProfile?.id === artistId &&
          typeof data.subscribers === "number"
        ) {
          setCount(data.subscribers);
        }
      } catch {
        setCount(null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isOwner, artistId]);

  if (!isOwner || count === null) return null;

  return (
    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
      {count} {count === 1 ? "suscriptor" : "suscriptores"}
    </p>
  );
}
