/**
 * Quita los comentarios de un fuente antes de comparar cadenas.
 *
 * Existe por un motivo concreto y repetido: **los comentarios que documentan un
 * cambio citan el código que el cambio elimina.** Un `expect(src).not.toContain(
 * "en_venta")` sobre el fichero entero se pone rojo porque alguien escribió
 * "# esta lista ya no tiene en_venta", que es exactamente lo que hay que
 * escribir.
 *
 * Pasó cuatro veces en dos lotes:
 *
 *   1. C3 — `not.toContain('retira del catálogo')` y el comentario de C3 lo cita.
 *   2. C3 — "un solo type=submit" y el comentario de `handleSubmit` lo cita.
 *   3. C4 — `not.toContain("as ShowStatus")` y el comentario de `db.ts` lo cita.
 *   4. C5 — la aserción de que Björk no tiene entrada, y el comentario del
 *      script incluye la entrada como ejemplo de "si cambias de idea".
 *
 * Un comentario no es código. Las aserciones textuales van sobre el fuente sin
 * comentarios; las que no se pueden expresar así son **estructurales** (la clase
 * CSS del botón que se eliminó, el JSX desde `<form`).
 *
 * No es un parser de JavaScript y no pretende serlo: quita los comentarios de
 * bloque y los de fin de línea, a ciegas. Suficiente para lo que hay que
 * comprobar aquí; cuando no lo sea, la aserción debe ser de las estructurales.
 *
 * El límite exacto, con el caso que lo provoca: en
 * `scripts/apply-artist-images.ts` hay un `console.log` con el texto
 * `content-type image/*`, y ese `/*` no es un comentario. El stripper lo toma por
 * uno y se come todo hasta el siguiente cierre. Aquí no rompe nada porque el trozo
 * afectado está **después** de la tabla que los tests miran, pero por eso los
 * tests **recortan** lo que comparan en vez de mirar el fichero entero: un
 * recorte acota el daño de un stripper que no entiende strings.
 */
export function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}