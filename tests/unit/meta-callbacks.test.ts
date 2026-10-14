import { describe, expect, it } from "vitest";
import { GET as deauthorizeGET, POST as deauthorizePOST } from "@/app/meta/deauthorize/route";
import { GET as borradoGET, POST as borradoPOST } from "@/app/meta/data-deletion/route";

/**
 * Tests de los dos callbacks que Meta pide en el mismo paso que la URI OAuth.
 *
 * ## Lo que se esta atando
 *
 * **Que los dos métodos respondan.** Si la ruta solo acepta `GET`, el `POST` que
 * hace Meta devuelve `405`, Meta marca la URL como rota y la quita de la
 * configuración. Un `405` aqui no es "no se uso ese metodo": es perder el
 * ajuste que se acaba de hacer a mano en el dashboard.
 *
 * **Que el `GET` devuelva algo legible.** La direccion de eliminacion de datos la
 * leen personas, no solo Meta. Un `{"ok":true}` en crudo hace que alguien pida
 * el borrado y se vaya pensando que le han ignorado.
 *
 * **Que no se prometa lo que no se hace.** Estas rutas responden `200` pero no
 * borran nada. El cuerpo lo dice, y el test ata que lo siga diciendo: el dia que
 * se implemente el borrado real hay que cambiar el texto en el mismo commit, no
 * dejar la pagina diciendo "pendiente" mientras el codigo ya borra.
 */

describe("callback de desautorizacion", () => {
  it("responde a GET con HTML, no con JSON crudo", async () => {
    const r = await deauthorizeGET();

    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    // La razon de que sea HTML y no JSON: esta URL a veces se abre en el
    // navegador de una persona, no solo la llama Meta.
    await expect(r.text()).resolves.toContain("Autorizaci");
  });

  it("responde tambien a POST", async () => {
    // Meta usa POST en algunos flujos. Un 405 aqui hace que Meta marque la URL
    // como rota.
    const r = await deauthorizePOST();

    expect(r.status).toBe(200);
  });

  it("NO dice que ha revocado el token, porque no lo revoca", async () => {
    // El endpoint es una casilla para Meta. Si el texto dijera "hemos revocado
    // el acceso" mentiria: el token sigue vivo hasta que caduca.
    const cuerpo = await (await deauthorizeGET()).text();

    expect(cuerpo).not.toMatch(/revocado el token|token revocado|revocamos el token/i);
  });
});

describe("callback de eliminacion de datos", () => {
  it("el GET devuelve una pagina con instrucciones para una persona", async () => {
    const r = await borradoGET();

    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");

    const cuerpo = await r.text();
    // La direccion de borrado tiene que ser utilizable: un correo de contacto y
    // un plazo. Sin los dos, quien la lee no puede hacer nada con ella.
    expect(cuerpo).toContain("privacy@pressplay.app");
    expect(cuerpo).toContain("30 d");
  });

  it("el POST acepta la peticion firmada de Meta con 200", async () => {
    const r = await borradoPOST(new Request("https://pressplay.app/meta/data-deletion", { method: "POST" }));

    // Un 200 con `borrado: pendiente` dice la verdad. Un 200 diciendo `borrado:
    // true` haria que Meta creyera que un desconocido puede borrar cuentas.
    expect(r.status).toBe(200);
    const cuerpo = (await r.json()) as { ok: boolean; borrado: string };
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.borrado).toBe("pendiente");
  });

  it("el POST no revienta aunque el cuerpo no se pueda leer", async () => {
    // Meta siempre manda un cuerpo, pero un 200 es mejor que un 500 si algo
    // llega raro: responde igual y no lo marca como roto.
    const r = await borradoPOST(new Request("https://pressplay.app/meta/data-deletion", { method: "POST" }));

    expect(r.status).toBe(200);
  });
});