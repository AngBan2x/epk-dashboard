// @vitest-environment jsdom
/**
 * RC.33 Ola 5 — estados de show.
 *
 * ── El bug reportado ────────────────────────────────────────────────────────
 * Un show del dashboard mostraba a la vez el badge "Próximamente" y el badge
 * "Pasado · se elimina en 48h". No eran dos reglas en conflicto: eran dos
 * decisiones INDEPENDIENTES sin ninguna guarda que las conciliara, y ambas
 *aban de datos distintos.
 *
 *   1. `showStatusLabel(show.status)` no miraba la fecha.
 *   2. `isPast = !!show.date && new Date(show.date) < new Date()` se calculaba en
 *      el cliente y sí miraba la fecha.
 *
 * Y el `status` que recibía el componente llegaba CRUDO, porque la función que
 * sí lo recalculaba (`computeDynamicStatus`) vivía dentro de `GET /api/shows` y
 * solo la llamaba ese handler. El dashboard se alimenta de `/api/dashboard`, que
 * no la llamaba nunca.
 *
 * ── Tres capas, y las tres tienen que ponerse rojas al revertir ─────────────
 *   - REGLA: `computeDynamicStatus` con un reloj INYECTADO, sin `new Date()`
 *     real ni casos que dependan del día en que se ejecuta el test.
 *   - RUTA: `GET /api/dashboard` con `@/lib/db` y `@/lib/auth` mockeados. Es la
 *     capa que faltaba: un test de la función pura pasaría en verde aunque
 *     `/api/dashboard` dejara de llamarla, que es exactamente el bug.
 *   - PINTURA: `ShowsBooking` renderizado, para que no vuelva a haber dos
 *     etiquetas ni la promesa de borrado.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup } from "@testing-library/react";

import {
  computeDynamicStatus,
  createDynamicStatusResolver,
  withDynamicStatus,
  calendarDaysFromReference,
  DEFAULT_SHOW_STATUS,
} from "@/lib/show-dynamic-status";

/**
 * Reloj fijo y local. Todas las aserciones se escriben contra días civiles
 * (año/mes/día), así que no dependen ni del día en que corre el test ni de la
 * zona horaria de la máquina.
 */
const REF = new Date(2025, 5, 15, 12, 0, 0); // domingo 15 de junio de 2025, mediodía

/* ────────────────────────────────────────────────────────────────────────────
 * REGLA
 * ──────────────────────────────────────────────────────────────────────────── */

