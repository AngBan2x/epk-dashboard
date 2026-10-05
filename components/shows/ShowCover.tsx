"use client";

import { useState } from "react";
import Image from "next/image";
import type { Show } from "@/types/music";
import { safeString } from "@/lib/null-safe";

/**
 * Portada del show: flyer real si existe, y si no, una portada generada con el
 * estilo de marca (gradiente + iniciales + nombre).
 *
 * Caso real: los shows de producción no traen `flyer_url`, así que sin este
 * fallback la tarjeta quedaba como un rectángulo gris sin ningún recurso visual.
 */

/** Gradiente de marca, idéntico al banner de `components/ArtistHero.tsx`. */
export const BRAND_GRADIENT = "from-indigo-600 via-violet-600 to-pink-500";

/**
 * C4 — misma familia de tonos que `SHOW_STATUS_STYLES` (lib/show-status.ts): cada
 * estado pinta su portada con su matiz, de modo que la variedad de color de la
 * página salga del propio dato y no de una paleta nueva.
 *
 * Solo los 8 estados que existen. Antes esta tabla tenía 20 entradas, con 7
 * alias legacy (`proximo`, `aprobado`, `rechazado`, `propuesto`, `completado`,
 * `en_vivo`) y los que C4 retiró, y ninguna las generaba: eran gradientes que
 * nadie iba a ver, y cada una era un sitio más donde el vocabulario mentía.
 */
const COVER_GRADIENT_BY_STATUS: Record<string, string> = {
  proximamente: "from-amber-500 via-orange-500 to-pink-500",
  activo: "from-emerald-500 via-teal-500 to-cyan-500",
  hoy: "from-sky-500 via-indigo-500 to-violet-500",
  confirmado: "from-violet-600 via-purple-600 to-pink-500",
  pospuesto: "from-orange-500 via-amber-500 to-yellow-500",
  cancelado: "from-rose-500 via-pink-500 to-fuchsia-500",
  pasado: "from-slate-500 via-slate-600 to-slate-700",
  suspendido: "from-slate-500 via-slate-600 to-slate-700",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "♪";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

interface ShowCoverProps {
  show: Show;
  /** Nombre del artista (si se pudo resolver) para la portada generada. */
  artistName?: string;
}

export function ShowCover({ show, artistName }: ShowCoverProps) {
  const [broken, setBroken] = useState(false);

  const flyer = safeString(show.flyer_url, "");
  const venueName = safeString(show.venue_name, "");
  const venue = venueName || "Venue por confirmar";
  const location = [safeString(show.city, ""), safeString(show.country, "")]
    .filter(Boolean)
    .join(", ");

  if (flyer && !broken) {
    return (
      <div className="relative h-44 w-full overflow-hidden bg-slate-100 dark:bg-slate-700 sm:h-48">
        <Image
          src={flyer}
          alt={`Flyer de ${venue}`}
          width={768}
          height={192}
          unoptimized
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  const gradient = COVER_GRADIENT_BY_STATUS[show.status] ?? BRAND_GRADIENT;
  // El titular es el nombre del artista cuando se pudo resolver y el venue cuando
  // no (un show puede haberlo creado un administrador sin artista vinculado). No
  // se marca de quién es el show: sale el mismo markup en los dos casos.
  const headline = artistName || venue;
  // El chip lleva solo el dato que el titular NO muestra, y solo si se conoce de
  // verdad. Antes caía en "📍 Ubicación por confirmar" cuando no había ciudad/país
  // ni nombre de artista: el venue ya era el titular y el chip afirmaba en voz
  // alta lo mismo que el titular acababa de enseñar.
  const secondary = location || venueName;
  const chip = secondary && secondary !== headline ? `📍 ${secondary}` : null;

  return (
    // Decorativo: el nombre del venue y la ubicación ya se anuncian debajo.
    <div
      aria-hidden="true"
      className={`relative h-44 w-full overflow-hidden bg-gradient-to-br ${gradient} sm:h-48`}
    >
      {/* Veladura oscura: garantiza contraste AA del texto blanco sobre el
          gradiente (el punto más claro es rosa-500 ≈ 3.5:1 sin veladura). */}
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
      <div className="absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-white/10" />

      <div className="relative flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        {/* Iniciales sobre veladura oscura: con el mismo tono blanco encima del
            gradiente el peor caso (ámbar) se quedaba en ≈3:1. */}
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/35 text-xl font-extrabold text-white ring-1 ring-white/50">
          {initialsOf(headline)}
        </span>
        <p className="w-full truncate text-xl font-extrabold text-white">{headline}</p>
        {/* Sin chip no hay hueco: la tarjeta queda con iniciales + titular y el
            "Ubicación por confirmar" de abajo sigue siendo la única advertencia. */}
        {chip && (
          <span className="max-w-full truncate rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900">
            {chip}
          </span>
        )}
      </div>
    </div>
  );
}
