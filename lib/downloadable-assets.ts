/**
 * Genera HTML para el Rider Tecnico descargable.
 * Si se proveen datos de dossier, los usa; si no, usa defaults.
 */
export function generateRiderHTML(artistName: string, dossierData?: Record<string, string | null> | null): string {
  const date = new Date().toLocaleDateString("es-VE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const year = new Date().getFullYear();

  const d = dossierData || {};
  const pa = d.rider_pa_system || "Line Array - Minimo 15,000W RMS";
  const monitors = d.rider_monitors || "Minimo 4 mezclas in-ear o wedge";
  const console_ = d.rider_console || "Digital - minimo 32 canales";
  const subs = d.rider_subwoofers || "Minimo 4 sub-graves (18 o 21)";
  const guitar = d.rider_guitar || "Amplificador Combo 100W o Head + Cabinet";
  const bass = d.rider_bass || "Amplificador Combo 300W minimo";
  const drums = d.rider_drums || "Kit completo + hardware + baquetas";
  const keys = d.rider_keyboards || "Piano digital 88 teclas con sustain";
  const lighting = d.rider_lighting || "Iluminacion basica con focus en escenario";
  const stageSize = d.rider_stage_size || "Minimo 6m x 4m";
  const stageCond = d.rider_stage_conditions || "Escenario cubierto y seco";
  const hospitality = d.rider_hospitality || "Agua natural, cafe, frutas frescas, snacks antes del show";
  const transport = d.rider_transport || "Transporte desde hotel al venue incluido";
  const notes = d.rider_special_notes || "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rider Tecnico - ${artistName}</title>
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
    .notes { padding: 1rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; color: #92400e; font-size: 0.9rem; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; text-align: center; }
    @media print { body { padding: 1rem; } .section { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>Rider Tecnico &mdash; ${artistName}</h1>
  <p><strong>Artista:</strong> ${artistName}</p>
  <p><strong>Fecha:</strong> ${date}</p>

  <div class="section">
    <h2>Equipo de Sonido</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Sistema PA</div><div class="item-value">${pa}</div></div>
      <div class="item"><div class="item-label">Monitores</div><div class="item-value">${monitors}</div></div>
      <div class="item"><div class="item-label">Consola FOH</div><div class="item-value">${console_}</div></div>
      <div class="item"><div class="item-label">Subwoofers</div><div class="item-value">${subs}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Backline</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Guitarra</div><div class="item-value">${guitar}</div></div>
      <div class="item"><div class="item-label">Bajo</div><div class="item-value">${bass}</div></div>
      <div class="item"><div class="item-label">Bateria</div><div class="item-value">${drums}</div></div>
      <div class="item"><div class="item-label">Teclados</div><div class="item-value">${keys}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Escenario</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Iluminacion</div><div class="item-value">${lighting}</div></div>
      <div class="item"><div class="item-label">Tamano minimo</div><div class="item-value">${stageSize}</div></div>
      <div class="item"><div class="item-label">Condiciones</div><div class="item-value">${stageCond}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Hospitality</h2>
    <p>${hospitality}</p>
  </div>

  <div class="section">
    <h2>Transporte</h2>
    <p>${transport}</p>
  </div>

  ${notes ? `<div class="section"><h2>Notas Especiales</h2><div class="notes">${notes}</div></div>` : ""}

  <div class="footer">
    <p>Generado por PressPlay &middot; ${year}</p>
  </div>
</body>
</html>`;
}

/**
 * Genera HTML para el Dossier de Prensa descargable.
 * Si se proveen datos de dossier, los usa; si no, usa defaults.
 */
export function generateDossierHTML(artistName: string, dossierData?: Record<string, string | null> | null): string {
  const date = new Date().toLocaleDateString("es-VE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const year = new Date().getFullYear();

  const d = dossierData || {};
  const biography = d.biography || `${artistName} es un artista multidisciplinario con trayectoria en produccion musical, composicion y performance en vivo.`;
  const pressText = d.press_text || "";
  const genre = d.genre || "";
  const location = d.location || "";
  const influences = d.influences || "";
  const contactEmail = d.contact_email || d.booking_email || "booking@epk-dashboard.com";
  const management = d.management || "PressPlay Records";
  const website = d.website || "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PressPlay &mdash; Dossier de Prensa</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Georgia', serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #0f172a; }
    h1 { font-size: 2.5rem; border-bottom: 4px solid #db2777; padding-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; color: #be185d; margin-top: 2rem; }
    .meta { color: #475569; font-size: 0.9rem; margin: 0.3rem 0; }
    .section { margin: 1.5rem 0; padding: 1.5rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
    .press-text { font-style: italic; border-left: 3px solid #db2777; padding-left: 1rem; margin: 1rem 0; }
    .tags { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
    .tag { display: inline-block; background: #fce7f3; color: #be185d; border-radius: 9999px; padding: 0.2rem 0.8rem; font-size: 0.8rem; font-weight: bold; }
    @media print { body { padding: 1rem; } }
  </style>
</head>
<body>
  <h1>${artistName} &mdash; Dossier de Prensa</h1>
  <p class="meta">Generado el ${date}</p>
  ${genre ? `<p class="meta"><strong>Genero:</strong> ${genre}</p>` : ""}
  ${location ? `<p class="meta"><strong>Ubicacion:</strong> ${location}</p>` : ""}

  <div class="section">
    <h2>Biografia</h2>
    <p>${biography}</p>
  </div>

  ${pressText ? `<div class="section"><h2>Prensa</h2><div class="press-text">${pressText}</div></div>` : ""}

  ${influences ? `
  <div class="section">
    <h2>Influencias</h2>
    <div class="tags">
      ${influences.split(",").map((inf) => `<span class="tag">${inf.trim()}</span>`).join("\n      ")}
    </div>
  </div>` : ""}

  <div class="section">
    <h2>Contacto</h2>
    <p class="meta"><strong>Email:</strong> ${contactEmail}</p>
    ${management ? `<p class="meta"><strong>Management:</strong> ${management}</p>` : ""}
    ${website ? `<p class="meta"><strong>Web:</strong> ${website}</p>` : ""}
  </div>

  <div style="margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; text-align: center;">
    <p>Generado por PressPlay &middot; ${year}</p>
  </div>
</body>
</html>`;
}
