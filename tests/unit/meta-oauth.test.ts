/**
 * Tests de `lib/social/meta.ts`.
 *
 * ## Que se esta atando
 *
 * Tres cosas, y las tres han salido de esta fase:
 *
 * 1. **No se elige la Page a ciegas.** `/me/accounts` devuelve todas las Pages
 *    del usuario. Quedarse con la primera cuando hay varias significa publicar en
 *    una Page que nadie ha revisado, y el error no se ve hasta que el post ya ha
 *    salido. Este test falla si alguien reintroduce "cogemos la primera".
 *
 * 2. **Token de usuario y token de Page no son intercambiables.** El login
 *    devuelve el primero; `POST /{page-id}/feed` necesita el segundo. Es el
 *    error de diseño que se cometio al escribir `config.ts` por primera vez.
 *
 * 3. **El fragmento se lee con y sin `#`.** `window.location.hash` llega con la
 *    almohadilla y los tests no siempre la ponen; una asercion que solo funciona
 *    con una de las dos formas no comprueba el caso real.
 */

import { describe, it, expect } from "vitest";
import {
  type RespuestaCuentas,
  leerCuentas,
  leerCuenta,
  elegirPage,
  leerFragmento,
  leerQuery,
  esCancelacion,
  ErrorDePage,
} from "@/lib/social/meta";

/** Respuesta tal y como la devuelve Meta, con una Page. */
function respuestaDeMeta(): RespuestaCuentas {
  return {
    data: [
      {
        access_token: "EAAB-token-de-page",
        category: "App Page",
        name: "PressPlay",
        id: "130636161590121",
        tasks: ["MANAGE", "CREATE_CONTENT"],
        instagram_business_account: { id: "17841405822304914" },
      },
    ],
    paging: { cursors: { before: "aaa", after: "bbb" } },
  };
}

describe("leerCuentas", () => {
  it("extrae las tres credenciales de una Page", () => {
    const cuentas = leerCuentas(respuestaDeMeta());

    expect(cuentas).toHaveLength(1);
    expect(cuentas[0].id).toBe("130636161590121");
    expect(cuentas[0].nombre).toBe("PressPlay");
    expect(cuentas[0].accessToken).toBe("EAAB-token-de-page");
    expect(cuentas[0].igUserId).toBe("17841405822304914");
  });

  it("el token que devuelve es el de Page, no el de usuario", () => {
    // Es la distincion que provocaba el error de diseno. Si alguien mezclara los
    // dos, este test es el que se pone rojo.
    const cuentas = leerCuentas(respuestaDeMeta());
    expect(cuentas[0].accessToken).not.toBe("META_USER_ACCESS_TOKEN");
  });

  it("una Page sin Instagram devuelve igUserId null, y no revienta", () => {
    const respuesta = { data: [{ id: "1", name: "Sin IG", access_token: "tok" }] };
    const cuentas = leerCuentas(respuesta);

    expect(cuentas[0].igUserId).toBeNull();
  });

  it("descarta entradas sin id o sin access_token", () => {
    // Sin esas dos la Page no sirve para publicar. Devolverla incompleta
    // acabaria en un 401 mas tarde, en produccion, sin saber de donde salio.
    const cuentas = leerCuentas({
      data: [
        { id: "1", access_token: "tok" },
        { name: "sin id", access_token: "tok" },
        { id: "3", name: "sin token" },
        "no es un objeto",
        null,
      ],
    });

    expect(cuentas).toHaveLength(1);
    expect(cuentas[0].id).toBe("1");
  });

  it("una respuesta con error o sin data devuelve lista vacia, no lanza", () => {
    expect(leerCuentas({ error: { message: "Invalid OAuth token" } })).toEqual([]);
    expect(leerCuentas({})).toEqual([]);
  });
});

