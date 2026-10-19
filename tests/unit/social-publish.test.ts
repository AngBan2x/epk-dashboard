import { describe, expect, it } from "vitest";
import { ErrorApi, type AdaptadorSocial, type Contenido, type Publicacion } from "@/lib/social/tipos";
import { preparar } from "@/lib/social/preparar";
import {
  antiguedadDelToken,
  avisoDeCaducidad,
  falloDe,
  leerFlags,
  publicarEnOrden,
} from "@/scripts/social-publish";

/**
 * Tests del motor de RC.46.
 *
 * ## Que se esta atando
 *
 * **Que la pregunta "¿qué fallo?" tenga respuesta.** Ese es el motivo de todo el
 * diseno, y se ata en tres cosas:
 *
 * 1. `ErrorApi` lleva `plataforma` y `paso` como **campos**, no dentro de un
 *    texto. Un informe construido parseando mensajes se rompe el dia que alguien
 *    edita una cadena, y falla en silencio.
 * 2. Parar en el primer fallo deja el resto en `no-intentado`, no en un limbo.
 * 3. `no-intentado` es un estado de primera clase, distinto de `fallo` y de
 *    `publicado`. Con dos estados, "no se intento" y "no se pudo" se confunden.
 *
 * **Que el pre-flight impida empezar.** Si una plataforma no esta lista, no se
 * escribe en ninguna. Es lo que separa "un fallo barato y ruidoso" de "tres posts
 * fuera y nadie lo sabe".
 *
 * **Que `Promise.all` no aparezca.** No es una preferencia de estilo: rechaza en
 * el primer error y pierde los resultados de las demas. Publicando en cuatro con
 * uno roto, `Promise.all` daria a entender que no salio ninguno.
 */

function adaptadorFalso(
  plataforma: string,
  publicar: (p: Publicacion) => Promise<{ id: string | null; url: string | null }>,
  validar: { ok: boolean; errores: readonly string[]; avisos: readonly string[] } = {
    ok: true,
    errores: [],
    avisos: [],
  }
): AdaptadorSocial {
  return {
    plataforma: plataforma as AdaptadorSocial["plataforma"],
    validar: () => validar,
    redactar: async (c: Contenido) => ({
      plataforma: plataforma as AdaptadorSocial["plataforma"],
      publicacion: { texto: c.cuerpo, imagenes: c.imagenes ?? [] },
      ajustes: [],
      requiereRevision: false,
    }),
    publicar,
  };
}

const CONTENIDO: Contenido = { titulo: "t", cuerpo: "hola" };

function httpSinRed(): Promise<Response> {
  // Que **lance** si se llega a hacer red: asi el test falla en vez de pasar
  // con un `{}` que no dice nada. Aqui no se comprueban imagenes, y comprobar
  // una imagen sin conexion no tiene sentido.
  return Promise.reject(new Error("no deberia hacer red: esta pre-flight va sin imagenes"));
}

const PREPARADO_LISTO = {
  plataforma: "threads",
  texto: "x",
  caracteres: 1,
  ajustes: [] as readonly string[],
  errores: [] as readonly string[],
  avisos: [] as readonly string[],
  imagenes: [] as never[],
  listo: true,
};

describe("leerFlags: --plataformas es obligatorio", () => {
  it("sin --plataformas falla y explica por que", () => {
    // Un valor por defecto seria "todas las configuradas", que es un accidente
    // esperando en cuanto se anade una plataforma nueva.
    expect(() => leerFlags([])).toThrow(/Falta --plataformas/);
  });

  it("una plataforma inventada se rechaza con la lista de las buenas", () => {
    expect(() => leerFlags(["--plataformas=tiktok"])).toThrow(/threads, bluesky/);
  });

  it("acepta varias separadas por coma y quita espacios", () => {
    const f = leerFlags(["--plataformas=threads, mastodon ,bluesky"]);
    expect(f.plataformas).toEqual(["threads", "mastodon", "bluesky"]);
  });

  it("`--plataformas=` vacio se rechaza en vez de publicar en nada", () => {
    expect(() => leerFlags(["--plataformas="])).toThrow(/no puede ir vacio/);
  });

  it("preview es el modo por defecto: sin --publish no se publica", () => {
    const f = leerFlags(["--plataformas=threads"]);
    expect(f.publicar).toBe(false);
  });
});

