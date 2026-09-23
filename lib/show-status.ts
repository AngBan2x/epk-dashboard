// Canonical show-status vocabulary — keys match the DB enum in types/music.ts
// (ShowStatus). Old aliases (proximo, pendiente, ...) kept for compatibility.

export type ShowStatus =
  | "proximamente"
  | "activo"
  | "pospuesto"
  | "hoy"
  | "pasado"
  | "cancelado"
  | "suspendido"
  | "confirmado"
  | "en_venta"
  | "agotado"
  | "reprogramado"
  | "disponible"
  | "finalizado"
  | string;

export const SHOW_STATUS_STYLES: Record<string, string> = {
  proximamente: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  activo: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  pospuesto: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  hoy: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  pasado: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  cancelado: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  suspendido: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  confirmado: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  en_venta: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
  agotado: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  reprogramado: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
  disponible: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  finalizado: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  // Legacy aliases
  proximo: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  pendiente: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  propuesto: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  aprobado: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  rechazado: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  completado: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  en_vivo: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
};

export function showStatusClass(status: string): string {
  return (
    SHOW_STATUS_STYLES[status] ||
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
  );
}

export function showStatusLabel(status: string): string {
  const labels: Record<string, string> = {
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
    reprogramado: "Reprogramado",
    disponible: "Disponible",
    finalizado: "Finalizado",
    // Legacy aliases
    proximo: "Próximamente",
    pendiente: "Pendiente",
    propuesto: "Propuesto",
    aprobado: "Aprobado",
    rechazado: "Rechazado",
    completado: "Completado",
    en_vivo: "En vivo",
  };
  return labels[status] || status;
}

export const SHOW_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "proximamente", label: "Próximamente" },
  { value: "activo", label: "Activo" },
  { value: "confirmado", label: "Confirmado" },
  { value: "en_venta", label: "En Venta" },
  { value: "disponible", label: "Disponible" },
  { value: "hoy", label: "Hoy" },
  { value: "agotado", label: "Agotado" },
  { value: "pospuesto", label: "Pospuesto" },
  { value: "reprogramado", label: "Reprogramado" },
  { value: "suspendido", label: "Suspendido" },
  { value: "cancelado", label: "Cancelado" },
  { value: "pasado", label: "Pasado" },
  { value: "finalizado", label: "Finalizado" },
];

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  ticket_platform: "Plataforma de Tickets",
  other: "Otro",
};

export function paymentMethodLabel(type: string): string {
  return PAYMENT_TYPE_LABELS[type] || type;
}
