/**
 * Genera HTML para el Rider Técnico descargable.
 */
export function generateRiderHTML(artistName: string): string {
  const date = new Date().toLocaleDateString("es-VE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rider Técnico - ${artistName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #0f172a; line-height: 1.6; }
    h1 { font-size: 2rem; color: #0f172a; border-bottom: 4px solid #10b981; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
    h2 { font-size: 1.3rem; color: #047857; margin: 2rem 0 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .section { margin-bottom: 2rem; padding: 1.5rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .item { padding: 0.75rem; background: white; border-radius: 8px; border: 1px solid #e2e8f0; }
    .item-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .item-value { font-size: 1rem; color: #0f172a; font-weight: 500; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; text-align: center; }
    @media print { body { padding: 1rem; } .section { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>🎤 Rider Técnico</h1>
  <p><strong>Artista:</strong> ${artistName}</p>
  <p><strong>Fecha:</strong> ${date}</p>

  <div class="section">
    <h2>Equipo de Sonido</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Sistema PA</div><div class="item-value">Line Array - Mínimo 15,000W RMS</div></div>
      <div class="item"><div class="item-label">Monitores</div><div class="item-value">Mínimo 4 mezclas in-ear o wedge</div></div>
      <div class="item"><div class="item-label">Consola FOH</div><div class="item-value">Digital - mínimo 32 canales</div></div>
      <div class="item"><div class="item-label">Subwoofers</div><div class="item-value">Mínimo 4 sub-graves (18&quot; o 21&quot;)</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Backline</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Guitarra</div><div class="item-value">Amplificador Combo 100W o Head + Cabinet</div></div>
      <div class="item"><div class="item-label">Bajo</div><div class="item-value">Amplificador Combo 300W mínimo</div></div>
      <div class="item"><div class="item-label">Batería</div><div class="item-value">Kit completo +.hardware + baquetas</div></div>
      <div class="item"><div class="item-label">Teclados</div><div class="item-value">Piano digital 88 teclas con sustain</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Rider de Catering</h2>
    <p>Agua natural, café, frutas frescas, snacks antes del show.</p>
  </div>

  <div class="footer">
    <p>Generado por PressPlay · ${year}</p>
  </div>
</body>
</html>`;
}

/**
 * Genera HTML para el Dossier de Prensa descargable.
 */
export function generateDossierHTML(artistName: string): string {
  const date = new Date().toLocaleDateString("es-VE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PressPlay — Dossier de Prensa</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Georgia', serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #0f172a; }
    h1 { font-size: 2.5rem; border-bottom: 4px solid #db2777; padding-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; color: #be185d; margin-top: 2rem; }
    .track { border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; margin: 1rem 0; page-break-inside: avoid; }
    .badge { display: inline-block; background: #fce7f3; color: #be185d; border-radius: 9999px; padding: 0.2rem 0.8rem; font-size: 0.8rem; font-weight: bold; margin-bottom: 0.5rem; }
    .meta { color: #475569; font-size: 0.9rem; margin: 0.3rem 0; }
    .stats { display: flex; gap: 2rem; margin: 1rem 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #db2777; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }
    @media print { body { padding: 1rem; } }
  </style>
</head>
<body>
  <h1>🎵 PressPlay — Dossier de Prensa</h1>
  <p class="meta">Generado el ${date}</p>

  <h2>Biografía</h2>
  <p class="meta">Artista multidisciplinario con trayectoria en producción musical, composición y performance en vivo. Catálogo que abarca desde rock clásico hasta producción electrónica contemporánea.</p>

  <h2>Contacto</h2>
  <p class="meta"><strong>Email:</strong> booking@epk-dashboard.com</p>
  <p class="meta"><strong>Management:</strong> PressPlay Records</p>

  <div class="footer" style="margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; text-align: center;">
    <p>Generado por PressPlay · ${year}</p>
  </div>
</body>
</html>`;
}