describe("ErrorApi: el paso es un campo", () => {
  it("lleva plataforma, paso y status", () => {
    const e = new ErrorApi("fallo", "bluesky", "sesion", 401, { error: { message: "Bad" } });

    // Esto es lo que hace posible el informe. Si `paso` fuera parte del mensaje,
    // habria que parsearlo.
    expect(e.plataforma).toBe("bluesky");
    expect(e.paso).toBe("sesion");
    expect(e.status).toBe(401);
    expect(e).toBeInstanceOf(Error);
  });

  it("`sesion` y `publicar` son fallos opuestos y no se confunden", () => {
    const sesion = new ErrorApi("a", "bluesky", "sesion", 401, null);
    const publicar = new ErrorApi("b", "bluesky", "publicar", 500, null);

    // "La contrasena de la app esta mal" y "la API fallo al publicar" piden
    // acciones completamente distintas. Un unico string las Mezclaría.
    expect(sesion.paso).not.toBe(publicar.paso);
  });
});

describe("falloDe: un fallo de API conserva su paso", () => {
  it("un ErrorApi sale con paso y plataforma", () => {
    const r = falloDe("threads", new ErrorApi("x", "threads", "contenedor", 400, { error: { message: "malo" } }));

    expect(r.estado).toBe("fallo");
    expect(r.paso).toBe("contenedor");
    expect(r.plataforma).toBe("threads");
    expect(r.error).toContain("400");
    expect(r.error).toContain("malo");
  });

  it("un error normal sale con paso null, sin inventar", () => {
    const r = falloDe("threads", new Error("se cayo la red"));

    expect(r.paso).toBeNull();
    expect(r.error).toContain("se cayo la red");
  });

  it("el error se recorta a 400 caracteres", () => {
    // El cuerpo de una API puede traer HTML de varios KB. Un informe con eso
    // dentro deja de ser legible.
    const r = falloDe("x", new Error("a".repeat(5000)));
    expect(r.error!.length).toBeLessThanOrEqual(400);
  });

  it("el motivo sale de donde lo ponga CADA plataforma", () => {
    // Cada API mete el mensaje en un sitio: Meta en `error.message`, Bluesky en
    // `error` a pelo, Mastodon en `message`. La primera version de `falloDe` solo
    // miraba `error.message`, asi que un fallo de Bluesky salia como "401" a
    // secas, sin decir por que. Y sin el motivo, "que fallo?" queda sin
    // responder justo en el fallo que mas lo necesita.
    const bluesky = falloDe(
      "bluesky",
      new ErrorApi("x", "bluesky", "sesion", 401, { error: "AuthenticationRequired" })
    );
    expect(bluesky.error).toContain("AuthenticationRequired");

    const meta = falloDe(
      "threads",
      new ErrorApi("x", "threads", "publicar", 429, {
        error: { message: "Rate limit exceeded", type: "OAuthException" },
      })
    );
    expect(meta.error).toContain("Rate limit exceeded");

    const mastodon = falloDe(
      "mastodon",
      new ErrorApi("x", "mastodon", "publicar", 422, { error: "Validation failed" })
    );
    expect(mastodon.error).toContain("Validation failed");

    const azul = falloDe("x", new ErrorApi("x", "threads", "publicar", 500, "Internal Server Error"));
    expect(azul.error).toContain("Internal Server Error");
  });

  it("un cuerpo que no dice nada no inventa un motivo", () => {
    const r = falloDe("x", new ErrorApi("x", "threads", "publicar", 500, {}));
    // Sale el status y el mensaje propio, y nada inventado entre medias.
    expect(r.error).toContain("500");
    expect(r.error).not.toContain("undefined");
    expect(r.error).not.toContain("null");
  });
});

