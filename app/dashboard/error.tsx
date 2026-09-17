"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="text-center max-w-md">
        <div className="mb-6 text-6xl">⚠️</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Error en el Dashboard
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          Ha ocurrido un error inesperado. Por favor, intenta de nuevo.
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg shadow-indigo-500/25"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
