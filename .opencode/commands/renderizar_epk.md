---
name: renderizar_epk
description: Genera un componente de tarjeta EPK responsivo para un sencillo o EP del catálogo musical.
---

### Instrucciones para el Agente:
1. Lee el archivo de datos `data/catalog.json` (o la tabla SQLite `tracks`).
2. Genera un componente UI responsivo (React/Tailwind) para la canción especificada que incluya:
   - Portada del tema y reproductor de audio embebido.
   - Ficha de producción: Cadenas de efectos de guitarra, amplificadores y DAW utilizado.
   - Botón de despliegue para ver la letra.
3. Aplica protecciones contra valores nulos (`null checks`) en caso de que la canción no posea videoclip o ficha de equipamiento completa.