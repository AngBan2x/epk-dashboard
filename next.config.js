/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdfkit depende de `fontkit` en tiempo de ejecucion y usa `fs` para sus
    // fuentes estandar: si webpack lo empaqueta, `POST /api/export` con
    // `format:"pdf"` revienta con "Cannot find module" en produccion.
    //
    // Las Noto Serif NO se traces: van incrustadas en el bundle desde
    // `lib/pdf/fonts.generated.ts`. Antes se leian con `fs` y se declaraban aqui
    // con `outputFileTracingIncludes`, y eso daba 500 en produccion y 200 en
    // local: obligaba a que el fichero estuviera en el disco de la funcion, que
    // no se puede comprobar sin desplegar. Sin ficheros que leer, esta seccion
    // no tiene nada mas que mantener.
    serverComponentsExternalPackages: ["better-sqlite3", "pdfkit"],
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
