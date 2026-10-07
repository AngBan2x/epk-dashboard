'use client';

import React from 'react';
import Link from 'next/link';
import SuggestionForm from '@/components/SuggestionForm';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * P4 · Buzón público (`/suggestions`).
 *
 * Anónimo y sin sesión a propósito. `/suggestions` NO está en el `matcher` de
 * `middleware.ts`, así que no exige cookie ni la rechaza. Lo que protege el buzón
 * de verdad es el rol, en el servidor, en `GET /api/suggestions` (401/403) y en
 * el middleware para todo `/admin/:path*`.
 *
 * El enlace de entrada vive en `components/Footer.tsx`, que no es de este
 * subfase: lo cablea quien INTEGRA. Esta página es pública en el sentido de que
 * cualquiera que conozca la URL puede escribir, no en el de que esté enlazada.
 */
export default function SuggestionsPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {/**
         * El mismo `dark:` a medias que las tarjetas del buzon, y por el mismo
         * motivo: `dark:` en el borde y no en el fondo. En oscuro esta franja se
         * quedaba **blanca** entre el header y el degradado violeta, que es lo
         * que hace pensar que la pagina esta a medio pintar.
         *
         * Va escrito a mano en tres paginas —esta, `/admin/suggestions` y
         * `/admin/approvals`— y por eso lo comprueba
         * `tests/unit/dark-mode-pairing.test.ts`.
         */}
        <nav
          aria-label="Migas de pan"
          className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
        <div className="mx-auto max-w-3xl px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-slate-400 dark:hover:text-white"
          >
            <span aria-hidden>←</span> Volver al inicio
          </Link>
        </div>
      </nav>

      <header className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-500">
        <div aria-hidden className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div aria-hidden className="absolute inset-0 bg-black/30" />
        <div className="relative mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Buzón de sugerencias
          </h1>
          <p className="mt-2 text-sm text-white md:text-base">
            ¿Has encontrado un error, te falta alguna información o algo no funciona
            como debería? Cuéntanoslo.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardContent>
            <SuggestionForm />
          </CardContent>
        </Card>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <h2 className="mb-2 text-base font-bold text-slate-900 dark:text-slate-100">
            Cómo funciona
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              No hace falta registro ni cuenta. Si aun así tienes sesión, la usamos
              solo como contexto para el admin.
            </li>
            <li>
              Tu correo solo se usa para responderte. No se comparte con nadie ni se
              publica.
            </li>
            <li>
              Aceptamos <strong>un mensaje por correo cada 24 horas</strong>. Es el
              límite que no castiga a quien comparte conexión en una oficina o una
              facultad, así que si te saltas el aviso es por eso, no por tu IP.
            </li>
            <li>Las sugerencias solo las ve el equipo de administración.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}