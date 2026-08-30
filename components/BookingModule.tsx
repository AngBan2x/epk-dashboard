"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeString } from "@/lib/null-safe";

interface ShowDate {
  id: string;
  date: string;
  venue: string;
  city: string;
  country: string;
  ticketStatus: "Disponible" | "Agotado" | "Próximamente" | "VIP Disponible";
  ticketUrl?: string;
  price?: string;
}

interface BookingModuleProps {
  artistName?: string;
  className?: string;
}

const defaultShows: ShowDate[] = [
  {
    id: "show-1",
    date: "2026-09-15",
    venue: "Teatro Teresa Carreño",
    city: "Caracas",
    country: "Venezuela",
    ticketStatus: "Disponible",
    ticketUrl: "#",
    price: "$25 - $80",
  },
  {
    id: "show-2",
    date: "2026-10-03",
    venue: "Auditorio Nacional",
    city: "Ciudad de México",
    country: "México",
    ticketStatus: "Próximamente",
    price: "$35 - $120",
  },
  {
    id: "show-3",
    date: "2026-10-18",
    venue: "Movistar Arena",
    city: "Buenos Aires",
    country: "Argentina",
    ticketStatus: "Disponible",
    ticketUrl: "#",
    price: "$30 - $95",
  },
  {
    id: "show-4",
    date: "2026-11-07",
    venue: "Teatro Caupolicán",
    city: "Santiago",
    country: "Chile",
    ticketStatus: "Agotado",
    price: "$28 - $75",
  },
  {
    id: "show-5",
    date: "2026-12-12",
    venue: "Coliseo Live",
    city: "Bogotá",
    country: "Colombia",
    ticketStatus: "VIP Disponible",
    price: "$45 - $150",
  },
];

const statusColors: Record<string, string> = {
  Disponible: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  Agotado: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800",
  "Próximamente": "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  "VIP Disponible": "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800",
};

export function BookingModule({
  artistName = "Artista EPK",
  className = "",
}: BookingModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    eventType: "",
    date: "",
    venue: "",
    message: "",
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
    setTimeout(() => {
      setFormSubmitted(false);
      setShowForm(false);
      setFormData({ name: "", email: "", eventType: "", date: "", venue: "", message: "" });
    }, 3000);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <section className={`p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>🎫</span> Shows & Booking
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Próximas fechas de conciertos y solicitudes de contratación
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white transition"
        >
          {showForm ? "← Volver a Shows" : "📩 Solicitar Contratación"}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {showForm ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {formSubmitted ? (
              <div className="p-8 text-center">
                <div className="text-4xl mb-4">✅</div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                  Solicitud Enviada
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nos pondremos en contacto contigo pronto.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Tu nombre completo"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Evento</label>
                    <select
                      required
                      value={formData.eventType}
                      onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="festival">Festival</option>
                      <option value="concert">Concierto Individual</option>
                      <option value="corporate">Evento Corporativo</option>
                      <option value="private">Evento Privado</option>
                      <option value="broadcast">Transmisión en Vivo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha Propuesta</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Recinto / Venue</label>
                  <input
                    type="text"
                    value={formData.venue}
                    onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Nombre del recinto (opcional)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mensaje</label>
                  <textarea
                    required
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    placeholder="Describe el evento, expectativas, presupuesto aproximado..."
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold transition"
                >
                  Enviar Solicitud de Contratación
                </button>
              </form>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="shows"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {defaultShows.map((show) => (
              <div
                key={show.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:border-primary-500/30 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-lg">🎵</span>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {safeString(show.venue)}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 ml-8">
                    {safeString(show.city)}, {safeString(show.country)} · {formatDate(show.date)}
                  </p>
                  {show.price && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 ml-8 mt-1">
                      Desde {show.price}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3 sm:mt-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColors[show.ticketStatus] || statusColors.Disponible}`}>
                    {show.ticketStatus}
                  </span>
                  {show.ticketUrl && show.ticketStatus !== "Agotado" && (
                    <a
                      href={show.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white transition"
                    >
                      🎟️ Comprar
                    </a>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
