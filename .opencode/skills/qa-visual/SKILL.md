---
name: qa-visual
description: Workflow de testing visual con Playwright: screenshots, análisis de DOM, regression visual y accessibility audit.
---

# Skill: QA Visual

Workflow completo para verificar la calidad visual de la aplicación PressPlay.

## Instrucciones para el Agente

### Precondiciones
- Aplicación corriendo en `http://localhost:3000`
- Playwright instalado (`npx playwright`)
- Chromium disponible

### Flujo de Ejecución

#### Paso 1: Capturar Screenshots de Todas las Páginas

```bash
# Crear directorio para screenshots
mkdir -p screenshots/{light,dark,mobile}

# Páginas a capturar
PAGES=("/" "/dashboard" "/login" "/register" "/admin" "/artists" "/upload")

# Light mode
for page in "${PAGES[@]}"; do
  name=$(echo $page | sed 's|/|_|g; s|^_||')
  npx playwright screenshot --browser chromium --full-page "http://localhost:3000${page}" "screenshots/light/${name:-home}.png"
done

# Dark mode
for page in "${PAGES[@]}"; do
  name=$(echo $page | sed 's|/|_|g; s|^_||')
  npx playwright screenshot --browser chromium --full-page --color-scheme dark "http://localhost:3000${page}" "screenshots/dark/${name:-home}.png"
done

# Mobile (375x812 - iPhone)
for page in "${PAGES[@]}"; do
  name=$(echo $page | sed 's|/|_|g; s|^_||')
  npx playwright screenshot --browser chromium --full-page --viewport-size "375,812" "http://localhost:3000${page}" "screenshots/mobile/${name:-home}.png"
done
```

#### Paso 2: Inspeccionar DOM

```bash
# Verificar headings hierarchy
npx playwright evaluate --browser chromium "http://localhost:3000/dashboard" "
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach(h => console.log(h.tagName + ': ' + h.textContent.trim()));
"

# Verificar errores de console
npx playwright evaluate --browser chromium "http://localhost:3000" "
  window.addEventListener('error', e => console.error('ERROR:', e.message));
"
```

#### Paso 3: Verificar Contraste

```bash
# Evaluar contraste de elementos clave
npx playwright evaluate --browser chromium "http://localhost:3000/dashboard" "
  const elements = document.querySelectorAll('h1, p, a, button');
  elements.forEach(el => {
    const style = getComputedStyle(el);
    console.log(el.tagName + ': color=' + style.color + ', bg=' + style.backgroundColor);
  });
"
```

#### Paso 4: Generar Reporte

Crear archivo `screenshots/REPORT.md` con:
- Lista de screenshots capturados
- Issues encontrados por página
- Clasificación por severidad
- Sugerencias de corrección

### Criterios de Aprobación

| Check | Umbral |
|-------|--------|
| Screenshots capturados | Todas las páginas (light/dark/mobile) |
| Headings hierarchy | h1 único por página, sin saltos |
| Contraste WCAG AA | 4.5:1 mínimo |
| Errores console | 0 errores críticos |
| Responsive | Funciona en 320px-1920px |

### Comandos de Verificación Rápida

```bash
# Contar screenshots
ls -la screenshots/light/ screenshots/dark/ screenshots/mobile/ | wc -l

# Verificar tamaño de archivos (no muy grandes)
du -sh screenshots/*

# Buscar issues comunes en screenshots
grep -r "error\|warning\|broken" screenshots/ || echo "No issues found"
```
