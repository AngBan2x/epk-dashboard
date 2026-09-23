export type ShowStatus =
  | "proximo"
  | "confirmado"
  | "pendiente"
  | "cancelado"
  | "finalizado"
  | "reprogramado"
  | "disponible"
  | "propuesto"
  | "aprobado"
  | "rechazado"
  | "completado"
  | "en_vivo"
  | string;

export const SHOW_STATUS_STYLES: Record<string, string> = {
  proximo: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  confirmado: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  pendiente: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  cancelado: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  finalizado: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  reprogramado: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  disponible: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
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

export function showStatusLabel(status: string): string {  const labels: Record<string, string> = {
    proximo: "Próximamente",
    confirmado: "Confirmado",
    pendiente: "Pendiente",
    cancelado: "Cancelado",
    finalizado: "Finalizado",
    reprogramado: "Reprogramado",
    disponible: "Disponible",
    propuesto: "Propuesto",
    aprobado: "Aprobado",
    rechazado: "Rechazado",
    completado: "Completado",
    en_vivo: "En vivo",
  };
  return labels[status] || status;
}

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
