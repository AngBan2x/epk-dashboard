"use client";

import { useState, useEffect } from "react";
import { ProductionDetails } from "@/components/ProductionDetails";
import type { ProductionDetails as ProductionDetailsType } from "@/types/music";

interface ProductionDetailsWrapperProps {
  details: ProductionDetailsType;
  className?: string;
  trackId: string;
}

export function ProductionDetailsWrapper({
  details,
  className,
  trackId,
}: ProductionDetailsWrapperProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [currentDetails, setCurrentDetails] = useState(details);

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
    <ProductionDetails
      details={currentDetails}
      className={className}
      isOwner={isOwner}
      trackId={trackId}
      onDetailsUpdated={(updated) => setCurrentDetails(updated)}
    />
  );
}
