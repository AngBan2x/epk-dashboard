import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ONBOARDING_FROM,
  evaluateSendGate,
  getSmokeTransport,
  getEmailTransport,
  isSmokeEnabled,
  resolveSender,
  sameRecipient,
  diagnoseResendError,
  type GateInput,
} from "@/lib/email-transport";

/**
 * Contrato de `lib/email-transport.ts` — SIN RED y SIN CUOTA.
 *
 * La regla que más cara sale si no se ata es la de arriba del todo: sin dominio
 * verificado, Resend solo entrega desde `onboarding@resend.dev` al titular de la
 * cuenta. A cualquier otra dirección la API responde 403. Por eso, cuando el
 * remitente efectivo es el de onboarding, el destinatario tiene que coincidir con
 * `RESEND_SMOKE_TO`.
 *
 * Y la segunda: `RESEND_SMOKE` distinto de `"1"` tiene que dejar el envío real
 * **desactivado** aunque haya clave y remitente. Si alguien deja el humo siempre
 * activo, sale rojo — y no gastando cuota, sino sin intentarlo siquiera.
 *
 * Por qué hay tests de predicado puro y no solo de transporte: abrir la puerta
 * significa llamar a la API de Resend. Abrirla de verdad en la suite gastaría
 * cuota (100 correos/mes). Así que `evaluateSendGate` se prueba directo — es pura
 * y decide lo mismo — y el transporte se prueba solo en las ramas CERRADAS, que
 * no tocan la red.
 */

const OWNER = "duenio@gmail.com";

/** Clave falsa: nunca llega a la red porque todas las ramas probadas cierran antes. */
const FAKE_KEY = "re_fake_key_para_el_contrato";

const savedEnv = { ...process.env };

function gate(overrides: Partial<GateInput> = {}): ReturnType<typeof evaluateSendGate> {
  return evaluateSendGate({
    to: OWNER,
    sender: resolveSender(),
    apiKey: FAKE_KEY,
    requireSmokeFlag: false,
    smokeEnabled: false,
    smokeRecipient: OWNER,
    ...overrides,
  });
}

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.FROM_EMAIL;
  delete process.env.RESEND_SMOKE;
  delete process.env.RESEND_SMOKE_TO;
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("P3 sin RESEND_API_KEY", () => {
  it("devuelve not_attempted, no exception", async () => {
    const result = await getEmailTransport()({
      to: OWNER,
      subject: "Hola",
      html: "<p>hola</p>",
    });
    expect(result.status).toBe("not_attempted");
    expect(result.reason).toContain("resend_no_configurado");
    expect(result.messageId).toBeUndefined();
  });

  it("no lanza aunque se le pase cualquier entrada", async () => {
    await expect(
      getEmailTransport()({ to: "nadie@ejemplo.com", subject: "x", html: "<p/>" })
    ).resolves.toMatchObject({ status: "not_attempted" });
  });
});

describe("P3 regla del remitente onboarding", () => {
  it("sin FROM_EMAIL cae a onboarding@resend.dev", () => {
    expect(resolveSender()).toEqual({
      from: ONBOARDING_FROM,
      isOnboardingFallback: true,
    });
    expect(ONBOARDING_FROM).toContain("onboarding@resend.dev");
  });

  it("con FROM_EMAIL usa ese remitente y no activa la restriccion", () => {
    process.env.FROM_EMAIL = "hola@pressplay.app";
    expect(resolveSender()).toEqual({
      from: "hola@pressplay.app",
      isOnboardingFallback: false,
    });
    expect(gate().ok).toBe(true);
  });

  it("onboarding + destinatario que NO es el titular -> puerta cerrada", () => {
    const verdict = gate({ to: "suscriptor@ejemplo.com", smokeRecipient: OWNER });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("remitente_onboarding_destinatario_distinto");
    // El motivo tiene que decir POR QUE: sin esto el log parece un bug.
    expect(verdict.reason).toContain("titular");
  });

  it("onboarding + sin RESEND_SMOKE_TO -> puerta cerrada (no hay a quien demostrar que es el titular)", () => {
    const verdict = gate({ smokeRecipient: undefined });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("remitente_onboarding_sin_destinatario_permitido");
  });

  it("onboarding + destinatario igual (caso, espacios y + de Gmail) -> puerta abierta", () => {
    expect(gate({ to: "  DUENIO+etiqueta@Gmail.com " }).ok).toBe(true);
    expect(gate({ to: "PressPlay <duenio@gmail.com>" }).ok).toBe(true);
  });

  it("el transporte real de produccion NO envia a un destinatario distinto con onboarding", async () => {
    process.env.RESEND_API_KEY = FAKE_KEY;
    process.env.RESEND_SMOKE_TO = OWNER;
    const result = await getEmailTransport()({
      to: "suscriptor@ejemplo.com",
      subject: "Hola",
      html: "<p>hola</p>",
    });
    expect(result.status).toBe("not_attempted");
    expect(result.reason).toContain("remitente_onboarding_destinatario_distinto");
  });
});

describe("P3 sameRecipient", () => {
  it("ignora mayusculas, espacios y el + de Gmail", () => {
    expect(sameRecipient("duenio@gmail.com", "DUENIO@Gmail.com")).toBe(true);
    expect(sameRecipient(" duenio@gmail.com ", "duenio@gmail.com")).toBe(true);
    expect(sameRecipient("duenio+notas@gmail.com", "duenio@gmail.com")).toBe(true);
    expect(sameRecipient("duenio+notas@googlemail.com", "duenio@googlemail.com")).toBe(true);
    expect(sameRecipient("PressPlay <duenio@gmail.com>", "duenio@gmail.com")).toBe(true);
  });

  it("NO iguala el + fuera de Gmail: a+x@ejemplo.com es otro buzon", () => {
    expect(sameRecipient("duenio+notas@ejemplo.com", "duenio@ejemplo.com")).toBe(false);
  });

  it("distingue cuentas distintas", () => {
    expect(sameRecipient("otro@gmail.com", OWNER)).toBe(false);
    expect(sameRecipient("duenio@gmail.com.otro.com", OWNER)).toBe(false);
    expect(sameRecipient("", OWNER)).toBe(false);
  });
});