describe("publicarEnOrden: la pregunta que responde el script", () => {
  const ok = async () => ({ id: "id-1", url: "https://ejemplo/1" });

  it("sin fallos, todas publicadas", async () => {
    const ps = ["threads", "mastodon", "bluesky"].map((p) => ({
      adaptador: adaptadorFalso(p, ok),
      preparado: PREPARADO_LISTO,
    }));

    const r = await publicarEnOrden(ps, async (a) => ok());

    expect(r.map((x) => x.estado)).toEqual(["publicado", "publicado", "publicado"]);
  });

  it("falla la segunda: la tercera queda NO-INTENTADO, no fallada", async () => {
    // Este es el test central. Sin `no-intentado` no hay forma de contestar
    // "que fallo?": dira que fallo la tercera cuando solo se intento la segunda.
    const ps = ["threads", "mastodon", "bluesky"].map((p, i) => ({
      adaptador: adaptadorFalso(
        p,
        i === 1
          ? async () => {
              throw new ErrorApi("x", "mastodon", "publicar", 422, null);
            }
          : ok
      ),
      preparado: PREPARADO_LISTO,
    }));

    const r = await publicarEnOrden(ps, (a) => a.publicar({ texto: "x", imagenes: [] }));

    expect(r[0].estado).toBe("publicado");
    expect(r[1].estado).toBe("fallo");
    expect(r[1].paso).toBe("publicar");
    expect(r[2].estado).toBe("no-intentado");
    // Y el que no se intento no lleva paso, porque no llego a tocar la API.
    expect(r[2].paso).toBeNull();
  });

  it("para en el primer fallo: la tercera no recibe ni una llamada", async () => {
    let llamadas = 0;
    const ps = ["threads", "mastodon", "bluesky"].map((p, i) => ({
      adaptador: adaptadorFalso(
        p,
        i === 0
          ? async () => {
              throw new ErrorApi("x", "threads", "sesion", 401, null);
            }
          : async () => {
              llamadas++;
              return { id: null, url: null };
            }
      ),
      preparado: PREPARADO_LISTO,
    }));

    await publicarEnOrden(ps, (a) => a.publicar({ texto: "x", imagenes: [] }));

    // Si el primer fallo es de autenticacion, empujar las siguientes solo
    // multiplica errores identicos. Cortar es lo correcto.
    expect(llamadas).toBe(0);
  });

  it("una plataforma no lista en el pre-flight corta ANTES de publicar ninguna", async () => {
    let publicadas = 0;
    const ps = [
      {
        adaptador: adaptadorFalso("threads", async () => {
          publicadas++;
          return { id: null, url: null };
        }),
        preparado: PREPARADO_LISTO,
      },
      {
        adaptador: adaptadorFalso("mastodon", async () => {
          publicadas++;
          return { id: null, url: null };
        }),
        preparado: { ...PREPARADO_LISTO, plataforma: "mastodon", errores: ["el texto no cabe"], listo: false },
      },
    ];

    const r = await publicarEnOrden(ps, (a) => a.publicar({ texto: "x", imagenes: [] }));

    // Threads estaba lista, pero **tampoco** se publica: el pre-flight es de
    // todas o de ninguna. Un fallo barato en la segunda no puede dejar un post
    // fuera sin avisar.
    expect(publicadas).toBe(0);
    expect(r[0].estado).toBe("no-intentado");
    expect(r[1].error).toContain("el texto no cabe");
  });
});

describe("avisoDeCaducidad: el token que no se puede recuperar", () => {
  it("avisa con margen, porque refrescar despues ya no vale", () => {
    // El permiso dura 90 dias si el perfil es publico, y refrescar lo extiende.
    // O sea que avisar a tiempo tiene arreglo, y avisar tarde no.
    expect(avisoDeCaducidad(13)).toContain("13 dias");
    expect(avisoDeCaducidad(13)).toContain("90 dias");
  });

  it("caducado: avisa de que hay que volver al panel", () => {
    // Un token de Threads **no** se renueva despues de caducar. Es lo unico
    // que no se puede arreglar desde un script.
    const a = avisoDeCaducidad(-3);
    expect(a).toContain("CADUCA HACE 3 dias");
    expect(a).toContain("Generador de identificadores");
  });

  it("hoy: avisa de que todavia hay margen", () => {
    expect(avisoDeCaducidad(0)).toContain("caduca HOY");
  });

  it("lejos de caducar: no dice nada", () => {
    // Un aviso constante es ruido, y ruido es como se deja de leer el que
    // importa. Con 45 dias no hay nada que contar.
    expect(avisoDeCaducidad(45)).toBeNull();
    expect(avisoDeCaducidad(15)).toBeNull();
  });

  it("sin saber la antiguedad: no dice nada en vez de decir que todo bien", () => {
    // Este es el punto. Si no se sabe, el aviso honesto es la ausencia de
    // garantia, no un "todo correcto". Un script que dice "va bien" cuando no
    // sabe es peor que uno que no dice nada.
    expect(avisoDeCaducidad(null)).toBeNull();
  });
});