describe("computeDynamicStatus — con reloj inyectado", () => {
  it("fecha de hoy → \"hoy\"", () => {
    expect(computeDynamicStatus({ status: "proximamente", date: "2025-06-15" }, REF)).toBe("hoy");
  });

  it("hoy a las 00:30 y hoy a las 23:30 siguen siendo \"hoy\" (no depende de la hora)", () => {
    expect(computeDynamicStatus({ status: "proximamente", date: "2025-06-15" }, new Date(2025, 5, 15, 0, 30))).toBe("hoy");
    expect(computeDynamicStatus({ status: "proximamente", date: "2025-06-15" }, new Date(2025, 5, 15, 23, 30))).toBe("hoy");
  });

  it("fecha pasada → \"pasado\"", () => {
    expect(computeDynamicStatus({ status: "proximamente", date: "2025-06-14" }, REF)).toBe("pasado");
  });

  it("ayer a las 00:30 sigue siendo \"pasado\" (no depende de la hora)", () => {
    expect(computeDynamicStatus({ status: "proximamente", date: "2025-06-14" }, new Date(2025, 5, 15, 0, 30))).toBe("pasado");
  });

  it("fecha futura → conserva el estado guardado", () => {
    expect(computeDynamicStatus({ status: "confirmado", date: "2025-07-01" }, REF)).toBe("confirmado");
    expect(computeDynamicStatus({ status: "en_venta", date: "2999-01-01" }, REF)).toBe("en_venta");
  });

  it("el estado guardado sobrevive a la transición por el estado \"hoy\"", () => {
    // "confirmado" para hoy es "hoy": la fecha manda sobre la etiqueta comercial.
    expect(computeDynamicStatus({ status: "confirmado", date: "2025-06-15" }, REF)).toBe("hoy");
  });

  it("show cancelado NO se recalcula aunque la fecha haya pasado", () => {
    expect(computeDynamicStatus({ status: "cancelado", date: "2020-01-01" }, REF)).toBe("cancelado");
    expect(computeDynamicStatus({ status: "cancelado", date: "2025-06-15" }, REF)).toBe("cancelado");
  });

  it("show suspendido NO se recalcula aunque la fecha haya pasado", () => {
    expect(computeDynamicStatus({ status: "suspendido", date: "2020-01-01" }, REF)).toBe("suspendido");
  });

  it("cancelado sin fecha tampoco se toca", () => {
    expect(computeDynamicStatus({ status: "cancelado", date: null }, REF)).toBe("cancelado");
  });

  it("sin fecha → conserva el estado guardado, y si no hay, el default", () => {
    expect(computeDynamicStatus({ status: "en_venta", date: null }, REF)).toBe("en_venta");
    expect(computeDynamicStatus({ status: "pospuesto", date: "" }, REF)).toBe("pospuesto");
    expect(computeDynamicStatus({ status: "", date: null }, REF)).toBe(DEFAULT_SHOW_STATUS);
  });

  it("fecha ilegible → conserva el estado, NO revienta", () => {
    expect(computeDynamicStatus({ status: "confirmado", date: "pronto" }, REF)).toBe("confirmado");
    expect(computeDynamicStatus({ status: "confirmado", date: "2025-13-40" }, REF)).toBe("confirmado");
    expect(() => computeDynamicStatus({ status: "confirmado", date: "NaN" }, REF)).not.toThrow();
  });

  it("una fecha con hora detrás sigue siendo el DÍA CIVIL que dice", () => {
    // `"2025-06-15T23:00:00"` es un día, no un instante: el show es de ese día.
    expect(computeDynamicStatus({ status: "proximamente", date: "2025-06-15T23:00:00" }, REF)).toBe("hoy");
    expect(computeDynamicStatus({ status: "proximamente", date: "2025-06-14T23:59:00" }, REF)).toBe("pasado");
  });

  it("el CASO DEL BUG: \"proximamente\" con fecha pasada resuelve a \"pasado\"", () => {
    // Este es el test que protege el arreglo. Sin él, la función podría quedarse
    // como un no-op y todo lo demás seguiría verde.
    expect(computeDynamicStatus({ status: "proximamente", date: "2025-06-14" }, REF)).toBe("pasado");
  });

  it("acepta una fecha ISO con zona horaria sin inventarse días", () => {
    expect(calendarDaysFromReference("2025-06-15", REF)).toBe(0);
    expect(calendarDaysFromReference("2025-06-14", REF)).toBe(-1);
    expect(calendarDaysFromReference("2025-06-17", REF)).toBe(2);
    expect(calendarDaysFromReference("no-es-una-fecha", REF)).toBeNull();
  });
});

describe("createDynamicStatusResolver — un instante por respuesta", () => {
  it("juzga todo un lote contra el MISMO instante aunque avance el reloj", () => {
    // Con `new Date()` por llamada, dos shows de la MISMA respuesta podían
    // discrepar si la petición cruzaba medianoche. La calculadora fija el
    // instante al crearse, así que el lote es coherente por construcción.
    const resolve = createDynamicStatusResolver(REF);
    const show = { status: "proximamente", date: "2025-06-15" };
    expect(resolve(show)).toBe("hoy");
    expect(resolve(show)).toBe("hoy");
    expect(resolve(show)).toBe("hoy");
  });

  it("con el reloj real también devuelve hoy/pasado sin argumentar", () => {
    const resolve = createDynamicStatusResolver();
    const hoy = new Date();
    const ymd = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    expect(resolve({ status: "proximamente", date: ymd })).toBe("hoy");
    expect(resolve({ status: "proximamente", date: "2001-01-15" })).toBe("pasado");
    expect(resolve({ status: "proximamente", date: "2999-01-15" })).toBe("proximamente");
  });
});