describe("elegirPage", () => {
  it("con una sola Page, la elige sin preguntar", () => {
    const cuentas = leerCuentas(respuestaDeMeta());
    const elegida = elegirPage(cuentas);

    expect(elegida.id).toBe("130636161590121");
  });

  it("con VARIAS Pages NO elige la primera: falla y las lista", () => {
    // Este es el test que ata el comportamiento. Sin el, un refactor que
    // cambie `cuentas[0]` por un `.find()` distraido pasaria el resto de tests.
    const cuentas = leerCuentas({
      data: [
        { id: "111", name: "Otra Page", access_token: "tok-1" },
        { id: "222", name: "PressPlay", access_token: "tok-2" },
      ],
    });

    expect(() => elegirPage(cuentas)).toThrow(ErrorDePage);
    try {
      elegirPage(cuentas);
      expect.unreachable("deberia haber lanzado");
    } catch (e) {
      const err = e as ErrorDePage;
      expect(err.candidatas.map((c) => c.id)).toEqual(["111", "222"]);
      // El mensaje debe permitir elegir: sin los IDs no hay forma de usar --page-id.
      expect(err.message).toContain("111");
      expect(err.message).toContain("222");
      expect(err.message).toContain("--page-id");
    }
  });

  it("--page-id elige esa Page entre varias", () => {
    const cuentas = leerCuentas({
      data: [
        { id: "111", name: "Otra Page", access_token: "tok-1" },
        { id: "222", name: "PressPlay", access_token: "tok-2" },
      ],
    });

    const elegida = elegirPage(cuentas, "222");
    expect(elegida.id).toBe("222");
    expect(elegida.accessToken).toBe("tok-2");
  });

  it("--page-id que no existe falla, en vez de caer a la primera", () => {
    const cuentas = leerCuentas(respuestaDeMeta());

    // Caer a la primera cuando el id pedido no existe seria peor que fallar:
    // publicaria en una Page que el usuario no pidio.
    expect(() => elegirPage(cuentas, "999")).toThrow(/no está entre las Pages/);
  });

  it("sin ninguna Page explica las tres causas posibles", () => {
    // Distinguir "no hay Page" de "el token caducó" de "falta permiso" es lo
    // que ahorra el diagnostico, porque los tres se ven iguales sin mensaje.
    expect(() => elegirPage([])).toThrow(/pages_show_list/);
    expect(() => elegirPage([])).toThrow(/caduc/);
  });
});

describe("leerCuenta", () => {
  it("acepta un objeto sin name y pone null", () => {
    const cuenta = leerCuenta({ id: "1", access_token: "tok" });
    expect(cuenta?.nombre).toBeNull();
  });

  it("rechaza null, undefined y primitivos sin lanzar", () => {
    expect(leerCuenta(null)).toBeNull();
    expect(leerCuenta(undefined)).toBeNull();
    expect(leerCuenta("texto")).toBeNull();
    expect(leerCuenta(42)).toBeNull();
  });
});

describe("leerFragmento", () => {
  it("lee el token de larga duracion, que es el que se usa", () => {
    const t = leerFragmento(
      "#access_token=EAAHm-corto&expires_in=4815&long_lived_token=ABAEs-largo&data_access_expiration_time=1658889585"
    );

    expect(t.longLivedToken).toBe("ABAEs-largo");
    expect(t.accessToken).toBe("EAAHm-corto");
    expect(t.expiresIn).toBe(4815);
    expect(t.dataAccessExpiration).toBe("1658889585");
    expect(t.error).toBeNull();
  });

  it("funciona con y sin la almohadilla", () => {
    // `window.location.hash` siempre trae el `#`, pero una asercion que solo
    // funciona con una forma no comprueba el caso de la otra.
    const conAlmohadilla = leerFragmento("#access_token=tok");
    const sinAlmohadilla = leerFragmento("access_token=tok");

    expect(conAlmohadilla.accessToken).toBe("tok");
    expect(sinAlmohadilla.accessToken).toBe("tok");
  });

  it("devuelve el error de Meta sin lanzar", () => {
    const t = leerFragmento("#error=access_denied&error_description=El+usuario+cancelo");

    expect(t.error).toBe("access_denied");
    expect(t.errorDescription).toBe("El usuario cancelo");
    expect(t.accessToken).toBeNull();
  });

  it("hash vacio devuelve todo null en vez de petar", () => {
    // Es lo que pasa si se abre la pagina directamente, sin venir del login.
    expect(leerFragmento("").accessToken).toBeNull();
    expect(leerFragmento("#").accessToken).toBeNull();
  });

  it("un expires_in no numerico da null, no NaN", () => {
    // NaN en un `Math.round` da NaN en pantalla: "caducciona NaN minutos".
    const t = leerFragmento("#access_token=tok&expires_in=abc");
    expect(t.expiresIn).toBeNull();
  });

  it("si hay error, ignora un token que venga en la misma URL", () => {
    // Un bot o un recorte de URL podrian mandar las dos cosas. El error manda.
    const t = leerFragmento("#error=access_denied&access_token=tok");

    expect(t.error).toBe("access_denied");
    expect(t.accessToken).toBeNull();
  });
});
// ── La query del Authorization Window de Threads ──────────────────────────

