# Fuentes del PDF de prensa

`NotoSerif-Regular.ttf` y `NotoSerif-Bold.ttf` se usan en `lib/pdf/` para generar
`POST /api/export?format=pdf`.

## Por que estan aqui y no en node_modules

Los Helvetica que trae PDFKit son WinAnsi: no cubren el castellano acentuado
(ñ, á, é, ¿, ¡…) ni los signos tipograficos, y PDFKit no lanza error ante un
glifo ausente, lo dibuja como un hueco. Sin una TTF registrada, "Amanece" puede
salir con la enye partida sin que nada avise.

## Procedencia y licencia

- Fuente: [Noto Serif](https://github.com/notofonts/noto-fonts), ficheros hinted
  de `notofonts/noto-fonts` (`hinted/ttf/NotoSerif/NotoSerif-{Regular,Bold}.ttf`).
- Licencia: SIL Open Font License 1.1, incluida en `OFL.txt`. La OFL permite
  redistribuir y modificar la fuente, siempre que se mantenga la licencia.
- No hay ninguna dependencia npm asociada: son ficheros estaticos del repositorio.

## Por que `public/`

Es el unico directorio que el despliegue de Vercel incluye siempre completo, asi
que `lib/pdf/fonts.ts` puede leerlas por ruta sin depender de file tracing. Se
declara ademas en `next.config.js` (`outputFileTracingIncludes`) por si acaso.
