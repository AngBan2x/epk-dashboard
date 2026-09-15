"use client";

import { useState, useEffect, useCallback } from "react";
import type { Show, ShowStatus, PaymentMethod, GuestArtist } from "@/types/music";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm";

const LABEL_CLASS = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

const STATUS_LABELS: Record<ShowStatus, string> = {
  proximamente: "Próximamente",
  activo: "Activo",
  pospuesto: "Pospuesto",
  hoy: "Hoy",
  pasado: "Pasado",
  cancelado: "Cancelado",
  suspendido: "Suspendido",
  confirmado: "Confirmado",
  en_venta: "En Venta",
  agotado: "Agotado",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  ticket_platform: "Plataforma de Tickets",
  other: "Otro",
};

interface ShowFormProps {
  show?: Show;
  artistId?: string;
  artists?: Array<{ id: string; name: string }>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

function buildEmptyForm(artistId: string) {
  return {
    artist_id: artistId,
    venue_name: "",
    city: "",
    country: "",
    date: "",
    time: "",
    price_range: "",
    status: "proximamente" as ShowStatus,
    ticket_url: "",
    ticket_link: "",
    flyer_url: "",
    description: "",
    notes: "",
    payment_methods: [] as PaymentMethod[],
    guest_artists: [] as GuestArtist[],
    postponement_reason: "",
  };
}

function buildFormFromShow(show: Show) {
  return {
    artist_id: show.artist_id,
    venue_name: show.venue_name,
    city: show.city ?? "",
    country: show.country ?? "",
    date: show.date ? show.date.slice(0, 10) : "",
    time: show.time ?? "",
    price_range: show.price_range ?? "",
    status: show.status,
    ticket_url: show.ticket_url ?? "",
    ticket_link: show.ticket_link ?? "",
    flyer_url: show.flyer_url ?? "",
    description: show.description ?? "",
    notes: show.notes ?? "",
    payment_methods: show.payment_methods ?? [],
    guest_artists: show.guest_artists ?? [],
    postponement_reason: show.postponement_reason ?? "",
  };
}

type FormState = ReturnType<typeof buildEmptyForm>;

export function ShowForm({ show, artistId = "", artists, onSave, onCancel }: ShowFormProps) {
  const [form, setForm] = useState<FormState>(() =>
    show ? buildFormFromShow(show) : buildEmptyForm(artistId)
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (show) {
      setForm(buildFormFromShow(show));
    } else {
      setForm(buildEmptyForm(artistId));
    }
  }, [show, artistId]);

