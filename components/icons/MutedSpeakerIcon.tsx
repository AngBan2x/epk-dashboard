/**
 * Icono de "no hay audio".
 *
 * ## Por qué existe, y por qué no es el "ban"
 *
 * Este icono estaba escrito **dos veces**, en dos sitios distintos: el `ban` de
 * Heroicons (un círculo con una diagonal) en el botón de cada fila de la lista
 * de pistas, y otra vez en `AudioPlayer`. El de las filas es el que se veía en
 * las capturas de *Tour de France*.
 *
 * El problema no es el icono en sí: es que **a `w-4 h-4` es indistinguible del
 * icono de imagen rota** del navegador. Un círculo con una raya puede ser "esto no
 * se puede reproducir" o "esta URL está muerta", y a ese tamaño no hay forma de
 * saberlo mirando.
 *
 * Un altavoz con las ondas apagadas dice lo mismo y **no se confunde con nada**:
 * no hay ningún otro icono de este proyecto con esa forma. Además el símbolo del
 * "ban" tiene el problema contrario: dice "prohibido", cuando lo que pasa es que
 * no hay nada que reproducir.
 *
 * Va en su propio fichero y no duplicado porque tres ficheros con tres versiones
 * del mismo logo es exactamente lo que ya pasó con el icono de Apple Music (ver
 * `lib/release-links.ts`). Un icono, un sitio.
 *
 * Es **decoración**: el texto que lo acompaña ya dice "sin audio disponible" y
 * el `aria-label` del botón lo dice entero, así que va `aria-hidden`.
 */
export function MutedSpeakerIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {/* Altavoz + ondas apagadas (`M22 9l-6 6M16 9l6 6` es la cruz). */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6"
      />
    </svg>
  );
}