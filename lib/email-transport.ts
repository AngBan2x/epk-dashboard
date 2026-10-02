import { Resend } from "resend";

// ─── Frontera de transporte de correo (P3) ──────────────────────────────────
//
// Por qué este módulo existe, y por qué no está dentro de `lib/email.ts`:
//
// Antes, `lib/email.ts` importaba `{ resend }` de `@/lib/resend`, y ahí el
// cliente se construía con un `const` a nivel de módulo. Eso rompía dos cosas a
// la vez:
//
//   1. Cualquier test que importara el módulo dependía de si `RESEND_API_KEY`
//      existía *en el momento del import*, y no había forma de simular que la
//      API devolviera 500 sin llegar a hablar con Resend.
//   2. `lib/resend.ts:3-4` leía el env en ámbito de módulo, que es el patrón que
//      RC.32 rompió en `lib/turso.ts` (S1). Con el env llegando tarde —lo normal
//      en un bundle de Vercel— `resend` quedaba en `null` para siempre.
//
// Aquí el env se lee **en tiempo de llamada**, siempre, y el envío es una
// función que se puede sustituir. Un doble en memoria entra por el mismo hueco.
//
// ─── Los TRES estados, y por qué no son dos ──────────────────────────────────
//
//   sent           se intentó y Resend aceptó (hay `messageId`)
//   failed         se intentó y falló (error de red, 4xx, 5xx, cuota)
//   not_attempted  NO se intentó nada, y no se va a intentar
//
// El tercero no es "fallo". Un `FROM_EMAIL` ausente es un log, no un 500: si se
// colapsara en `failed`, el buzón de sugerencias (P4) y el camino de aprobaciones
// mentirían en el log diciendo que se intentó enviar algo que nadie va a mandar.
//
// ─── El remitente y por qué hay que COMPARAR destinatarios ───────────────────
//
// Sin dominio verificado, Resend deja enviar, pero solo desde
// `onboarding@resend.dev`, y **solo al titular de la cuenta**. A cualquier otra
// dirección la API responde 403. Verificado contra la API de Resend.
//
// Por tanto, cuando el remitente efectivo es el de onboarding, el único
// destinatario permitido es el que figura en `RESEND_SMOKE_TO`. Comparar es
// obligatorio, no cosmético: intentar a otra persona es un 403 garantizado, y un
// 403 por cada suscriptor es ruido que tapa el fallo real.
//
// ─── Por qué `RESEND_SMOKE` es una puerta y no un flag de test ───────────────
//
// El envío real consume cuota (100 correos/mes en el plan gratis) y depende de
// la red. Si estuviera en la suite, un fallo de cuota o de red apagaría el gate
// entero. Peor que no tener la prueba. Por eso hay dos transportes:
//
//   getEmailTransport()  producción: real si hay key, no-op explícito si no
//   getSmokeTransport()  humo opt-in: exige RESEND_SMOKE=1 Y destino coincide
//
// El segundo lo consume `scripts/verify-resend-smoke.ts`, que es un script
// explícito y no un spec: correr la suite 20 veces al día gastaría la cuota del
// mes.

/** Remitente de pruebas de Resend. Solo entrega al titular de la cuenta. */
export const ONBOARDING_FROM = "PressPlay <onboarding@resend.dev>";

export type EmailSendStatus = "sent" | "failed" | "not_attempted";

export interface EmailResult {
  status: EmailSendStatus;
  /** `slug: detalle`. El slug es estable; el detalle es para humanos. */
  reason?: string;
  messageId?: string;
}

export interface EmailTransportArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Frontera de envío. Nunca lanza: devuelve uno de los tres estados.
 * `sent` y `failed` significan que hubo un intento; `not_attempted` que no lo hubo.
 */
export type EmailTransport = (args: EmailTransportArgs) => Promise<EmailResult>;

export function sentResult(messageId?: string | null): EmailResult {
  return messageId ? { status: "sent", messageId } : { status: "sent" };
}

export function failedResult(reason: string): EmailResult {
  return { status: "failed", reason };
}

export function notAttemptedResult(reason: string): EmailResult {
  return { status: "not_attempted", reason };
}

// ─── Env en tiempo de llamada (nunca en ámbito de módulo) ────────────────────

export function getResendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

export function getConfiguredFromEmail(): string | undefined {
  return process.env.FROM_EMAIL?.trim() || undefined;
}

/** Titular de la cuenta: el único destinatario al que llega el remitente de onboarding. */
export function getSmokeRecipient(): string | undefined {
  return process.env.RESEND_SMOKE_TO?.trim() || undefined;
}

