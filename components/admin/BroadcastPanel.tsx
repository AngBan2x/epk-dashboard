"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";

interface BroadcastResult {
  notified: number;
  emailsQueued: number;
  emailsSent: number;
  skipped: number;
  failures: string[];
  truncated?: number;
}

interface BroadcastPanelProps {
  onSent?: () => void;
}

const TITLE_MAX = 120;
const MESSAGE_MAX = 1000;
const LONG_MESSAGE_THRESHOLD = 200;

export function BroadcastPanel({ onSent }: BroadcastPanelProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedTitle = title.trim();
  const trimmedMessage = message.trim();
  const titleValid = trimmedTitle.length >= 3 && trimmedTitle.length <= TITLE_MAX;
  const messageValid = trimmedMessage.length >= 3 && trimmedMessage.length <= MESSAGE_MAX;
  const canSubmit = titleValid && messageValid && !sending;
  const needsConfirmation = sendEmail || trimmedMessage.length >= LONG_MESSAGE_THRESHOLD;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    const scope = sendEmail
      ? "Este aviso se enviará a TODOS los usuarios registrados, por notificación in-app y por email."
      : "Este aviso se enviará a TODOS los usuarios registrados, por notificación in-app.";

    if (needsConfirmation && !window.confirm(`${scope} ¿Continuar?`)) return;

    setSending(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          message: trimmedMessage,
          sendEmail,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          data && typeof data.error === "string"
            ? data.error
            : "No se pudo enviar el aviso"
        );
        return;
      }
      setResult(data as BroadcastResult);
      setTitle("");
      setMessage("");
      setSendEmail(false);
      onSent?.();
    } catch {
      setError("Error de conexión con la API");
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      aria-labelledby="broadcast-heading"
      className="mb-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6"
    >
      <h2
        id="broadcast-heading"
        className="font-semibold text-slate-900 dark:text-slate-100"
      >
        Aviso a toda la plataforma
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        El aviso llegará a todas las personas registradas en PressPlay
        (administradores, artistas y suscriptores), respetando las preferencias de
        notificación de cada cuenta.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="broadcast-title-input"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Título *
          </label>
          <input
            id="broadcast-title-input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TITLE_MAX}
            required
            aria-describedby="broadcast-title-hint"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          />
          <p
            id="broadcast-title-hint"
            className="mt-1 text-xs text-slate-500 dark:text-slate-400"
          >
            {trimmedTitle.length}/{TITLE_MAX}
          </p>
        </div>

        <div>
          <label
            htmlFor="broadcast-message-input"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Mensaje *
          </label>
          <textarea
            id="broadcast-message-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            maxLength={MESSAGE_MAX}
            required
            aria-describedby="broadcast-message-hint"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          />
          <p
            id="broadcast-message-hint"
            className="mt-1 text-xs text-slate-500 dark:text-slate-400"
          >
            {trimmedMessage.length}/{MESSAGE_MAX}
          </p>
        </div>

        <div className="flex items-start gap-2">
          <input
            id="broadcast-email-input"
            type="checkbox"
            checked={sendEmail}
            onChange={(event) => setSendEmail(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          <label
            htmlFor="broadcast-email-input"
            className="text-sm text-slate-700 dark:text-slate-300"
          >
            Enviar también por email
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit}>
            {sending ? "Enviando..." : "Enviar aviso"}
          </Button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Se pedirá confirmación si el mensaje es largo o si incluye email.
          </p>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-4 p-3 rounded-lg text-sm font-medium bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800"
        >
          {error}
        </div>
      )}

      {result && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 p-3 rounded-lg text-sm bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800"
        >
          <p className="font-semibold">
            Aviso enviado a {result.notified} usuario{result.notified === 1 ? "" : "s"}
          </p>
          <p className="mt-1">
            Emails encolados: {result.emailsQueued} · Enviados: {result.emailsSent} ·
            Omitidos: {result.skipped} · Fallos: {result.failures.length}
          </p>
          {(result.truncated ?? 0) > 0 && (
            <p className="mt-1">
              Se omitieron {result.truncated} destinatarios por el límite de envío.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
