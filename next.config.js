/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdfkit depende de `fontkit` en tiempo de ejecucion y usa `fs` para sus
    // fuentes estandar: si webpack lo empaqueta, `POST /api/export` con
    // `format:"pdf"` revienta con "Cannot find module" en produccion.
    //
    // Y NO hay reglas de `outputFileTracingIncludes` a proposito. Cualquier glob
    // que apunte a `node_modules` hace fallar el despliegue con pnpm:
    //   "The framework produced an invalid deployment package for a Serverless
    //    Function. Typically this means that the framework produces files in
    //    symlinked directories."
    // pnpm representa sus paquetes con symlinks y Vercel rechaza el paquete. Por
    // eso el generador de PDF no lee ficheros en tiempo de ejecucion: las Noto
    // Serif van incrustadas en `lib/pdf/fonts.generated.ts` y las fuentes
    // estandar de pdfkit se evitan del todo con `font: null` en el constructor
    // (ver lib/pdf/index.ts). Asi no hay nada que tracear ni symlinks que
    //anglingar el despliegue.
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
