/**
 * P12, filas 9 y 10 — cada pista usa su propio medio, y una vista que no se ve.
 *
 * ## Fila 9: por qué se quitó el `youtube_video_id` de reserva
 *
 * `buildReleaseQueue` recibía el `youtube_video_id` **de la cabecera** del
 * release y lo usaba como reserva para las hijas sin medio propio. El efecto,
 * con el catálogo actual: un álbum con vídeo de portada metía a todas sus hijas
 * en la cola, cada una sonaba desde el vídeo de la portada y se cortaba a los
 * **30 segundos** —el techo por defecto de `resolvePlaybackTimeline`, porque
 * `mediaDuration` se pasa a `0` a propósito— y avanzaba sola.
 *
 * El dueño del catálogo decidió que una hija use solo lo suyo. Si no tiene
 * preview ni vídeo propio, **no suena**.
 *
 * ## Fila 10: por qué se borró `ReleaseTracklistSection`
 *
 * No por estar feo ni por duplicar: por ser **inalcanzable**. `/track/<id>` solo
 * llega a renderizar cuando la fila es un huérfano —tiene `release_id` y su
 * padre no existe— porque en cualquier otro caso `resolveTrackRoute` devuelve
 * `release` y el `redirect()` lanza (`lib/releases.ts:144-162`). Y un huérfano no
 * puede tener hijas: tenerlas significaría que su id es una cabecera, y entonces
 * no sería un huérfano. La rama pedía `children.length > 0`.
 *
 * Que sea verdad se comprobó contra el dato: `scripts/turso-check.ts` reporta
 * `seed_huerfanas = 0` en producción.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { buildReleaseQueue } from "@/components/ReleaseTrackList";
import { getPlayableAudioSource, resolvePlaybackTimeline } from "@/lib/audio-priority";
import type { Track } from "@/types/music";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

const pista = (over: Partial<Track>): Track =>
  ({
    id: "x",
    title: "Pista",
    artist_name: "Artista",
    duration: "03:00",
    audio_preview_url: null,
    youtube_video_id: null,
    ...over,
  }) as Track;

describe("cada pista de la cola usa su propio medio", () => {
  it("una hija con preview propio suena a su preview", () => {
    const cola = buildReleaseQueue([pista({ audio_preview_url: "https://p/preview.m4a" })]);
    expect(cola).toHaveLength(1);
    expect(cola[0].audioUrl).toBe("https://p/preview.m4a");
  });

  it("una hija con su propio YouTube usa ese vídeo, no el de la cabecera", () => {
    const cola = buildReleaseQueue([pista({ youtube_video_id: "dQw4w9WgXcQ" })], undefined, "HEADER00000");
    expect(cola[0].youtubeVideoId).toBe("dQw4w9WgXcQ");
  });

  it("una hija sin medio propio NO entra en la cola, aunque la cabecera tenga vídeo", () => {
    // Este es el fallo que se arregla. Antes, `fallbackVideoId` hacía que esta
    // pista entrara con el vídeo del álbum y sonara 30 s.
    const cola = buildReleaseQueue([pista({})], undefined, "HEADER00000");
    expect(cola).toHaveLength(0);
  });

  it("el vídeo de la cabecera no llega a ninguna hija de un álbum entero", () => {
    const hijas = [
      pista({ id: "h1", youtube_video_id: "XqZsoesa55w" }),
      pista({ id: "h2" }),
      pista({ id: "h3", audio_preview_url: "https://p/m3.m4a" }),
    ];
    const cola = buildReleaseQueue(hijas, undefined, "HEADER00000");
    expect(cola.map((i) => i.id)).toEqual(["h1", "h3"]);
    expect(cola.every((i) => i.youtubeVideoId !== "HEADER00000")).toBe(true);
  });

  it("`sourceType` se estrecha solo, sin `as`", () => {
    // El ternario anterior llevaba `as AudioSourceType` porque el import se
    // eliminó. Un narrowing innecesario es ruido que esconde el tipo real.
    const SRC = read("components/ReleaseTrackList.tsx");
    expect(SRC).toMatch(/sourceType: audioUrl === "" \? "youtube" : "preview",/);
    expect(SRC).not.toMatch(/sourceType:[^,\n]*\bas\b/);
  });
});

describe("ReleaseTracklistSection no vuelve", () => {
  it("el componente no existe", () => {
    expect(
      existsSync(path.resolve(process.cwd(), "components/ReleaseTracklistSection.tsx")),
      "el componente sigue en disco"
    ).toBe(false);
  });

  it("nadie lo importa", () => {
    const raices = ["app", "components", "lib", "context"];
    const ofensores: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(path.resolve(process.cwd(), dir))) {
        const completa = path.join(dir, e);
        if (statSync(path.resolve(process.cwd(), completa)).isDirectory()) recorrer(completa);
        else if (/\.tsx?$/.test(e)) {
          const src = read(completa);
          // Solo la importación cuenta; el comentario que explica por qué se
          // borró tiene que poder nombrarlo.
          if (/^\s*import[^\n]*ReleaseTracklistSection/m.test(src)) ofensores.push(completa);
        }
      }
    };
    raices.forEach(recorrer);
    expect(ofensores).toEqual([]);
  });

  it("la rama que lo montaba exigía hijas, y un huerfano no tiene", () => {
    // El razonamiento escrito, para que nadie lo reabra sin comprobarlo:
    // `isRelease = children.length > 0`, y la página solo renderiza para
    // huérfanos.
    const PAGE = read("app/track/[id]/page.tsx");
    expect(PAGE).toMatch(/const isRelease = children\.length > 0;/);
    // `redirect()` lanza, así que un `release` no llega a renderizarse.
    expect(PAGE).toMatch(/if \(route\.kind === "release"\) redirect\(route\.href\);/);
    // Y el único kind que renderiza es el que tiene `release_id` sin padre.
    const ROUTES = read("lib/releases.ts");
    expect(ROUTES).toMatch(/if \(!parent\) return \{ kind: "orphan"/);
  });
});

describe("lo que el reproductor sigue haciendo a propósito", () => {
  it("una pista de YouTube se limita al techo, y eso es intencionado", () => {
    // No es un bug pendiente: `context/AudioPlayerContext.tsx` pasa
    // `mediaDuration: 0` a propósito, y el fallback de 30 s es el
    // "comportamiento previo" que el comentario de allí describe. Se deja
    // constancia para que la auditoría siguiente no lo vuelva a reportar.
    const segment = resolvePlaybackTimeline({
      sourceType: "youtube",
      declaredStart: 0,
      declaredEnd: 501,
    });
    expect(segment.end).toBe(30);
  });

  it("un preview no hereda los capítulos del catálogo", () => {
    // Un preview de iTunes dura 30 s: enseñarle un rango de 8:21 produce un
    // scrubber con `min=265` y un `seek()` fuera de rango que salta de pista.
    const segment = resolvePlaybackTimeline({
      sourceType: "preview",
      declaredStart: 265,
      declaredEnd: 501,
    });
    expect(segment.start).toBe(0);
    expect(segment.end).toBeLessThanOrEqual(30);
  });

  it("'—' no cuenta como un vídeo", () => {
    // El guard de URL sabía que `"—"` está vacío desde P7; el de YouTube no lo
    // sabía, y un valor así daba botón habilitado y un player con id inválido.
    expect(getPlayableAudioSource({ audio_preview_url: null, youtube_video_id: "—" })).toBeNull();
  });

  it("'N/A' y un id pegado con espacios tampoco", () => {
    // Se exige el formato entero del id (11 caracteres de [A-Za-z0-9_-]) en vez
    // de un subconjunto: una URL pegada en el campo es un error de tecleo, no
    // una pista reproducible, y antes producía un embed imposible.
    expect(getPlayableAudioSource({ youtube_video_id: "N/A" })).toBeNull();
    expect(getPlayableAudioSource({ youtube_video_id: "https://youtube.com/watch?v=dQw4w9WgXcQ" })).toBeNull();
    expect(getPlayableAudioSource({ youtube_video_id: "  dQw4w9WgXcQ  " })).not.toBeNull();
  });
});
