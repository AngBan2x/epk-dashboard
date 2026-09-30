/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdfkit lee sus .afm y las TTF del PDF con `fs` y depende de `fontkit` en
    // tiempo de ejecucion: si webpack lo empaqueta, `POST /api/export?format=pdf`
    // revienta con "Cannot find module" en produccion.
    serverComponentsExternalPackages: ["better-sqlite3", "pdfkit"],
    outputFileTracingIncludes: {
      // Las TTF del PDF se leen por ruta con `fs`, asi que hay que declararlas o
      // la funcion de Vercel no las lleva en su bundle. Van en `lib/pdf/fonts/`
      // y no en `public/` a proposito: `public/` es estatico, se sube al CDN y
      // no existe en el disco de la lambda (con ahi fallaba el PDF en
      // produccion, 500 con 200 en local).
      //
      // Los `data/*` de pdfkit se añaden aunque hoy no se usen: PDFKit resuelve
      // sus fuentes estandar por nombre de fichero en tiempo de ejecucion, asi
      // que el tracer de Next no puede verlas y no las mete solo.
      "/api/export": ["./lib/pdf/fonts/*.ttf", "./node_modules/pdfkit/js/data/*"],
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