describe("P3 la puerta RESEND_SMOKE protege el gate", () => {
  it.each(["0", "true", "si", "", " 1", "01"])(
    'RESEND_SMOKE=%j no es "1" -> envio real desactivado',
    (value) => {
      process.env.RESEND_SMOKE = value;
      expect(isSmokeEnabled()).toBe(false);
    }
  );

  it('RESEND_SMOKE="1" es el unico valor que abre la puerta', () => {
    process.env.RESEND_SMOKE = "1";
    expect(isSmokeEnabled()).toBe(true);
  });

  it.each([undefined, "0", "true", "si", ""])(
    "con RESEND_SMOKE=%j el transporte de humo NO envia, aun con clave y remitente",
    async (value) => {
      if (value === undefined) delete process.env.RESEND_SMOKE;
      else process.env.RESEND_SMOKE = value;

      // Clave y remitente puestos a proposito: lo unico que puede cerrar la
      // puerta es RESEND_SMOKE. Si alguien la quita, el transporte intentaria
      // llamar a Resend con una clave falsa, devolveria `failed` en vez de
      // `not_attempted`, y ESTE test se pondria rojo. Sin gastar cuota.
      process.env.RESEND_API_KEY = FAKE_KEY;
      process.env.FROM_EMAIL = "hola@pressplay.app";
      process.env.RESEND_SMOKE_TO = OWNER;

      const result = await getSmokeTransport()({
        to: OWNER,
        subject: "Humo",
        html: "<p>humo</p>",
      });

      expect(result.status).toBe("not_attempted");
      expect(result.reason).toContain("smoke_desactivado");
    }
  );

  it("con la puerta cerrada no se intenta nada aunque falte tambien la clave", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_SMOKE = "0";
    const result = await getSmokeTransport()({ to: OWNER, subject: "H", html: "<p/>" });
    // El orden importa: la puerta se consulta antes que la clave, para que el
    // motivo que se lee sea "no lo pediste" y no "te falta configuracion".
    expect(result.reason).toContain("smoke_desactivado");
  });

  it("el transporte de produccion NO lleva la puerta de humo", () => {
    // getEmailTransport() tiene que seguir enviando en produccion sin que nadie
    // tenga que poner RESEND_SMOKE=1.
    const verdict = gate({ requireSmokeFlag: false, smokeEnabled: false });
    expect(verdict.ok).toBe(true);
  });
});

describe("P3 diagnostico de errores de Resend", () => {
  // Mensajes reales de la API de Resend, con la forma que produce el transporte:
  // `resend_error: <name>: <message>`.
  const QUOTA = "resend_error: daily_quota_exceeded: You can only send 100 emails per day";
  const ONBOARDING_403 = "resend_error: forbidden: You can only send testing emails to your own address";
  const DOMAIN = "resend_error: domain_not_found: The domain pressplay.app is not verified";
  // Verificado contra la API de Resend: rechaza los dominios de ejemplo con 422
  // antes incluso de mirar el remitente.
  const EXAMPLE_DOMAIN =
    "resend_error: validation_error: Invalid `to` field. Please use our testing email address instead of domains like `example.com`.";

  it("distingue cuota agotada de dominio sin verificar", () => {
    expect(diagnoseResendError(QUOTA).kind).toBe("cuota_agotada");
    expect(diagnoseResendError(DOMAIN).kind).toBe("dominio_no_verificado");
  });

  it("NO confunde cuota con la restriccion del remitente de pruebas", () => {
    // Los dos mensajes empiezan por "You can only send". Si el orden se
    // invirtiera, el 403 de onboarding (el mas probable hoy) se diagnosticaria
    // como cuota y el arreglo indicado —esperar al reinicio— no serviria.
    expect(diagnoseResendError(QUOTA).kind).not.toBe("destinatario_no_permitido");
    expect(diagnoseResendError(ONBOARDING_403).kind).toBe("destinatario_no_permitido");
    expect(diagnoseResendError(ONBOARDING_403).kind).not.toBe("cuota_agotada");
  });

  it("distingue credencial invalida", () => {
    expect(diagnoseResendError("resend_error: invalid_api_key: API key is invalid").kind).toBe(
      "credencial_invalida"
    );
  });

  it("reconoce el 422 de los dominios de ejemplo", () => {
    // Este caso es el que hace que .env.example NO traiga un placeholder
    // @example.com: con ese valor el smoke falla con un error que parece de
    // codigo y no lo es.
    expect(diagnoseResendError(EXAMPLE_DOMAIN).kind).toBe("destinatario_no_permitido");
    expect(diagnoseResendError(EXAMPLE_DOMAIN).advice).toContain("example.com");
  });

  it("cada problema trae un arreglo distinto", () => {
    const advices = [QUOTA, DOMAIN, ONBOARDING_403].map((k) => diagnoseResendError(k).advice);
    expect(new Set(advices).size).toBe(3);
    expect(advices[0]).toContain("cuota");
    expect(advices[1]).toContain("verificar");
    expect(advices[2]).toContain("RESEND_SMOKE_TO");
  });

  it("un error desconocido no inventa un diagnostico", () => {
    expect(diagnoseResendError("algo raro").kind).toBe("error_desconocido");
  });
});