/**
 * El humo solo corre con el valor EXACTO `"1"`. Sin `trim()`, a proposito: una
 * puerta que gasta cuota no debe abrirse con una ambiguedad. Si `RESEND_SMOKE`
 * vale `" 1"` o `"01"` esta cerrada. (dotenv ya recorta los valores de un
 * `.env`, asi que un `" 1"` solo saldria de un export manual o de un `.env` mal
 * escrito — y en ese caso, mejor no enviar.)
 */
export function isSmokeEnabled(): boolean {
  return process.env.RESEND_SMOKE === "1";
}

// ─── Normalización de direcciones ───────────────────────────────────────────
//
// Resend compara la dirección literal del destinatario. Para decidir si el
// destinatario ES el titular hay que ignorar las tres diferencias que no lo
// hacen ser otra persona: mayúsculas, espacios, y el `+etiqueta` de Gmail (Gmail
// entrega `user+etiqueta@gmail.com` a `user@gmail.com`).
//
// El `+` solo se quita en dominios de Gmail: en el resto `a+x@ejemplo.com` y
// `a@ejemplo.com` son dos buzones distintos, y tratararlos como uno dejaría pasar
// un envío que Resend va a rechazar.

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Acepta `nombre <addr@dominio>`, `addr@dominio` o `nombre@dominio`. */
function bareAddress(value: string): string {
  const angled = value.match(/<([^>]+)>/);
  const raw = (angled?.[1] ?? value).trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at < 1) return raw;
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const plus = local.indexOf("+");
  const normalizedLocal = plus > 0 && GMAIL_DOMAINS.has(domain) ? local.slice(0, plus) : local;
  return `${normalizedLocal}@${domain}`;
}

/** ¿Son la misma persona? Compara ignorando mayúsculas, espacios y `+etiqueta` de Gmail. */
export function sameRecipient(a: string, b: string): boolean {
  const left = bareAddress(a);
  const right = bareAddress(b);
  return left.length > 0 && left === right;
}

export interface SenderResolution {
  /** Formato RFC 5322, que es lo que espera `emails.send({ from })`. */
  from: string;
  /** `true` si no hay `FROM_EMAIL` y se cae al remitente de pruebas de Resend. */
  isOnboardingFallback: boolean;
}

export function resolveSender(): SenderResolution {
  const configured = getConfiguredFromEmail();
  if (configured) return { from: configured, isOnboardingFallback: false };
  return { from: ONBOARDING_FROM, isOnboardingFallback: true };
}

// ─── La puerta, en forma pura (para poder testearla sin red) ─────────────────
//
// Separiar la decisión del envío es lo que permite comprobar que la puerta
// está abierta o cerrada sin gastar un solo correo.

export interface GateVerdict {
  ok: boolean;
  reason?: string;
}

export interface GateInput {
  to: string;
  sender: SenderResolution;
  apiKey?: string;
  /** Exige `RESEND_SMOKE === "1"`. Lo pone el transporte de humo, no el de producción. */
  requireSmokeFlag: boolean;
  smokeEnabled: boolean;
  smokeRecipient?: string;
}

export function evaluateSendGate(input: GateInput): GateVerdict {
  if (requireSmokeFlag(input) && !input.smokeEnabled) {
    return {
      ok: false,
      reason: "smoke_desactivado: RESEND_SMOKE no es \"1\" - envio real desactivado",
    };
  }
  if (!input.apiKey) {
    return {
      ok: false,
      reason: "resend_no_configurado: RESEND_API_KEY no configurado",
    };
  }
  if (input.sender.isOnboardingFallback) {
    if (!input.smokeRecipient) {
      return {
        ok: false,
        reason:
          "remitente_onboarding_sin_destinatario_permitido: sin FROM_EMAIL solo puede enviarse a RESEND_SMOKE_TO, que no esta definido",
      };
    }
    if (!sameRecipient(input.to, input.smokeRecipient)) {
      return {
        ok: false,
        reason:
          "remitente_onboarding_destinatario_distinto: el remitente onboarding@resend.dev solo entrega al titular (RESEND_SMOKE_TO)",
      };
    }
  }
  return { ok: true };
}

function requireSmokeFlag(input: GateInput): boolean {
  return input.requireSmokeFlag;
}

// ─── Envío real ─────────────────────────────────────────────────────────────
//
// Cliente fresco por llamada, igual que `getTursoClient()`: evita una caché de
// transporte HTTP obsoleta entre invocaciones en Vercel.

