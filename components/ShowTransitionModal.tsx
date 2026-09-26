"use client";

import { useState } from "react";
import type { Show } from "@/types/music";

export type ShowTransitionMode = "postpone" | "cancel" | "reactivate";

interface ShowTransitionModalProps {
  show: Show;
  mode: ShowTransitionMode;
  onClose: () => void;
  onCompleted: (updated: Show) => void;
}

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm";

const LABEL_CLASS = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

const TITLES: Record<ShowTransitionMode, string> = {
  postpone: "Posponer show",
  cancel: "Cancelar show",
  reactivate: "Reactivar show",
};

const SUBMIT_LABELS: Record<ShowTransitionMode, string> = {
  postpone: "Posponer show",
  cancel: "Confirmar cancelación",
  reactivate: "Reactivar show",
};

function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function ShowTransitionModal({ show, mode, onClose, onCompleted }: ShowTransitionModalProps) {
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);

    if (mode === "postpone") {
      if (!newDate) {
        setError("Selecciona la nueva fecha del show");
        return;
      }
      if (newDate <= todayISO()) {
        setError("La nueva fecha debe ser posterior a hoy");
        return;
      }
    }

    if (mode !== "reactivate" && reason.trim().length < 10) {
      setError("El motivo debe tener al menos 10 caracteres");
      return;
    }

    setSaving(true);
    try {
      const body =
        mode === "postpone"
          ? { new_date: newDate, reason: reason.trim() }
          : mode === "cancel"
            ? { reason: reason.trim() }
            : {};
      const res = await fetch(`/api/shows/${show.id}/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const updated = (await res.json()) as Show;
        onCompleted(updated);
        return;
      }

      const err = await res.json().catch(() => null);
      const msg = err?.error;
      setError(
        typeof msg === "string"
          ? msg
          : Array.isArray(msg)
            ? msg.map((m: { message?: string }) => m.message || "Campo inválido").join(" · ")
            : "No se pudo actualizar el show"
      );
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={TITLES[mode]}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{TITLES[mode]}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{show.venue_name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {mode === "postpone" && (
            <div>
              <label className={LABEL_CLASS} htmlFor="transition-new-date">
                Nueva fecha *
              </label>
              <input
                id="transition-new-date"
                type="date"
                min={todayISO()}
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          )}

          {mode === "cancel" && (
            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              Reembolso: PressPlay no procesa devoluciones. Los tickets pagados deben ser
              reembolsados por el artista u organizador directamente con los asistentes.
            </div>
          )}

          {mode === "reactivate" && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              El show volverá a estar disponible con su fecha actual y se eliminará el motivo de
              posposición o cancelación registrado.
            </p>
          )}

          {mode !== "reactivate" && (
            <div>
              <label className={LABEL_CLASS} htmlFor="transition-reason">
                {mode === "postpone" ? "Motivo de la posposición *" : "Motivo de la cancelación *"}
              </label>
              <textarea
                id="transition-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Describe el motivo (mínimo 10 caracteres)"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {reason.trim().length}/10 caracteres mínimos
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white transition disabled:opacity-50"
            >
              {saving ? "Guardando..." : SUBMIT_LABELS[mode]}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
