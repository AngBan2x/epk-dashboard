/**
 * Fase E — motivos discriminados de integraciones externas (Last.fm, YouTube).
 *
 * Antes, todo fallo colapsaba en `null` / `[]`: "este artista no tiene datos"
 * y "la API está caída" pintaban exactamente el mismo píxel, y el usuario
 * (y el producto) no podían distinguirlos. Aquí vive el vocabulario común:
 * el motivo, el status HTTP que debe devolver la ruta, y el texto que ve la
 * persona en la UI.
 */

export type IntegrationReason =
  | "no_key" // falta la clave: la integración no está configurada
  | "not_found" // el recurso no existe upstream: "sin datos" SÍ es la respuesta
  | "quota" // 403/429 o error de cuota del proveedor
  | "network" // fallo de red local (DNS, TLS, socket)
  | "upstream"; // el proveedor respondió, pero con error o sin items

export type IntegrationResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: IntegrationReason };

export function integrationSuccess<T>(data: T): IntegrationResult<T> {
  return { ok: true, data };
}

export function integrationFailure<T = never>(
  reason: IntegrationReason,
): IntegrationResult<T> {
  return { ok: false, reason };
}

/**
 * Traduce el status HTTP de un proveedor externo a un motivo.
 * 403 y 429 son cuota (o clave sin permisos), 404 es "no existe", el resto
 * es un fallo del proveedor.
 */
export function classifyUpstreamStatus(status: number): IntegrationReason {
  if (status === 403 || status === 429) return "quota";
  if (status === 404) return "not_found";
  return "upstream";
}

/**
 * Status que debe devolver la ruta cuando la integración no puede responder.
 * `not_found` devuelve 200 a propósito: "no hay datos" es la respuesta
 * semánticamente correcta, no un error.
 */
export function httpStatusForReason(reason: IntegrationReason): number {
  switch (reason) {
    case "no_key":
      return 503;
    case "quota":
      return 429;
    case "network":
    case "upstream":
      return 502;
    case "not_found":
      return 200;
  }
}

/** Motivo -> texto largo, para el `title` (tooltip) de la UI. */
export function reasonMessageEs(
  reason: IntegrationReason,
  service: string,
): string {
  switch (reason) {
    case "no_key":
      return `${service} no está configurado en PressPlay, así que no se pueden mostrar sus métricas.`;
    case "not_found":
      return `${service} no tiene datos sobre este recurso.`;
    case "quota":
      return `Se agotó la cuota de la API de ${service}. Las métricas se recuperarán más tarde.`;
    case "network":
      return `No se pudo conectar con ${service}. Vuelve a intentarlo en unos minutos.`;
    case "upstream":
      return `${service} respondió con un error. Vuelve a intentarlo en unos minutos.`;
  }
}

/** Motivo -> texto corto, para la nota visible bajo el número (el tooltip no existe en móvil). */
export function reasonNoteEs(
  reason: IntegrationReason,
  service: string,
): string {
  switch (reason) {
    case "no_key":
      return `${service} sin configurar`;
    case "not_found":
      return `Sin datos en ${service}`;
    case "quota":
      return "Cuota agotada";
    case "network":
    case "upstream":
      return `${service} no disponible`;
  }
}

/** Motivo -> mensaje para el cuerpo de la respuesta de la API. */
export function reasonApiMessageEs(
  reason: IntegrationReason,
  service: string,
): string {
  switch (reason) {
    case "no_key":
      return `API_KEY de ${service} no configurada`;
    case "not_found":
      return `Sin datos en ${service}`;
    case "quota":
      return `Cuota de la API de ${service} agotada`;
    case "network":
      return `No se pudo conectar con ${service}`;
    case "upstream":
      return `${service} respondió con un error`;
  }
}
