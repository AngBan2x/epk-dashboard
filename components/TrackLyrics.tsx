"use client";

import { useState, type ReactNode } from "react";

interface TrackLyricsProps {
  /**
   * Id del panel plegado. Lo pasa quien llama y **no** se genera aquí: el botón
   * y su panel tienen que poder localizarse desde fuera (`aria-controls` se
   * comprueba leyendo ese id), y un id autogenerado por render solo sirve
   * dentro del propio componente.
   */
  panelId: string;
  /** Texto del botón con el panel plegado. */
  label: string;
  /** Texto del botón con el panel desplegado. */
  expandedLabel: string;
  /** Lo que se ve al abrir. Cada sitio decide si es un `<pre>`, una tabla o nada. */
  children: ReactNode;
  /** Se pinta solo mientras está plegado (el "preview" de la carta de letra). */
  collapsedNote?: ReactNode;
  className?: string;
}

/**
 * ## El desplegable de la letra, en un solo sitio
 *
 * Lo usan **dos** superficies que de otro modo divergirían: la carta de letra de
 * un single (`components/LyricsSection.tsx`) y la fila de cada pista de un
 * álbum (`components/ReleaseTrackList.tsx`). Una copia del botón en cada una
 * acaba teniendo un `aria-expanded` en una y no en la otra, y eso es
 * invisible hasta que alguien navega con el teclado.
 *
 * ## Por qué el panel SIEMPRE está en el DOM, con `hidden`
 *
 * `aria-controls` apunta a un id. Si el panel se desmontara al plegarlo —
 * `AnimatePresence`, un condicional normal—, el `aria-controls` apuntaría a un id
 * que no existe justo cuando está plegado, que es el estado de partida. Por eso
 * `hidden` es el que decide, no la presencia del nodo.
 *
 * Y no hay `framer-motion` alrededor a propósito: se podría, pero un
 * `AnimatePresence` desmonta el panel al plegarse, que es justo lo que este
 * diseño evita, y una transición de altura sobre texto no compra nada.
 */
export function TrackLyrics({
  panelId,
  label,
  expandedLabel,
  children,
  collapsedNote,
  className,
}: TrackLyricsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
      >
        <span>{isOpen ? expandedLabel : label}</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <div id={panelId} hidden={!isOpen}>
        <div className="pt-1">{children}</div>
      </div>

      {collapsedNote && !isOpen ? <div className="pt-1">{collapsedNote}</div> : null}
    </div>
  );
}