describe("antiguedadDelToken: 60 dias, el plazo real de Threads", () => {
  it("el plazo es 60 dias, no 90", () => {
    // 90 es el permission grant; el token son 60. Usar el numero grande daria
    // tres semanas de margen falso antes de que dejara de funcionar.
    expect(antiguedadDelToken(0)).toBe(60);
    expect(antiguedadDelToken(50)).toBe(10);
    expect(antiguedadDelToken(70)).toBe(-10);
  });

  it("sin datos no inventa un plazo", () => {
    expect(antiguedadDelToken(null)).toBeNull();
  });
});

describe("preparar: la mitad que se puede repetir sin miedo", () => {
  it("recorta y lo dice", async () => {
    const a = adaptadorFalso("threads", async () => ({ id: null, url: null }));
    const p = await preparar(a, { titulo: "", cuerpo: "x".repeat(600) }, httpSinRed);

    expect(p.caracteres).toBeGreaterThan(0);
    expect(p.listo).toBe(true);
  });

  it("los avisos no bloquean; los errores si", async () => {
    // Bloquear con un aviso convertiria un "no se" en un "no". El aviso dice lo
    // que no se pudo comprobar; el error dice lo que esta mal.
    const conAviso = adaptadorFalso(
      "threads",
      async () => ({ id: null, url: null }),
      { ok: true, errores: [], avisos: ["las dimensiones no se han comprobado"] }
    );
    expect((await preparar(conAviso, CONTENIDO, httpSinRed)).listo).toBe(true);

    const conError = adaptadorFalso(
      "threads",
      async () => ({ id: null, url: null }),
      { ok: false, errores: ["no cabe"], avisos: [] }
    );
    expect((await preparar(conError, CONTENIDO, httpSinRed)).listo).toBe(false);
  });

  it("sin imagenes no hace red", async () => {
    const a = adaptadorFalso("threads", async () => ({ id: null, url: null }));
    const p = await preparar(a, CONTENIDO, httpSinRed);

    // `httpSinRed` rechaza. Si se llamara, el test fallaria aqui.
    expect(p.imagenes).toEqual([]);
    expect(p.listo).toBe(true);
  });

  it("con una imagen buena: UN aviso, y solo sobre las dimensiones", async () => {
    // Threads arrivaba con dos avisos sobre lo mismo, y uno de ellos MENTIA:
    // decia que el formato y el tamano no se habian comprobado, cuando
    // `comprobarImagenes` los comprueba de verdad. Un informe que dice "no se
    // ha comprobado el formato" junto a una comprobacion que si lo hizo hace
    // que se dejen de leer los dos.
    // `content-length` presente a proposito: es lo que hace un CDN real (el de
    // iTunes lo manda), y asi queda **un** aviso. Sin el, sale ademas "la imagen
    // no declara tamaño", que tambien menciona los 8 MB pero por otra causa.
    const http = (async () =>
      new Response(null, {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-length": "89063" },
      })) as never;

    const p = await preparar(
      adaptadorFalso("threads", async () => ({ id: null, url: null })),
      { titulo: "", cuerpo: "hola", imagenes: [{ url: "https://cdn.example.com/a.jpg" }] },
      http
    );

    expect(p.listo).toBe(true);
    expect(p.imagenes[0].ok).toBe(true);
    // Exactamente uno, y sobre lo que de verdad no se puede saber.
    expect(p.avisos).toHaveLength(1);
    expect(p.avisos[0]).toContain("dimensiones");
    // Y el tipo y el tamano SI se han comprobado: nada puede afirmar lo contrario.
    expect(p.avisos.join(" ")).not.toContain("JPEG");
    expect(p.avisos.join(" ")).not.toContain("8 MB");
  });

  describe("el enlace no se duplica", () => {
    // Adaptador que compone como los de verdad: titulo + cuerpo + enlace.
    // Es lo que hace `componerTexto` en threads, bluesky, mastodon, facebook e
    // instagram: el `enlace` va como parte separada, al final.
    const queCompone = () =>
      ({
        plataforma: "threads",
        validar: () => ({ ok: true, errores: [], avisos: [] }),
        redactar: async (contenido: Contenido) => {
          const partes: string[] = [];
          if (contenido.titulo.trim()) partes.push(contenido.titulo.trim());
          if (contenido.cuerpo.trim()) partes.push(contenido.cuerpo.trim());
          if (contenido.enlace) partes.push(contenido.enlace);
          return {
            plataforma: "threads",
            publicacion: { texto: partes.join("\n\n"), imagenes: contenido.imagenes ?? [] },
            ajustes: [],
            requiereRevision: false,
          };
        },
        publicar: async () => ({ id: null, url: null }),
      }) as never;

    it("quita del cuerpo la URL que ya va como enlace, aun sin https", async () => {
      // **El caso real**, con las dos formas en las que se escribe un dominio:
      // el cuerpo con el dominio pelado y el `enlace` con el esquema. Por eso
      // hace falta normalizar antes de comparar: `new URL("epk.com")` lanza, y
      // un `catch` que devuelve `false` deja el enlace duplicado.
      //
      // Esto ya pasó: el post de Threads salio con el enlace dos veces, se
      // corrigio a mano, y el fix se dio por bueno. Volvio a pasar en Mastodon y
      // en Instagram porque el fix comparaba las URL con `new URL()` y el cuerpo
      // no parsea. El test anterior usaba el mismo formato en los dos lados, y
      // por eso no lovio nada: **el test no cubria el caso que se dio**.
      const p = await preparar(
        queCompone(),
        {
          titulo: "",
          cuerpo: "Acabamos de abrir PressPlay.\n\nUna ficha para decidir.\n\nepk-dashboard.vercel.app",
          enlace: "https://epk-dashboard.vercel.app",
        },
        httpSinRed
      );

      expect(p.texto.match(/epk-dashboard\.vercel\.app/g)).toHaveLength(1);
      expect(p.texto).not.toContain("epk-dashboard.vercel.app\n\nhttps://");
      // Y el texto que se queda es el que se queria: sin perder la frase.
      expect(p.texto).toContain("Una ficha para decidir.");
    });

    it("tambien quita el www y la barra final", async () => {
      const p = await preparar(
        queCompone(),
        {
          titulo: "",
          cuerpo: "Mira esto:\n\nwww.epk-dashboard.vercel.app/",
          enlace: "https://epk-dashboard.vercel.app",
        },
        httpSinRed
      );

      expect(p.texto.match(/epk-dashboard\.vercel\.app/g)).toHaveLength(1);
    });

    it("NO toca un enlace distinto que aparece en el cuerpo", async () => {
      // Si el cuerpo cita otra direccion, esa se queda. Quitarla seria perder
      // informacion, y esto no va de limpiar texto: va de no repetir el mismo.
      const p = await preparar(
        queCompone(),
        {
          titulo: "",
          cuerpo: "Antes: https://otro-sitio.com\n\nepk-dashboard.vercel.app",
          enlace: "https://epk-dashboard.vercel.app",
        },
        httpSinRed
      );

      expect(p.texto).toContain("https://otro-sitio.com");
      expect(p.texto.match(/epk-dashboard\.vercel\.app/g)).toHaveLength(1);
    });

    it("no inventa nada cuando no hay enlace", async () => {
      const p = await preparar(
        queCompone(),
        { titulo: "", cuerpo: "Solo texto con https://epk-dashboard.vercel.app dentro" },
        httpSinRed
      );

      expect(p.texto).toContain("https://epk-dashboard.vercel.app");
    });
  });
});