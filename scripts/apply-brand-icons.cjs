/**
 * Aplica en lib/social-platforms.ts los paths oficiales de simple-icons (CC0)
 * para las plataformas que tenian aproximaciones geometricas inventadas, y
 * cambia Webflow por BandLab. Vuelve a descargar los iconos: no transcribe.
 *
 * Uso: node scripts/apply-brand-icons.cjs [--dry]
 */
const fs = require("fs");
const FILE = "lib/social-platforms.ts";
const DRY = process.argv.includes("--dry");

// slug de simple-icons por clave interna
const ICONS = {
  threads: "threads",
  "apple-music": "applemusic",
  soundcloud: "soundcloud",
  "amazon-music": "amazonmusic",
  audiomack: "audiomack",
  mixcloud: "mixcloud",
};

const BANDLAB = {
  key: "bandlab",
  label: "BandLab",
  color: "#FEB238",
  placeholder: "https://www.bandlab.com/tu-usuario",
  match: ["bandlab.com"],
  aliases: ["band lab"],
};

async function fetchPath(slug) {
  for (const url of [
    `https://cdn.simpleicons.org/${slug}`,
    `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`,
  ]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const svg = await res.text();
      const vb = svg.match(/viewBox="([^"]+)"/);
      if (vb && vb[1] !== "0 0 24 24") throw new Error(`viewBox inesperado en ${slug}: ${vb[1]}`);
      const d = svg.match(/<path[^>]*\sd="([^"]+)"/);
      if (d) return d[1];
    } catch (e) {
      if (String(e).includes("viewBox inesperado")) throw e;
    }
  }
  return null;
}

(async () => {
  let text = fs.readFileSync(FILE, "utf8");
  const report = [];

  // 1) Reemplazar el path de cada plataforma
  for (const [key, slug] of Object.entries(ICONS)) {
    const d = await fetchPath(slug);
    if (!d) {
      report.push(`  FALLO ${key}: sin path, se deja el icono actual`);
      continue;
    }
    const keyIdx = text.indexOf(`key: "${key}",`);
    if (keyIdx === -1) {
      report.push(`  FALLO ${key}: no encontrada en el archivo`);
      continue;
    }
    // limites de la entrada: desde su key hasta la siguiente clave de nivel superior
    const nextIdx = text.indexOf('key: "', keyIdx + 10);
    const end = nextIdx === -1 ? text.length : nextIdx;
    const block = text.slice(keyIdx, end);
    const before = block.length;
    const newBlock = block.replace(/d: "[^"]*"/, `d: "${d}"`).replace(/fillRule: "\w+"/, 'fillRule: "nonzero"');
    if (newBlock === block) {
      report.push(`  FALLO ${key}: no se encontro d/fillRule en el bloque`);
      continue;
    }
    text = text.slice(0, keyIdx) + newBlock + text.slice(end);
    report.push(`  OK ${key}: path ${before} -> ${newBlock.length} bytes, fillRule=nonzero`);
  }

  // 2) Cambiar Webflow por BandLab (bloque completo)
  const webflowIdx = text.indexOf('key: "webflow",');
  if (webflowIdx === -1) {
    report.push("  FALLO: no se encontro la entrada webflow");
  } else {
    // retroceder al "{" que abre la entrada
    const openIdx = text.lastIndexOf("  {", webflowIdx);
    // avanzar hasta el cierre "  }," de la entrada.
    // OJO: buscar "  }," a secas tambien matchea el cierre del icon anidado
    // (4 espacios), asi que se exige el salto de linea delante.
    const closeIdx = text.indexOf("\n  },", webflowIdx);
    if (openIdx === -1 || closeIdx === -1) {
      report.push("  FALLO: no se pudo delimitar el bloque webflow");
    } else {
      const bandlabBlock = [
        "  {",
        `    key: "${BANDLAB.key}",`,
        `    label: "${BANDLAB.label}",`,
        `    color: "${BANDLAB.color}",`,
        `    placeholder: "${BANDLAB.placeholder}",`,
        `    match: ${JSON.stringify(BANDLAB.match).replace(/"/g, '"')},`,
        `    aliases: ["band lab"],`,
        "    icon: {",
        `      d: "${await fetchPath("bandlab")}",`,
        '      fillRule: "nonzero",',
        "    },",
        "  },",
      ].join("\n");
      text = text.slice(0, openIdx) + bandlabBlock + text.slice(closeIdx + 5);
      report.push("  OK webflow -> bandlab (sustitucion de bloque completo)");
    }
  }

  if (DRY) {
    console.log("DRY-RUN, no se escribe. Acciones:");
    report.forEach((r) => console.log(r));
    return;
  }
  fs.writeFileSync(FILE, text);
  console.log("ESCRITO. Acciones:");
  report.forEach((r) => console.log(r));
})();
