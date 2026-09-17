"use client";

import { useState, useEffect } from "react";
import { ProductionDetails } from "@/components/ProductionDetails";
import type { ProductionDetails as ProductionDetailsType } from "@/types/music";

interface ProductionDetailsWrapperProps {
  details: ProductionDetailsType;
  className?: string;
  trackId: string;
  artistName: string;
}

export function ProductionDetailsWrapper({
  details,
  className,
  trackId,
  artistName,
}: ProductionDetailsWrapperProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [currentDetails, setCurrentDetails] = useState(details);

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
    <ProductionDetails
      details={currentDetails}
      className={className}
      isOwner={isOwner}
      trackId={trackId}
      onDetailsUpdated={(updated) => setCurrentDetails(updated)}
    />
  );
}
