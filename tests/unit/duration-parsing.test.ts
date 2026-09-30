import { describe, it, expect } from "vitest";
import { parseDurationToSeconds, sumDurations } from "@/lib/null-safe";

/**
 * P16 (RC.31) — contrato compartido con los agentes B, C y D2.
 *
 * El parser que estos helpers reemplazan estaba duplicado en
 * `components/ReleaseTracklistSection.tsx:35-37` y `app/track/[id]/page.tsx:96-98`
 * y hacía `const [m, s] = value.split(":")`. Con tres segmentos devolvía
 * `1 * 60 + 2 = 62` en vez de 3723, y el guard `isNaN` NO saltaba porque
 * `[1, 2, 3]` no contiene ningún NaN. El resultado erroneouso se escribía en la
 * columna `duration`.
 */
describe("parseDurationToSeconds", () => {
  it("parsea M:SS", () => {
    expect(parseDurationToSeconds("3:45")).toBe(225);
  });

  it("parsea MM:SS con el mismo resultado que M:SS", () => {
    expect(parseDurationToSeconds("12:07")).toBe(727);
  });

  it("parsea un minuto y un segundo exactos", () => {
    expect(parseDurationToSeconds("1:00")).toBe(60);
  });

  it("parsea H:MM:SS sumando la hora entera (el caso del bug)", () => {
    // La regresión que el parser anterior no detectaba: `["1","02","03"]`
    // destructurado como `[m, s]` daba 62 s, no 3723.
    expect(parseDurationToSeconds("1:02:03")).toBe(3723);
  });

  it("parsea HH:MM:SS con dos dígitos de hora", () => {
    expect(parseDurationToSeconds("01:30:00")).toBe(5400);
  });

  it("devuelve null para el placeholder del seed y para vacío", () => {
    expect(parseDurationToSeconds("—")).toBeNull();
    expect(parseDurationToSeconds("")).toBeNull();
    expect(parseDurationToSeconds("   ")).toBeNull();
  });

  it("devuelve null para null y undefined en vez de 0", () => {
    // `null` y no `0`: el llamante tiene que poder distinguir "no hay dato" de
    // "duración cero".
    expect(parseDurationToSeconds(null)).toBeNull();
    expect(parseDurationToSeconds(undefined)).toBeNull();
  });

  it("devuelve null para texto no numérico, para segmentos de más y para 00:00 (que sí cuenta)", () => {
    expect(parseDurationToSeconds("N/A")).toBeNull();
    expect(parseDurationToSeconds("3:ab")).toBeNull();
    expect(parseDurationToSeconds("3:45:6:7")).toBeNull();
    expect(parseDurationToSeconds("00:00")).toBe(0);
  });

  it("rechaza segundos y minutos fuera de rango en vez de desbordar en silencio", () => {
    expect(parseDurationToSeconds("3:75")).toBeNull();
    expect(parseDurationToSeconds("1:75:00")).toBeNull();
    expect(parseDurationToSeconds("1:00:99")).toBeNull();
  });
});

describe("sumDurations", () => {
  it("suma las hijas del seed y devuelve la etiqueta en M:SS", () => {
    const result = sumDurations(["3:45", "6:07", "4:12"]);
    expect(result).not.toBeNull();
    expect(result?.seconds).toBe(225 + 367 + 252);
    // `M:SS`: los minutos NO llevan relleno a la izquierda. `formatDuration`
    // de `lib/null-safe.ts` no sirve aquí porque solo rellena los segundos y
    // dejaría un "06:07" inconsistente al lado de las hijas del seed.
    expect(result?.label).toBe("14:04");
  });

  it("incluye la hora completa cuando una pista dura más de 60 minutos", () => {
    // 3723 s = 62 min 3 s. El parser anterior sumaba 62 s por el mismo valor.
    expect(sumDurations(["1:02:03", "3:45"])).toEqual({ seconds: 3948, label: "65:48" });
  });

  it("ignora los valores no parseables en vez de abortar", () => {
    const result = sumDurations(["3:45", "—", null, "", undefined, "4:00"]);
    expect(result).toEqual({ seconds: 465, label: "7:45" });
  });

  it("devuelve null si no hay nada que sumar, para distinguir vacío de 0", () => {
    expect(sumDurations([])).toBeNull();
    expect(sumDurations(["—", "", null, undefined])).toBeNull();
  });

  it("no rellena los minutos a la izquierda", () => {
    // 2566 s + 367 s = 2933 s = 48 min 53 s. Con relleno a la izquierda
    // saldría "48:53" igual, así que el caso que delata el formato es el minuto
    // corto: debe quedar "0:07" y no "00:07".
    expect(sumDurations(["42:46", "6:07"])?.label).toBe("48:53");
    expect(sumDurations(["0:07"])?.label).toBe("0:07");
    expect(sumDurations(["6:07"])?.label).toBe("6:07");
  });
});
