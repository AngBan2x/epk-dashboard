/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdfkit depende de `fontkit` en tiempo de ejecucion y usa `fs` para sus
    // fuentes estandar: si webpack lo empaqueta, `POST /api/export` con
    // `format:"pdf"` revienta con "Cannot find module" en produccion.
    serverComponentsExternalPackages: ["better-sqlite3", "pdfkit"],
    outputFileTracingIncludes: {
      // OBLIGATORIO: el constructor de PDFKit llama a `initFonts()`, que carga
      // la fuente estandar por defecto (Helvetica) con
      // `require('#standard-fonts/Helvetica')` ANTES de que se registre ninguna
      // fuente propia. Ese `require` es dinamico, asi que el tracer de Next no
      // lo ve y el directorio no viaja a la funcion: el PDF daba 500 en
      // produccion y 200 en local, con este error:
      //   Cannot find module '/var/task/.../pdfkit/js/standard-fonts/Helvetica.cjs'
      // Registrar Noto Serif despues no lo evita: el fallo ocurre en el
      // constructor, antes de tocar nada nuestro.
      "/api/export": ["./node_modules/pdfkit/js/standard-fonts/*"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "**.mzstatic.com" },
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is2-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is3-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is4-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is5-ssl.mzstatic.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
  },
};

module.exports = nextConfig;
