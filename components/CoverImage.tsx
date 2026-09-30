"use client";

import { useState } from "react";
import Image from "next/image";
import { safeString } from "@/lib/null-safe";

interface CoverImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  unoptimized?: boolean;
  /** Alto minimo del marcador. Un <div> sin contenido no tiene altura
   *  intrinseca, asi que sin esto el bloque colapsa a 0 y la portada
   *  desaparece. Antes no hacia falta porque solo se renderizaba la reserva
   *  cuando no habia <img>, y ahi el contenedor ya traia `min-h-[200px]`. */
  minHeightClassName?: string;
}

/**
 * Portada con reserva cuando la imagen NO carga.
 *
 * Antes la pagina decidia con `getCoverImage(track) ? <Image .../> : <placeholder>`.
 * Eso solo cubre el caso de URL vacia. Una URL que existe pero esta MUERTA
 * (404, dominio que no resuelve, http sin TLS) se acepta igual y sale el icono
 * de imagen rota: es exactamente lo que pasaba con las 9 portadas de la semilla,
 * que apuntaban a `example.com`.
 *
 * Asi que se necesita un `onError` de verdad. Sin estado no se puede: un
 * `onError` que solo escribe en una variable de render no vuelve a renderizar.
 */
export function CoverImage({
  src,
  alt,
  className = "",
  width = 288,
  height = 288,
  unoptimized = true,
  minHeightClassName = "min-h-[200px]",
}: CoverImageProps) {
  const [failed, setFailed] = useState(false);
  const usable = !!src && safeString(src, "").trim() !== "" && !failed;

  if (!usable) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex w-full items-center justify-center bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-950 dark:to-slate-800 sm:min-h-0 ${minHeightClassName} ${className}`}
      >
        <span aria-hidden="true" className="text-4xl opacity-60">
          {alt.trim().charAt(0).toUpperCase() || "♪"}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src as string}
      alt={alt}
      width={width}
      height={height}
      unoptimized={unoptimized}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
