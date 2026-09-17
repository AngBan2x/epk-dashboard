"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="text-center max-w-md">
        <div className="mb-8">
          <span className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
            404
          </span>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Página no encontrada
        </h1>

        <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
          La página que buscas no existe o fue movida.
          <br />
          Verifica la URL o vuelve al inicio.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg shadow-indigo-500/25"
          >
            Volver al Inicio
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Ir al Dashboard
          </Link>
        </div>

        <p className="mt-12 text-xs text-slate-400 dark:text-slate-500">
          PressPlay &mdash; Donde la música se presenta
        </p>
      </div>
    </main>
  );
}