describe("leerQuery: el code de Threads", () => {
  it("saca el code de la query", () => {
    // Es la URL que devuelve Threads de verdad:
    //   /auth/meta/callback/?code=AQBx-hBsH3...#_
    // El `#_` va en el fragmento, no aqui. Por eso este test lo comprobara
    // aparte con `leerFragmento`.
    const q = leerQuery("?code=AQBx-hBsH3code");

    expect(q.code).toBe("AQBx-hBsH3code");
    expect(q.error).toBeNull();
  });

  it("admite la query con y sin el interrogante inicial", () => {
    // Por lo mismo que en `leerFragmento`: `window.location.search` siempre trae
    // el `?`, pero un test (o un script) que monte la URL a mano puede no
    // ponerlo. Un parser que solo entiende una de las dos formas pasa los tests
    // de una y falla en la otra.
    expect(leerQuery("?code=abc").code).toBe("abc");
    expect(leerQuery("code=abc").code).toBe("abc");
  });

  it("una query vacia no inventa un code", () => {
    expect(leerQuery("").code).toBeNull();
    expect(leerQuery("?").code).toBeNull();
  });

  it("el #_ que manda Threads NO se lee como token", () => {
    // Este es el test que importa. Threads manda:
    //     /?code=AQBx...#_
    // El `#_` es basura de redireccion de Meta y va en el FRAGMENTO. Si alguien
    // "mejora" el parser para coger el primer segmento del hash como si fuera un
    // valor, aqui aparecio un token de una letra y el canje fallaria en el
    // script, en silencio, con un error que no menciona la URL.
    const t = leerFragmento("#_");

    expect(t.accessToken).toBeNull();
    expect(t.longLivedToken).toBeNull();
    expect(t.error).toBeNull();
    // Ni se confunde con un valor de un solo caracter.
    expect(t.accessToken).not.toBe("_");
  });

  it("code con el fragmento #_ pegado sigue siendo un code usable", () => {
    // El caso real completo: query con el code, fragmento con el #_.
    const q = leerQuery("?code=AQBx-hBsH3code");
    const t = leerFragmento("#_");

    expect(q.code).toBe("AQBx-hBsH3code");
    expect(q.code).not.toContain("#");
    expect(t.accessToken).toBeNull();
  });

  it("lee el state si viene", () => {
    // `state` es opcional y se usa contra CSRF. Si se manda, hay que poder
    // comprobarlo contra lo que se guardo al abrir el Authorization Window.
    expect(leerQuery("?code=abc&state=miEstado").state).toBe("miEstado");
    expect(leerQuery("?code=abc").state).toBeNull();
  });
});

describe("leerQuery: la cancelacion de Threads", () => {
  it("lee los tres campos de error que manda Threads", () => {
    //   /?error=access_denied&error_reason=user_denied
    //       &error_description=The+user+denied+your+request
    const q = leerQuery(
      "?error=access_denied&error_reason=user_denied&error_description=The+user+denied+your+request"
    );

    expect(q.error).toBe("access_denied");
    expect(q.errorReason).toBe("user_denied");
    expect(q.errorDescription).toBe("The user denied your request");
  });

  it("reconoce la cancelacion", () => {
    expect(esCancelacion(leerQuery("?error=access_denied"))).toBe(true);
    expect(esCancelacion(leerQuery("?code=abc"))).toBe(false);
    expect(esCancelacion(leerQuery(""))).toBe(false);
  });

  it("no corrige la errata de la documentacion", () => {
    // La tabla de Meta escribe `acceess_denied` (tres ceses) y el ejemplo de
    // mas abajo pone `access_denied`. Aqui pasan los dos tal cual.
    //
    // Normalizar "acceess" -> "access" estaria mal: si Meta empezase a mandar
    // otra cosa, un parser que "limpia" valores conocidos seguiria tragandose
    // el cambio en silencio. Se muestra lo que llego y que lo juzgue la
    // persona.
    expect(leerQuery("?error=acceess_denied").error).toBe("acceess_denied");
    expect(leerQuery("?error=access_denied").error).toBe("access_denied");
  });

  it("una cancelacion sin code no se confunde con un code", () => {
    const q = leerQuery("?error=access_denied&error_reason=user_denied");

    expect(q.code).toBeNull();
    expect(esCancelacion(q)).toBe(true);
  });
});