async function sendViaResend(apiKey: string, args: EmailTransportArgs): Promise<EmailResult> {
  try {
    const client = new Resend(apiKey);
    const { from } = resolveSender();
    const response = await client.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    if (response.error) {
      const name = response.error?.name || "error_desconocido";
      const message = response.error?.message || "sin mensaje";
      return failedResult(`resend_error: ${name}: ${message}`);
    }
    return sentResult(response.data?.id ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failedResult(`resend_excepcion: ${message}`);
  }
}

/**
 * Envuelve un envío en la puerta. Si la puerta está cerrada devuelve el tercer
 * estado con su motivo, sin tocar la red. Si está abierta, delega.
 */
function createGuardedTransport(options: { requireSmokeFlag: boolean }): EmailTransport {
  return async (args: EmailTransportArgs): Promise<EmailResult> => {
    const verdict = evaluateSendGate({
      to: args.to,
      sender: resolveSender(),
      apiKey: getResendApiKey(),
      requireSmokeFlag: options.requireSmokeFlag,
      smokeEnabled: isSmokeEnabled(),
      smokeRecipient: getSmokeRecipient(),
    });
    if (!verdict.ok) return notAttemptedResult(verdict.reason ?? "no_enviado");

    const apiKey = getResendApiKey();
    if (!apiKey) return notAttemptedResult("resend_no_configurado: RESEND_API_KEY no configurado");
    return sendViaResend(apiKey, args);
  };
}

/**
 * Transporte de producción: Resend real si hay clave, no-op explícito si no la hay.
 * No lanza nunca.
 */
export function getEmailTransport(): EmailTransport {
  return createGuardedTransport({ requireSmokeFlag: false });
}

/**
 * Transporte de humo: exige `RESEND_SMOKE=1`. Consume cuota real, así que solo lo
 * usa `scripts/verify-resend-smoke.ts`, nunca la suite de tests.
 */
export function getSmokeTransport(): EmailTransport {
  return createGuardedTransport({ requireSmokeFlag: true });
}

/**
 * Distingue cuota agotada de dominio sin verificar. Son dos problemas con dos
 * arreglos distintos, y un mensaje que los mezcle no ayuda a nadie.
 *
 * EL ORDEN IMPORTA. Dos de los mensajes reales de Resend empiezan igual:
 *
 *   "You can only send 100 emails per day"    -> cuota agotada
 *   "You can only send testing emails to ..."  -> remitente de pruebas
 *
 * Los dos contienen "can only send". Por eso la restriccion del remitente se
 * comprueba ANTES que la cuota: si se invirtiera, el error de onboarding —que es
 * el mas probable hoy, porque no hay dominio verificado— se diagnosticaria como
 * cuota, y el arreglo indicado (esperar al reinicio del mes) no serviria de nada.
 */
export function diagnoseResendError(detail: string): { kind: string; advice: string } {
  const text = detail.toLowerCase();

  // 1. Destinatario rechazado. Antes que nada, porque su mensaje tambien
  //    contiene "can only send" y hay que separarlo del caso de cuota.
  //    Ojo al segundo patron: Resend rechaza los dominios de ejemplo con 422
  //    ("use our testing email address instead of domains like example.com"),
  //    que es un problema distinto del 403 de onboarding y tiene otro arreglo.
  if (
    text.includes("testing emails") ||
    text.includes("own address") ||
    text.includes("testing email address instead")
  ) {
    return {
      kind: "destinatario_no_permitido",
      advice:
        "Resend rechazo el destinatario. Arreglo: con onboarding@resend.dev, RESEND_SMOKE_TO debe ser el correo del titular de la cuenta. Y no puede ser un dominio de ejemplo (@example.com): Resend los rechaza con 422.",
    };
  }

  // 2. Cuota.
  if (
    text.includes("quota") ||
    text.includes("limit_reached") ||
    text.includes("too many") ||
    text.includes("exceeded") ||
    text.includes("can only send")
  ) {
    return {
      kind: "cuota_agotada",
      advice:
        "La cuenta de Resend agoto su cuota (100 correos/mes en el plan gratis). Arreglo: esperar al reinicio del mes, o anadir un dominio verificado en Resend.",
    };
  }

  if (
    text.includes("not verified") ||
    text.includes("unverified") ||
    text.includes("domain_not_found")
  ) {
    return {
      kind: "dominio_no_verificado",
      advice:
        "El dominio del remitente no esta verificado en Resend. Arreglo: verificar el dominio en el panel de Resend (DNS) y poner FROM_EMAIL, o seguir usando onboarding@resend.dev (solo llega al titular).",
    };
  }

  if (text.includes("api key") || text.includes("unauthorized") || text.includes("401")) {
    return {
      kind: "credencial_invalida",
      advice: "RESEND_API_KEY no es valida o esta revocada. Arreglo: copiarla de nuevo del panel de Resend.",
    };
  }

  return {
    kind: "error_desconocido",
    advice: "Error no reconocido de Resend. Revisar el detalle anterior y el panel de Resend.",
  };
}