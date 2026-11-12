/**
 * El JSON-LD, con los caracteres que pueden **cerrar la etiqueta** escapados.
 *
 * ## Por qué hace falta
 *
 * `JSON.stringify` escapa las comillas y la barra invertida, pero **no** escapa
 * `<`, `>` ni `/`. El JSON-LD va dentro de un `<script>` y, en HTML, el
 * contenido de un `<script>` se cierra en el **primer `</script>`**, sin
 * importar qué diga el resto. O sea: una biografía con
 * `x</script><img src=y onerror=…>` no "se escapa mal", **cierra el script** y
 * lo que viene detrás lo interpreta el navegador como marcado real.
 *
 * Y esa biografía la escribe el artista, en su propio perfil, sin que nadie lo
 * revise. El resultado se ejecutaba en el navegador de **cualquier visitante**
 * de `/artists/<id>` —incluido un admin que revisara el perfil—, y también en
 * el del buscador.
 *
 * ## Por qué `<` basta
 *
 * Escapando `<` a `<`, un `</script>` deja de existir como tal: el
 * navegador ya no puede cerrar la etiqueta. `>` y `&` se escapan además por
 * robustez, y los separadores de línea U+2028/U+2029 porque son válidos en
 * JSON pero rompen JavaScript si alguien metiera el JSON en un script.
 *
 * ## Por qué el JSON sigue siendo válido
 *
 * `«` es un escape Unicode del JSON, y cualquier parser lo entiende. Google
 * sigue leyendo el JSON-LD igual, y `JSON.parse` devuelve exactamente el
 * objeto original.
 *
 * ## Por qué vive en `lib/` y no en la página
 *
 * Porque es una función **pura**, y una función pura se puede testear sin
 * montar un Server Component de Next. La página la importa; el test la llama.
 */

/** El carácter que cierra una etiqueta `<script>`, escapado. */
const ESCAPED_LT = "\\u003c";

export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, ESCAPED_LT)
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
