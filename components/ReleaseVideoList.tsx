import Image from "next/image";
import { imageOptimizationProps } from "@/lib/image-config";
import { safeString } from "@/lib/null-safe";
import { showableVideo } from "@/lib/release-page";
import type { Track } from "@/types/music";

/**
 * ## Los videoclips oficiales de un lanzamiento
 *
 * Es un **Server Component**, y esa es la decisión de diseño que lo define: son
 * N tarjetas y ninguna necesita estado. Un `<details>` nativo es accesible con
 * teclado, no necesita JS y no arrastra un componente de cliente por pista —
 * `ProductionDetails` son 277 líneas con `framer-motion` y un `useEffect` por
 * instancia, y 12 de esas en una página de álbum son 12 peticiones a
 * `/api/auth/me` para nada.
 *
 * ## Por qué solo `videoclip` (y `null`)
 *
 * `showableVideo` (`lib/release-page.ts`) es quien decide, y su tabla está
 * escrita ahí al lado. Resumen: un `- Topic` autogenerado por YouTube o un
 * directo **no** son el videoclip de la pista, y enseñarlos con ese nombre sería
 * afirmar algo falso. El catálogo tiene hoy 11 `live` y 17 `topic_audio` entre sus
 * hijas y **0 `videoclip`**, así que esta sección **no se monta** en producción:
 * está para cuando alguien curate el dato, y para que la regla sea explícita y
 * testeada en vez de depender de que nadie se acuerde.
 *
 * ## Por qué un enlace y no un reproductor
 *
 * Un reproductor embebido por pista son 10 iframes de YouTube en una página: 10
 * cookies antes de que el visitante haga nada, y el vídeo vive en el canal del
 * artista, que es donde está para verlo y compartirlo. La miniatura es la misma
 * que usa `VideoShowcase` (`hqdefault.jpg`).
 */
export function ReleaseVideoList({
  tracks,
  releaseTitle,
}: {
  tracks: readonly Track[];
  releaseTitle: string;
}) {
  const withVideo = tracks
    .map((track) => ({ track, video: showableVideo(track) }))
    .filter((entry): entry is { track: Track; video: NonNullable<ReturnType<typeof showableVideo>> } =>
      entry.video !== null
    );

  if (withVideo.length === 0) return null;

  return (
    <section className="mb-8" aria-labelledby="release-videos">
      <h2 id="release-videos" className="text-xl font-bold text-slate-900 dark:text-white mb-4">
        Videoclips oficiales
      </h2>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        {withVideo.length === 1
          ? "1 de las pistas tiene videoclip oficial."
          : `${withVideo.length} de las pistas tienen videoclip oficial.`}
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {withVideo.map(({ track, video }) => {
          /**
           * `hqdefault.jpg` no está **garantizada** por YouTube: solo existe si
           * el vídeo tiene miniatura de alta calidad. La que sí existe siempre es
           * `default.jpg`.
           *
           * Se comprobó contra los 10 vídeos con `youtube_video_id` del catálogo
           * y los 10 responden 200 en `hqdefault`, así que hoy no se ve el
           * problema. Aun así aquí **no** hay `onError` que la sustituyan, y es
           * deliberado por dos motivos:
           *
           * 1. Convertir este componente en cliente para tener estado rompe una
           *    decisión documentada arriba (N tarjetas, ninguna necesita estado)
           *    y arrastra un bundle de cliente por pista.
           * 2. Con los datos de hoy esta sección **no se monta**: los 28 vídeos
           *    de las hijas son 11 `live` y 17 `topic_audio`, y `showableVideo`
           *    no enseña ninguno. No hay nada que ver.
           *
           * Si algún día entra un `videoclip` curado cuya `hqdefault` dé 404, el
           * sitio del arreglo es este: o un hijo cliente mínimo que la oculte, o
           * un `<img>` con `onerror` en línea. Lo que **no** hay que hacer es
           * poner una miniatura de otra pista, que sería un dato falso.
           */
          const thumbnail = video.youtubeVideoId
            ? `https://img.youtube.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
            : null;
          const href =
            video.videoEmbedUrl ??
            (video.youtubeVideoId
              ? `https://www.youtube.com/watch?v=${video.youtubeVideoId}`
              : null);
          const title = safeString(track.title);
          return (
            <li key={track.id}>
              {/*
                El enlace envuelve la miniatura y el texto, y el `alt` de la
                imagen queda **vacío**: el nombre de la pista ya está en el
                `span` de al lado, y una imagen decorativa con `alt` repetido
                hace que un lector de pantalla diga el título dos veces.
              */}
              <a
                href={href ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary-600 dark:focus-visible:ring-offset-slate-950"
              >
                {thumbnail ? (
                  <Image
                    src={thumbnail}
                    alt=""
                    width={160}
                    height={90}
                    {...imageOptimizationProps(thumbnail)}
                    className="h-[90px] w-[160px] shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-primary-700 dark:text-slate-100 dark:group-hover:text-primary-300">
                    {title}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {safeString(track.artist_name)} · Ver en YouTube
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {/* `sr-only`: el nombre del lanzamiento ya está en el h1 de la página. */}
      <p className="sr-only">Videoclips oficiales de {releaseTitle}</p>
    </section>
  );
}
