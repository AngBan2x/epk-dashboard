"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface ReleaseActionsProps {
  releaseId: string;
  /**
   * `artist_name` de la fila. Es la única clave de ownership disponible en
   * cliente: `tracks` se relaciona con `artists` por NOMBRE, no por FK, así que
   * comparar `user.id` contra `releaseId` no significa nada.
   */
  artistName?: string;
  /**
   * Estado de moderación. Solo se pinta si el visitante es admin o el dueño:
   * un badge "Pendiente" o "Borrador" sobre contenido que todavía no se ha
   * publicado es información de la cola de revisión, no del catálogo.
   */
  status?: string;
}

const STATUS_LABELS: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  draft: "Borrador",
  rejected: "Rechazado",
  revision: "Revisión",
};

const STATUS_CLASSES: Record<string, string> = {
  approved: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  rejected: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  revision: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  draft: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
};

/**
 * P4 (RC.31): este componente eran 33 líneas que importaban `next/link` y no
 * tenían NINGÚN chequeo de rol ni de propiedad. Se renderizaba
 * incondicionalmente en `app/releases/[id]/page.tsx`, de modo que "Editar
 * Release" y "Volver al Dashboard" los veía cualquier visitante anónimo.
 *
 * Aquí no es solo cosmético: el write ya estaba protegido en servidor
 * (`app/api/releases/route.ts` → `PUT`, con owner o admin), así que el botón
 * era un adorno que prometía una capacidad que el backend iba a denegar con
 * 403. Es peor que un 403 limpio: el usuario escribe el formulario entero y
 * solo entonces se le dice que no.
 *
 * La propiedad se resuelve contra el perfil de artista del usuario, igual que
 * en `app/releases/[id]/edit/page.tsx:148`. El backend NO confía en esto —
 * `PUT /api/releases` vuelve a comprobar `artists.user_id`— así que un
 * `artist` que manipule el DOM desde aquí no gana nada. Lo que cambia es que
 * el botón ya no se le ofrece a quien no puede usarlo.
 */
export function ReleaseActions({ releaseId, artistName, status }: ReleaseActionsProps) {
  const { user, loading, hasRole } = useAuth();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    // Sin sesión no hay nada que comprobar todavía: los visitantes anónimos
    // reciben la navegación pública de abajo.
    if (loading) return;
    if (!user) {
      setIsOwner(false);
      return;
    }
    if (hasRole("admin")) {
      setIsOwner(true);
      return;
    }
    if (!artistName) {
      setIsOwner(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/artists/me?user_id=${encodeURIComponent(user.id)}`)
      .then((res) => res.json())
      .then((profile) => {
        if (!cancelled) setIsOwner(profile?.name === artistName);
      })
      .catch(() => {
        if (!cancelled) setIsOwner(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, loading, hasRole, artistName]);

  const canEdit = isOwner === true;

  if (loading) return null;

  if (!canEdit) {
    // Visitante o suscriptor: navegación útil, no controles de administración.
    //
    // RC.33: aquí estaba también un botón "Enviar música" que enlazaba a
    // `/submissions`, y se quitó. No tenía relación con el release que se está
    // mirando —era el portal del usuario metido en la ficha de otra cosa— y
    // además era la cuarta vía al mismo destino: el portal sigue siendo
    // alcanzable desde su propia página y desde el CTA "¿Ya tienes música?"
    // de la vista de suscriptor del dashboard.
    //
    // Si alguna vez hace falta volver a ofrecerlo, el sitio natural es la nav
    // del Header o el dashboard del suscriptor, no esta ficha.
    return (
      <div className="flex flex-wrap gap-3">
        <Link
          href="/artists"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          Explorar el catálogo
        </Link>

        <Link
          href="/shows"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Ver fechas
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status && (
        <span
          data-testid="release-status-badge"
          className={`px-2 py-1 text-xs font-medium rounded ${STATUS_CLASSES[status] ?? STATUS_CLASSES.draft}`}
        >
          {STATUS_LABELS[status] ?? status}
        </span>
      )}

      <Link
        href={`/releases/${releaseId}/edit`}
        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Editar Release
      </Link>

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al Dashboard
      </Link>
    </div>
  );
}
