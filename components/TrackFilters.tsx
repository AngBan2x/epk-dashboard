"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface TrackFiltersProps {
  onFilterChange: (filters: { search: string; releaseType: string }) => void;
}

export function TrackFilters({ onFilterChange }: TrackFiltersProps) {
  const [search, setSearch] = useState("");
  const [releaseType, setReleaseType] = useState("");

  const handleSearch = (value: string) => {
    setSearch(value);
    onFilterChange({ search: value, releaseType });
  };

  const handleType = (value: string) => {
    setReleaseType(value);
    onFilterChange({ search, releaseType: value });
  };

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <input
        type="text"
        placeholder="Buscar tracks..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="px-4 py-2 border border-slate-200 rounded-lg text-sm dark:border-dark-700 dark:bg-dark-800"
      />
      <div className="flex gap-2">
        {["", "Single", "EP", "Album"].map((type) => (
          <Button
            key={type}
            variant={releaseType === type ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleType(type)}
          >
            {type || "Todos"}
          </Button>
        ))}
      </div>
    </div>
  );
}
