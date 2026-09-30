/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdfkit lee sus .afm y las TTF del PDF con `fs` y depende de `fontkit` en
    // tiempo de ejecucion: si webpack lo empaqueta, `POST /api/export?format=pdf`
    // revienta con "Cannot find module" en produccion.
    serverComponentsExternalPackages: ["better-sqlite3", "pdfkit"],
    outputFileTracingIncludes: {
      // Las TTF del PDF se leen por ruta, asi que hay que declararlas o el
      // despliegue de Vercel no las copia.
      "/api/export": ["./public/fonts/*.ttf"],
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
