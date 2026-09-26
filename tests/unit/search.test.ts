import { describe, it, expect } from "vitest";
import {
  ALL_SCOPES,
  hitMatches,
  normalizeQuery,
  normalizeText,
  parseListSortParams,
  parseOrderParam,
  parseScopeParam,
  parseSortParam,
  sortList,
} from "@/lib/search";

describe("normalizeText", () => {
  it("convierte a minusculas", () => {
    expect(normalizeText("Kate Bush")).toBe("kate bush");
  });

  it("quita acentos y la enie", () => {
    expect(normalizeText("Álbum Ñandú Café")).toBe("album nandu cafe");
  });

  it("normaliza mayacentes acentuadas", () => {
    expect(normalizeText("REUNIÓN")).toBe("reunion");
  });
});

describe("normalizeQuery", () => {
  it("recorta espacios y pliega acentos", () => {
    expect(normalizeQuery("  Canción  ")).toBe("cancion");
  });

  it("maneja null y undefined", () => {
    expect(normalizeQuery(null)).toBe("");
    expect(normalizeQuery(undefined)).toBe("");
  });
});

describe("parseScopeParam", () => {
  it("devuelve todos los alcances por defecto", () => {
    expect(parseScopeParam(null)).toEqual(ALL_SCOPES);
    expect(parseScopeParam("")).toEqual(ALL_SCOPES);
  });

  it("parsea alcances en singular y plural", () => {
    expect(parseScopeParam("artist,show")).toEqual(["artist", "show"]);
    expect(parseScopeParam("releases")).toEqual(["release"]);
    expect(parseScopeParam("eventos")).toEqual(["show"]);
  });

  it("ignora valores desconocidos y deduplica", () => {
    expect(parseScopeParam("artist,artist,bogus")).toEqual(["artist"]);
    expect(parseScopeParam("bogus")).toEqual(ALL_SCOPES);
  });
});

describe("parseSortParam / parseOrderParam", () => {
  it("acepta sort valido y cae a relevance con valores invalidos", () => {
    expect(parseSortParam("name")).toBe("name");
    expect(parseSortParam("date")).toBe("date");
    expect(parseSortParam("DESC")).toBe("relevance");
    expect(parseSortParam(null)).toBe("relevance");
  });

  it("acepta orden ascendente y descendente", () => {
    expect(parseOrderParam("asc")).toBe("asc");
    expect(parseOrderParam("DESC")).toBe("desc");
    expect(parseOrderParam("descendente")).toBe("desc");
    expect(parseOrderParam(null)).toBe("asc");
  });

  it("relevance se resuelve a nombre para listados", () => {
    expect(parseListSortParams("relevance", "desc")).toEqual({ sort: "name", order: "desc" });
    expect(parseListSortParams("date", "asc")).toEqual({ sort: "date", order: "asc" });
    expect(parseListSortParams(null, null)).toEqual({ sort: "name", order: "asc" });
  });
});

describe("hitMatches", () => {
  it("coincide sin importar mayusculas ni acentos", () => {
    expect(hitMatches("bush", ["Kate Bush"])).toBe(true);
    expect(hitMatches("cancion", ["Canción del río"])).toBe(true);
    expect(hitMatches("reunion", ["REUNIÓN"])).toBe(true);
  });

  it("no coincide cuando falta texto", () => {
    expect(hitMatches("queen", ["Nirvana"])).toBe(false);
    expect(hitMatches("queen", [null, undefined, ""])).toBe(false);
  });
});

describe("sortList", () => {
  const items = [
    { name: "Zeta", date: "2024-01-01" },
    { name: "álbum", date: "" },
    { name: "beta", date: "2023-05-05" },
    { name: "alpha", date: null },
  ];
  const accessors = { text: (item: (typeof items)[number]) => item.name, date: (item: (typeof items)[number]) => item.date };

  it("ordena por nombre ascendente sin distinguir acentos", () => {
    const result = sortList(items, { sort: "name", order: "asc" }, accessors);
    expect(result.map((item) => item.name)).toEqual(["álbum", "alpha", "beta", "Zeta"]);
  });

  it("ordena por nombre descendente", () => {
    const result = sortList(items, { sort: "name", order: "desc" }, accessors);
    expect(result.map((item) => item.name)).toEqual(["Zeta", "beta", "alpha", "álbum"]);
  });

  it("ordena por fecha ascendente dejando fechas vacias al final", () => {
    const result = sortList(items, { sort: "date", order: "asc" }, accessors);
    expect(result.map((item) => item.name)).toEqual(["beta", "Zeta", "álbum", "alpha"]);
  });

  it("ordena por fecha descendente dejando fechas vacias al final", () => {
    const result = sortList(items, { sort: "date", order: "desc" }, accessors);
    expect(result.map((item) => item.name)).toEqual(["Zeta", "beta", "álbum", "alpha"]);
  });

  it("prioriza coincidencias por prefijo en relevance", () => {
    const result = sortList(items, { sort: "relevance", order: "desc" }, accessors, "be");
    expect(result[0].name).toBe("beta");
  });

  it("no muta la lista original", () => {
    const original = items.map((item) => item.name);
    sortList(items, { sort: "name", order: "desc" }, accessors);
    expect(items.map((item) => item.name)).toEqual(original);
  });
});