  const update = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data: Record<string, unknown> = {
        artist_id: form.artist_id,
        venue_name: form.venue_name,
        city: form.city || null,
        country: form.country || null,
        date: form.date || null,
        time: form.time || null,
        price_range: form.price_range || null,
        status: form.status,
        ticket_url: form.ticket_url || null,
        ticket_link: form.ticket_link || null,
        flyer_url: form.flyer_url || null,
        description: form.description || null,
        notes: form.notes || null,
        payment_methods: form.payment_methods.length > 0 ? form.payment_methods : null,
        guest_artists: form.guest_artists.length > 0 ? form.guest_artists : null,
        postponement_reason: form.postponement_reason || null,
      };
      await onSave(data);
    } finally {
      setSubmitting(false);
    }
  };

  const addPaymentMethod = () =>
    update("payment_methods", [
      ...form.payment_methods,
      { type: "cash", details: "", platform_url: "" },
    ]);

  const removePaymentMethod = (i: number) =>
    update(
      "payment_methods",
      form.payment_methods.filter((_, idx) => idx !== i)
    );

  const updatePaymentMethod = <K extends keyof PaymentMethod>(
    i: number,
    key: K,
    value: PaymentMethod[K]
  ) =>
    update(
      "payment_methods",
      form.payment_methods.map((pm, idx) => (idx === i ? { ...pm, [key]: value } : pm))
    );

  const addGuestArtist = () =>
    update("guest_artists", [...form.guest_artists, { name: "", role: "" }]);

  const removeGuestArtist = (i: number) =>
    update(
      "guest_artists",
      form.guest_artists.filter((_, idx) => idx !== i)
    );

  const updateGuestArtist = <K extends keyof GuestArtist>(
    i: number,
    key: K,
    value: GuestArtist[K]
  ) =>
    update(
      "guest_artists",
      form.guest_artists.map((ga, idx) => (idx === i ? { ...ga, [key]: value } : ga))
    );

  const showPostponementField = form.status === "pospuesto" || form.status === "cancelado";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {artists && artists.length > 0 && (
          <div>
            <label className={LABEL_CLASS}>Artista *</label>
            <select
              required
              value={form.artist_id}
              onChange={(e) => update("artist_id", e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Seleccionar artista</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}>Lugar *</label>
          <input
            type="text"
            required
            value={form.venue_name}
            onChange={(e) => update("venue_name", e.target.value)}
            className={INPUT_CLASS}
            placeholder="Nombre del lugar"
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Ciudad</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>País</label>
          <input
            type="text"
            value={form.country}
            onChange={(e) => update("country", e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Fecha</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Hora</label>
          <input
            type="time"
            value={form.time}
            onChange={(e) => update("time", e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Rango de Precio</label>
          <input
            type="text"
            value={form.price_range}
            onChange={(e) => update("price_range", e.target.value)}
            className={INPUT_CLASS}
            placeholder="ej: $20-$50"
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Estado</label>
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value as ShowStatus)}
            className={INPUT_CLASS}
          >
            {(Object.keys(STATUS_LABELS) as ShowStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>URL Tickets</label>
        <input
          type="url"
          value={form.ticket_url}
          onChange={(e) => update("ticket_url", e.target.value)}
          className={INPUT_CLASS}
          placeholder="https://..."
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>Link de Tickets (secundario)</label>
        <input
          type="url"
          value={form.ticket_link}
          onChange={(e) => update("ticket_link", e.target.value)}
          className={INPUT_CLASS}
          placeholder="https://..."
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>URL del Flyer</label>
        <input
          type="url"
          value={form.flyer_url}
          onChange={(e) => update("flyer_url", e.target.value)}
          className={INPUT_CLASS}
          placeholder="https://..."
        />
        {form.flyer_url && (
          <img
            src={form.flyer_url}
            alt="Preview del flyer"
            className="mt-2 h-32 w-32 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>

      <div>
        <label className={LABEL_CLASS}>Descripción</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>Notas</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      {showPostponementField && (
        <div>
          <label className={LABEL_CLASS}>
            {form.status === "pospuesto" ? "Razón de posposición" : "Razón de cancelación"}
          </label>
          <textarea
            rows={2}
            value={form.postponement_reason}
            onChange={(e) => update("postponement_reason", e.target.value)}
            className={INPUT_CLASS}
            placeholder="Describe la razón..."
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={LABEL_CLASS}>Métodos de Pago</label>
          <button
            type="button"
            onClick={addPaymentMethod}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            + Agregar método de pago
          </button>
        </div>
        {form.payment_methods.length === 0 && (
          <p className="text-xs text-slate-400">No hay métodos de pago agregados.</p>
        )}
        <div className="space-y-2">
          {form.payment_methods.map((pm, i) => (
            <div
              key={i}
              className="flex flex-col md:flex-row gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
            >
              <select
                value={pm.type}
                onChange={(e) => updatePaymentMethod(i, "type", e.target.value as PaymentMethod["type"])}
                className={`${INPUT_CLASS} md:w-48`}
              >
                {Object.entries(PAYMENT_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={pm.details ?? ""}
                onChange={(e) => updatePaymentMethod(i, "details", e.target.value)}
                className={`${INPUT_CLASS} flex-1`}
                placeholder="Detalles / identificador"
              />
              <input
                type="url"
                value={pm.platform_url ?? ""}
                onChange={(e) => updatePaymentMethod(i, "platform_url", e.target.value)}
                className={`${INPUT_CLASS} flex-1`}
                placeholder="URL (opcional)"
              />
              <button
                type="button"
                onClick={() => removePaymentMethod(i)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 transition"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={LABEL_CLASS}>Artistas Invitados</label>
          <button
            type="button"
            onClick={addGuestArtist}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            + Agregar artista invitado
          </button>
        </div>
        {form.guest_artists.length === 0 && (
          <p className="text-xs text-slate-400">No hay artistas invitados agregados.</p>
        )}
        <div className="space-y-2">
          {form.guest_artists.map((ga, i) => (
            <div
              key={i}
              className="flex flex-col md:flex-row gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
            >
              <input
                type="text"
                required
                value={ga.name}
                onChange={(e) => updateGuestArtist(i, "name", e.target.value)}
                className={`${INPUT_CLASS} flex-1`}
                placeholder="Nombre del artista"
              />
              <input
                type="text"
                value={ga.role ?? ""}
                onChange={(e) => updateGuestArtist(i, "role", e.target.value)}
                className={`${INPUT_CLASS} flex-1`}
                placeholder="Rol (opcional)"
              />
              <button
                type="button"
                onClick={() => removeGuestArtist(i)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 transition"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
        >
          {submitting
            ? "Guardando..."
            : show
            ? "Guardar Cambios"
            : "Crear Show"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