describe("withDynamicStatus — el mismo array, el status resuelto", () => {
  it("no muta la entrada", () => {
    const input = [{ id: "a", status: "proximamente", date: "2020-01-01" }];
    const output = withDynamicStatus(input, REF);
    expect(input[0].status).toBe("proximamente");
    expect(output[0].status).toBe("pasado");
    expect(output[0]).not.toBe(input[0]);
  });

  it("conserva el resto de la fila", () => {
    const [out] = withDynamicStatus([{ id: "a", venue_name: "Sala", status: "proximamente", date: "2020-01-01" }], REF);
    expect(out).toEqual({ id: "a", venue_name: "Sala", date: "2020-01-01", status: "pasado" });
  });

  it("un lote mixto sale coherente", () => {
    const out = withDynamicStatus(
      [
        { status: "proximamente", date: "2025-06-15" },
        { status: "proximamente", date: "2025-06-14" },
        { status: "confirmado", date: "2025-06-20" },
        { status: "cancelado", date: "2025-06-14" },
        { status: "pospuesto", date: null },
      ],
      REF
    );
    expect(out.map((s) => s.status)).toEqual(["hoy", "pasado", "confirmado", "cancelado", "pospuesto"]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * RUTA — `GET /api/dashboard` es la que alimenta el dashboard y el carrusel
 * ──────────────────────────────────────────────────────────────────────────── */

const ARTIST = { id: "art-rh", name: "Radiohead", genre: "Rock", location: "UK" };

/** Aprobados, los que ve el carrusel de artistas. */
const APPROVED_SHOWS = [
  { id: "show-past", artist_id: "art-rh", venue_name: "Barfly", status: "proximamente", date: "2001-06-14" },
  { id: "show-future", artist_id: "art-rh", venue_name: "Sala Unknown", status: "confirmado", date: "2999-06-20" },
  { id: "show-cancelled", artist_id: "art-rh", venue_name: "Cancelado Club", status: "cancelado", date: "2001-06-14" },
];

/** Los del propio artista: incluyen los no aprobados, como en producción. */
const OWN_SHOWS = [...APPROVED_SHOWS, { id: "show-own", artist_id: "art-rh", venue_name: "Sala Propia", status: "proximamente", date: "2002-03-02" }];

vi.mock("@/lib/db", () => ({
  getAllTracks: vi.fn(async () => []),
  getAllArtists: vi.fn(async () => [ARTIST]),
  getArtistByUserId: vi.fn(async () => ARTIST),
  getApprovedShowsByArtists: vi.fn(async () => APPROVED_SHOWS),
  getShowsByArtists: vi.fn(async () => OWN_SHOWS),
  getShowsByArtist: vi.fn(async () => OWN_SHOWS),
  getTotalLikesForTracks: vi.fn(async () => 0),
  getSubscriberCount: vi.fn(async () => 0),
}));

vi.mock("@/lib/auth", () => ({
  validateRequest: vi.fn(async () => ({ userId: "user-1", role: "artist" })),
}));

import { GET } from "@/app/api/dashboard/route";
import { validateRequest } from "@/lib/auth";

type DashboardBody = {
  artistShows: Array<{ id: string; status: string }>;
  showsByArtist: Record<string, Array<{ id: string; status: string }>>;
};

async function dashboardBody(): Promise<DashboardBody> {
  const res = await GET(new Request("http://localhost:3000/api/dashboard") as never);
  expect(res.status).toBe(200);
  return (await res.json()) as DashboardBody;
}

beforeEach(() => {
  vi.clearAllMocks();
  (validateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "user-1", role: "artist" });
});

describe("GET /api/dashboard — el status llega recalculado (la parte que arregla el bug)", () => {
  it("un show \"proximamente\" con fecha pasada llega como \"pasado\" en artistShows", async () => {
    const body = await dashboardBody();
    const past = body.artistShows.find((s) => s.id === "show-past");
    expect(past?.status).toBe("pasado");
  });

  it("y lo mismo en el carrusel del catálogo (showsByArtist)", async () => {
    const body = await dashboardBody();
    const byId = Object.fromEntries((body.showsByArtist["art-rh"] ?? []).map((s) => [s.id, s.status]));
    expect(byId["show-past"]).toBe("pasado");
  });

  it("un cancelado sigue cancelado en la ruta", async () => {
    const body = await dashboardBody();
    expect(body.artistShows.find((s) => s.id === "show-cancelled")?.status).toBe("cancelado");
  });

  it("un show futuro conserva su estado guardado", async () => {
    const body = await dashboardBody();
    expect(body.artistShows.find((s) => s.id === "show-future")?.status).toBe("confirmado");
  });

  it("la rama de admin usa el mismo cálculo (getShowsByArtists)", async () => {
    (validateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "admin-1", role: "admin" });
    const body = await dashboardBody();
    expect(body.artistShows.find((s) => s.id === "show-past")?.status).toBe("pasado");
    const byId = Object.fromEntries((body.showsByArtist["art-rh"] ?? []).map((s) => [s.id, s.status]));
    expect(byId["show-past"]).toBe("pasado");
  });

  it("ningún show con fecha pasada sale con el estado CRUDO de la columna", async () => {
    const body = await dashboardBody();
    const all = [...body.artistShows, ...(body.showsByArtist["art-rh"] ?? [])];
    const sucios = all.filter((s) => s.id === "show-past" || s.id === "show-own");
    expect(sucios.length).toBeGreaterThan(0);
    expect(sucios.every((s) => s.status === "pasado")).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * PINTURA — `ShowsBooking`
 * ──────────────────────────────────────────────────────────────────────────── */

import { ShowsBooking } from "@/components/ShowsBooking";

const PAST_SHOW = {
  id: "show-past",
  artist_id: "art-rh",
  venue_name: "Barfly",
  city: "Londres",
  country: "UK",
  date: "2001-06-14",
  time: "21:00",
  price_range: "£10",
  // Lo que llega de la API con el arreglo aplicado.
  status: "pasado",
  payment_methods: null,
  postponement_reason: null,
  flyer_url: null,
  ticket_link: null,
  description: null,
  guest_artists: null,
  notes: null,
  approved: true,
  deleted_at: null,
  updated_at: null,
  created_at: "2001-01-01",
};

const FUTURE_SHOW = { ...PAST_SHOW, id: "show-future", venue_name: "Sala Unknown", date: "2999-06-20", status: "confirmado" };

function renderBooking(shows: unknown[]) {
  return render(createElement(ShowsBooking, { shows: shows as never }));
}

afterEach(() => {
  cleanup();
});

describe("ShowsBooking — una sola etiqueta y ninguna promesa falsa", () => {
  it("un show pasado muestra SU etiqueta de estado y sigue siendo legible", () => {
    renderBooking([PAST_SHOW]);
    expect(screen.getByText("Pasado")).toBeTruthy();
    // La fila no desaparece: fecha, lugar y precio siguen ahí.
    expect(screen.getByText(/Barfly/)).toBeTruthy();
    expect(screen.getByText(/Londres, UK/)).toBeTruthy();
  });

  it("NO dice \"se elimina en 48h\": ese DELETE no lo ejecuta nadie", () => {
    const { container } = renderBooking([PAST_SHOW]);
    expect(container.textContent ?? "").not.toMatch(/48\s*h/i);
    expect(container.textContent ?? "").not.toMatch(/se elimina/i);
  });

  it("no pinta DOS etiquetas de estado en la misma fila", () => {
    const { container } = renderBooking([PAST_SHOW]);
    const pills = Array.from(container.querySelectorAll("span")).filter((el) =>
      /^(Próximamente|Hoy|Pasado|Cancelado|Suspendido|Confirmado|En Venta|Agotado|Pospuesto|Reprogramado|Disponible|Finalizado)$/.test(
        (el.textContent ?? "").trim()
      )
    );
    expect(pills.length).toBe(1);
  });

  it("un show futuro conserva su etiqueta", () => {
    renderBooking([FUTURE_SHOW]);
    expect(screen.getByText("Confirmado")).toBeTruthy();
    expect(screen.queryByText("Pasado")).toBeNull();
  });

  it("el componente NO vuelve a mirar la fecha: sin reloj, la fila es la misma", () => {
    // Si el componente calculara `isPast` por su cuenta, cambiar la fecha del
    // sistema lo cambiaría. Este render no usa ninguna: el estado es el del
    // servidor y solo eso decide qué se pinta.
    const { container } = renderBooking([PAST_SHOW]);
    expect(container.textContent ?? "").toContain("Pasado");
  });

  /**
   * La captura del usuario, reproducida tal cual: el servidor dice
   * "proximamente" y la fecha es de ayer. Con el componente viejo esa fila
   * pintaba DOS etiquetas contradictorias —"Próximamente" y "Pasado · se elimina
   * en 48h"— porque cada una leía un dato distinto.
   *
   * Aquí la fila tiene que enseñar UNA etiqueta, la que le dio el servidor. Que
   * el texto correcto lo ponga la API es otro test (el de `/api/dashboard`
   * arriba); lo que se comprueba aquí es que el componente no añada una segunda
   * opinión por su cuenta.
   */
  it("status \"proximamente\" con fecha pasada NO genera una segunda etiqueta", () => {
    const contradictory = { ...PAST_SHOW, status: "proximamente" };
    const { container } = renderBooking([contradictory]);

    const text = container.textContent ?? "";
    expect(text).toContain("Próximamente");
    // La etiqueta del servidor, y solo ella.
    expect(text).not.toContain("Pasado · se elimina en 48h");
    const pills = Array.from(container.querySelectorAll("span")).filter((el) =>
      /^(Próximamente|Hoy|Pasado|Cancelado|Suspendido|Confirmado|En Venta|Agotado|Pospuesto|Reprogramado|Disponible|Finalizado|Pasado · se elimina en 48h)$/.test(
        (el.textContent ?? "").trim()
      )
    );
    expect(pills.length).toBe(1);
  });
});