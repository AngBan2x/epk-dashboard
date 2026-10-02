#!/usr/bin/env tsx
/**
 * Smoke de Resend (P3) - prueba de que los correos SALE de verdad.
 *
 * Por qué un script y no un spec de vitest:
 *
 *   - **Cuota.** El plan gratis de Resend son 100 correos/mes. Dentro de la suite,
 *     correr los tests 20 veces al dia gastaria la cuota del mes entero y a fin
 *     de mes la prueba dejaria de funcionar por un motivo que no tiene nada que
 *     ver con el codigo. Un script es explicito: lo corres cuando quieres y
 *     consume un correo, no veinte.
 *   - **Red.** Un test que depende de una API de terceros pasa el lunes y falla
 *     el martes. Si eso apaga el gate de los 1020 tests, nadie ejecuta el gate,
 *     que es peor que no tener la prueba.
 *
 * Por eso la division: la capa que corre en cada push es
 * `tests/unit/email.test.ts` + `tests/unit/email-resend-contract.test.ts`, con
 * transporte falso y sin red. Esta es la unica que habla con Resend.
 *
 * ─── Lo que hace Resend sin dominio verificado ───────────────────────────────
 *
 * Sin dominio verificado Resend SI deja enviar, pero solo desde
 * `onboarding@resend.dev`, y **solo al titular de la cuenta**. A cualquier otra
 * direccion responde 403. Por eso `RESEND_SMOKE_TO` tiene que ser el correo del
 * titular: `getSmokeTransport()` comprueba la coincidencia antes de gastar una
 * llamada, y si no coincide devuelve el estado "no intentado" sin tocar la red.
 *
 * Uso:
 *   npx tsx scripts/verify-resend-smoke.ts            # imprime por que no corre, sale 0
 *   RESEND_SMOKE=1 npx tsx scripts/verify-resend-smoke.ts   # envia UN correo
 *
 * Nunca imprime la RESEND_API_KEY ni el HTML enviado.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  diagnoseResendError,
  getConfiguredFromEmail,
  getSmokeRecipient,
  getSmokeTransport,
  isSmokeEnabled,
  resolveSender,
} from "@/lib/email-transport";

const OWNER = "[pressplay:smoke]";

// Un correo, a proposito. No dos "para confirmar que no es un falso positivo":
// este smoke prueba la cadena de envio, no la recepcion.

function printState(): void {
  const sender = resolveSender();
  const fromConfigured = Boolean(getConfiguredFromEmail());

  console.log(`${OWNER} Estado de configuracion`);
  console.log(`${OWNER}   RESEND_API_KEY   ${process.env.RESEND_API_KEY ? "presente" : "AUSENTE"}`);
  console.log(`${OWNER}   FROM_EMAIL       ${fromConfigured ? getConfiguredFromEmail() : "AUSENTE (se usara onboarding@resend.dev)"}`);
  console.log(`${OWNER}   remitente        ${sender.from}`);
  console.log(`${OWNER}   tipo             ${sender.isOnboardingFallback ? "onboarding (solo llega al titular)" : "dominio propio (entrega a cualquiera)"}`);
  console.log(`${OWNER}   RESEND_SMOKE     ${isSmokeEnabled() ? "1" : process.env.RESEND_SMOKE === undefined ? "sin definir" : "definido pero no es \"1\""}`);
  console.log(`${OWNER}   RESEND_SMOKE_TO  ${getSmokeRecipient() ? getSmokeRecipient() : "AUSENTE"}`);
}

async function main(): Promise<number> {
  printState();

  if (!isSmokeEnabled()) {
    console.log("");
    console.log(`${OWNER} NO CORRE. Motivo: RESEND_SMOKE no vale "1".`);
    console.log(`${OWNER} Esta es la puerta a proposito: sin ella, la suite de tests`);
    console.log(`${OWNER} podria gastar la cuota del mes sin que nadie lo pidiera.`);
    console.log(`${OWNER} Para correrlo de verdad:`);
    console.log(`${OWNER}   1. Pon RESEND_SMOKE_TO con el correo del titular de la cuenta Resend`);
    console.log(`${OWNER}   2. RESEND_SMOKE=1 npx tsx scripts/verify-resend-smoke.ts`);
    console.log(`${OWNER} Nada se ha enviado. Salida 0 para no romper pipelines.`);
    return 0;
  }

  const to = getSmokeRecipient();
  if (!to) {
    console.log("");
    console.log(`${OWNER} NO CORRE. Motivo: falta RESEND_SMOKE_TO.`);
    console.log(`${OWNER} Sin un destinatario no se sabe a quien debe llegar el correo.`);
    console.log(`${OWNER} Con FROM_EMAIL sin verificar, el unico permitido es el titular`);
    console.log(`${OWNER} de la cuenta; en cualquier otro caso el envio seria un 403.`);
    return 0;
  }

  console.log("");
  console.log(`${OWNER} Enviando UN correo de prueba a ${to} ...`);

  const startedAt = Date.now();
  const result = await getSmokeTransport()({
    to,
    subject: "PressPlay - prueba de envio (P3)",
    html:
      "<!DOCTYPE html><html><body style=\"font-family:system-ui;padding:24px\">" +
      "<h1>Prueba de envio de PressPlay</h1>" +
      "<p>Si estas leyendo esto, la cadena de correo funciona de verdad:</p>" +
      "<p>transporte → Resend → entrega.</p>" +
      "<p>Correo generado por <code>scripts/verify-resend-smoke.ts</code>.</p>" +
      "</body></html>",
    text:
      "Prueba de envio de PressPlay. Si estas leyendo esto, la cadena de correo funciona de verdad.",
  });
  const elapsedMs = Date.now() - startedAt;

  console.log(`${OWNER} Resultado: ${result.status} (${elapsedMs} ms)`);

  if (result.status === "sent") {
    console.log(`${OWNER} CORREO ACEPTADO por Resend.`);
    console.log(`${OWNER}   messageId: ${result.messageId ?? "(sin id)"}`);
    console.log(`${OWNER}   remitente: ${resolveSender().from}`);
    console.log(`${OWNER} Revisa la bandeja (y la carpeta de spam) de ${to}.`);
    console.log(`${OWNER} Que Resend acepte el envio no es lo mismo que llegue: si no`);
    console.log(`${OWNER} aparece, el problema es de entrega, no de codigo.`);
    return 0;
  }

  if (result.status === "not_attempted") {
    console.log(`${OWNER} NADA SE HA ENVIADO. Motivo: ${result.reason}`);
    console.log(`${OWNER} Esto no es un fallo de Resend: la puerta se cerro antes de llamar.`);
    return 0;
  }

  // failed: aqui ya hubo una llamada real, asi que el diagnostico si separa dos
  // problemas que se arreglan de forma distinta.
  const detail = (result.reason ?? "").replace(/^[a-z_]+:\s*/, "");
  const diagnosis = diagnoseResendError(`${result.reason ?? ""} ${detail}`);
  console.log(`${OWNER} FALLO. Detalle de Resend: ${detail}`);
  console.log(`${OWNER} Diagnostico: ${diagnosis.kind}`);
  console.log(`${OWNER} Arreglo: ${diagnosis.advice}`);
  return 1;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(`${OWNER} Error inesperado en el propio script:`, error instanceof Error ? error.message : error);
    process.exit(1);
  });