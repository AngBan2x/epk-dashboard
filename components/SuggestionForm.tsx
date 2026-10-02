'use client';

import React, { useCallback, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * P4 · Formulario público del buzón.
 *
 * Es ANÓNIMO a propósito: quien reporta un problema muchas veces no tiene
 * cuenta, y el buzón existe justo para pescar eso. Por eso no hay campo de
 * contraseña, ni de nombre, ni de sesión: se pide un correo y un mensaje, y con
 * el correo se contesta.
 *
 * El componente envía dos campos que NO ve el usuario:
 *
 *   - `empresa` — el honeypot (capa 1). Está fuera de pantalla, sin foco y sin
 *     relación con nada. Un humano ni lo ve ni lo rellena; un bot que rellena
 *     todos los `input type="text"` que encuentra, sí.
 *   - `form_started_at` — el instante en que se montó el componente (capa 2). El
 *     servidor lo compara con su propio reloj y descarta lo que llegue antes de
 *     2 s.
 *
 * El cliente NO decide nada de esto: las cinco capas viven en el servidor. Aquí
 * solo se manda lo que se necesita para que el servidor pueda decidir, y se
 * enseñan al usuario los errores que sí puede corregir (los de validación).
 */

/** Mismos topes que el servidor. El cliente solo anticipa; el que manda es Zod. */
const MESSAGE_MIN = 20;
const MESSAGE_MAX = 5000;
/** RFC 5321 §4.5.3.1. */
const EMAIL_MAX = 254;

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800';

const LABEL_CLASS = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

const FIELD_CLASS = `w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 ${FOCUS_RING}`;

type Feedback = { kind: 'success' | 'error'; text: string } | null;

export default function SuggestionForm() {
  const uid = useId();
  const emailId = `${uid}-email`;
  const messageId = `${uid}-message`;
  const honeypotId = `${uid}-empresa`;
  const counterId = `${uid}-counter`;
  const feedbackId = `${uid}-feedback`;

  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * El instante de montaje, como estado y NO como ref: un estado inicializado
   * con `Date.now()` corre en el servidor (SSR) y otra vez en el cliente durante
   * la hidratación, y el que nos interesa es el del cliente — el del servidor no
   * se usa para nada. Solo se manda en el `fetch`, nunca se pinta, así que no hay
   * riesgo de desajuste de hidratación.
   */
  const [startedAt, setStartedAt] = useState(() => Date.now());

  const messageLength = message.trim().length;
  const tooShort = messageLength > 0 && messageLength < MESSAGE_MIN;

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;

      setSubmitting(true);
      setFeedback(null);
      setFieldErrors({});

      try {
        const res = await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            message,
            empresa: honeypot,
            form_started_at: startedAt,
          }),
        });

        if (res.ok) {
          // 201 tanto si se guardó como si una capa de anti-spam lo descartó: la
          // respuesta es idéntica a propósito, así que el componente no puede
          // (y no debe) distinguirlo. Para la persona que escribe da igual.
          setEmail('');
          setMessage('');
          setHoneypot('');
          setStartedAt(Date.now());
          setFeedback({
            kind: 'success',
            text: 'Gracias. Hemos recibido tu mensaje y te responderemos al correo que nos has dado.',
          });
          return;
        }

        const data = (await res.json().catch(() => null)) as {
          error?: string;
          fields?: Record<string, string>;
        } | null;

        // 429: aquí SÍ se distingue, y es deliberado. Un 429 trae `Retry-After`
        // y el usuario honesto necesita saber que tiene que esperar; sin ese dato
        // solo ve un fallo y no vuelve a intentarlo.
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('Retry-After'));
          const waitMinutes =
            Number.isFinite(retryAfter) && retryAfter > 60
              ? Math.ceil(retryAfter / 60)
              : null;
          setFeedback({
            kind: 'error',
            text: waitMinutes
              ? `Has enviado demasiados mensajes desde esta conexión. Vuelve a intentarlo en unos ${waitMinutes} minutos.`
              : 'Has enviado demasiados mensajes desde esta conexión. Espera un poco antes de volver a intentarlo.',
          });
          return;
        }

        setFieldErrors(data?.fields ?? {});
        setFeedback({
          kind: 'error',
          text:
            data?.error ??
            'No hemos podido enviar el mensaje. Revisa el correo y vuelve a intentarlo.',
        });
      } catch {
        setFeedback({
          kind: 'error',
          text: 'No hemos podido enviar el mensaje por un problema de conexión. Inténtalo de nuevo.',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [email, message, honeypot, startedAt, submitting]
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/*
        Honeypot (capa 1 del anti-spam).

        Las cuatro propiedades son necesarias y ninguna sobra:
          - `absolute -left-[9999px]`: fuera de pantalla de verdad. `sr-only` lo
            deja en el flujo, y algunos bots lo detectan por geometría.
          - `aria-hidden`: un lector de pantalla no debe tropezar con un campo
            que no existe para quien usa el teclado.
          - `tabIndex={-1}`: no puede recibir foco con el tabulador.
          - `autoComplete="off"`: el nombre `empresa` no está en ningún gestor de
            contraseñas, pero un autocompletado agresivo lo llenaría igualmente y
            el honeypot se dispararía contra usuarios honestos.
        No lleva `<label>` a propósito: si un humano lo alcanzara con el ratón,
        vería un campo sin nombre, que es exactamente la señal de que ha tocado
        algo que no debía.
      */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={honeypotId}>Empresa</label>
        <input
          id={honeypotId}
          name="empresa"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor={emailId} className={LABEL_CLASS}>
          Tu correo
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={EMAIL_MAX}
          required
          autoComplete="email"
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          placeholder="tu@correo.com"
          className={`${FIELD_CLASS} ${
            fieldErrors.email ? 'border-rose-500 dark:border-rose-400' : ''
          }`}
        />
        {fieldErrors.email && (
          <p
            id={`${emailId}-error`}
            className="mt-1 text-sm font-medium text-rose-600 dark:text-rose-400"
          >
            {fieldErrors.email}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Solo lo usamos para responderte. No se comparte con nadie.
        </p>
      </div>

      <div>
        <label htmlFor={messageId} className={LABEL_CLASS}>
          Tu mensaje
        </label>
        <textarea
          id={messageId}
          name="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          minLength={MESSAGE_MIN}
          maxLength={MESSAGE_MAX}
          required
          aria-invalid={Boolean(fieldErrors.message) || tooShort}
          aria-describedby={`${counterId}${fieldErrors.message ? ` ${messageId}-error` : ''}`}
          placeholder="Cuéntanos qué ha pasado, qué esperabas y qué ha ocurrido realmente."
          rows={7}
          className={`${FIELD_CLASS} min-h-[160px] leading-relaxed ${
            fieldErrors.message || tooShort
              ? 'border-rose-500 dark:border-rose-400'
              : ''
          }`}
        />
        <div
          id={counterId}
          aria-live="polite"
          className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400"
        >
          <span
            className={
              tooShort
                ? 'font-semibold text-rose-600 dark:text-rose-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }
          >
            {tooShort
              ? `Aún faltan ${MESSAGE_MIN - messageLength} caracteres`
              : `${messageLength}/${MESSAGE_MAX} caracteres`}
          </span>
        </div>
        {fieldErrors.message && (
          <p
            id={`${messageId}-error`}
            className="mt-1 text-sm font-medium text-rose-600 dark:text-rose-400"
          >
            {fieldErrors.message}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar mensaje'}
        </Button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Sin cuenta y sin registro. Un mensaje por correo cada 24 h.
        </p>
      </div>

      {feedback && (
        <p
          id={feedbackId}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border p-3 text-sm ${
            feedback.kind === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200'
          }`}
        >
          {feedback.text}
        </p>
      )}
    </form>
  );
}